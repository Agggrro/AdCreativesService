# Security

> Status: design phase. Run `/security-review` before pushing anything touching
> payments, auth, or the public VAST endpoint.

## Trust boundaries

| Boundary | Who's on the other side | Posture |
| --- | --- | --- |
| Dashboard | Authenticated users | Supabase Auth + RLS; users touch only their own data |
| `GET /api/vast` | The open internet / ad players | Public, unauthenticated, **fail closed** |
| `POST /api/vast/preview` | Signed-in dashboard users | Authenticated (no subscription check); never touches Stripe or the entitlement gate |
| `GET /api/vast/preview/[token]` | Third-party player SDKs (Google IMA, Fluid Player), fetched with no session | Public by necessity; self-authorizing via HMAC signature + 120s expiry, **fail closed** like `/api/vast` |
| `/c/player` (browser) | Whoever pastes a tag into the validator — the creative it names is executed here | Runs `VpaidMode.INSECURE` on an **isolated origin** with no session, no storage and no API of ours; fails closed when none is configured (ADR-0021) |
| `POST /api/stripe/webhook` | Stripe | Signature-verified; treat unsigned/invalid as hostile |
| Creative runtime assets, via `GET /api/creative/{simid,unit}/[token]` | Player iframes and `<script src>` on third-party pages, fetched with no session | Self-authorizing via an HMAC-signed 120s token that names one Storage path from a closed allow-list, re-checked against the calling route's kind; **fail closed** (404) |
| Serving snapshots (Vercel Blob) | Read only by our own functions, never by a player | **Private store, not public.** Keys derive from `creative_id`, which is published in every VAST tag URL a customer pastes into a DSP — a public store would let anyone holding a tag read `user_id` and the full creative config without passing the entitlement gate. Keys are shape-checked as UUIDs before use, so a crafted id cannot become a traversal. See [ADR-0015](decisions/0015-serving-snapshots-on-cdn.md) |
| `GET /api/track` | Player beacons, fired from a VAST doc anyone who has the tag could have fetched | Public by necessity; each beacon URL is HMAC-signed with a 1-hour expiry at VAST-build time — an unsigned or stale hit is silently dropped, same as an unentitled `creative_id` |
| UI language cookie (`creosmith_locale`) | Anyone with a browser — it is user-writable and carries no authority | Treated as untrusted input: validated against the `ru`/`en` allow-list on read and falls back to the default; it only selects a copy dictionary, never gates data, and never reaches the serving path |
| Browser → `creative-media` Storage upload | Signed-in dashboard users, uploading directly to Supabase Storage (no app server in the path) | RLS-gated to the uploader's own `auth.uid()` path prefix (write); bucket is deliberately public-read. Bucket-level `file_size_limit`/`allowed_mime_types` is the authoritative validation gate, not the client. See [ADR-0010](decisions/0010-advertiser-media-uploads.md) |
| `POST /api/tools/vast/inspect`, `GET /api/tools/vast/hop` | The open internet, and **an arbitrary third-party host the caller names** | Public, unauthenticated, no rate limit. This is the only outbound-fetch boundary in the product — see "Outbound fetches to untrusted URLs" below |

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, full DB power, bypasses RLS. Must
  never reach the client bundle or any `NEXT_PUBLIC_*` var. Used only on the serving
  read and webhook write paths.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — server-only.
- `PREVIEW_TOKEN_SECRET` — server-only. Signs the short-TTL live-preview tokens
  (`lib/vast/preview-token.ts`). Independent of the Supabase/Stripe secrets above —
  never derive one from another.
- `TRACK_TOKEN_SECRET` — server-only, optional. Signs tracking-beacon URLs
  (`lib/track-token.ts`). Until it's set, beacon signing derives a key from
  `PREVIEW_TOKEN_SECRET` via HMAC domain separation (a label-keyed KDF, not
  secret reuse) so this shipped without a required new Vercel variable — set a
  dedicated value (`openssl rand -base64 32`) to fully separate the two trust
  domains.
- `BLOB_READ_WRITE_TOKEN` — server-only. Read/write access to the serving-snapshot
  store. On Vercel the SDK authenticates with OIDC instead (`BLOB_STORE_ID` +
  `VERCEL_OIDC_TOKEN`, both injected and rotated by the platform, neither secret), so
  this static token is needed only for code running **outside** Vercel — which today
  means `npm run snapshot:backfill`.
- Public/anon Supabase key is fine client-side **because RLS is enforced** — RLS is
  therefore load-bearing for the dashboard and must be correct (audit with the
  `supabase-rls-auditor` subagent).

### KDF labels are part of the key, so renaming one rotates it

Three signing keys are derived from `PREVIEW_TOKEN_SECRET` with a fixed label —
`creosmith:track-token:v1`, `creosmith:interactive-token:v1`,
`creosmith:vast-hop-token:v1`. The label is an input to the HMAC, so **editing the
string is a key rotation**, whatever the reason for the edit. It was edited once
already, when the product was renamed from AdInteract.

What a rotation costs is bounded, and worth stating precisely so the next rename does
not get talked out of a correct change by an imagined one:

- **A VAST tag already pasted into a DSP is unaffected.** `/v?creative_id=…` carries no
  signature; the tokens live *inside* the response and are minted fresh on every build
  (`builder.ts` → `signTrackToken`, `storage.ts` → `signInteractiveToken`). No tag needs
  reissuing.
- **Only tokens in flight at deploy break** — beacons up to their 1-hour TTL, interactive
  creative URLs up to 120s. The effect is undercounted events in that window, and it
  fails closed (a dropped beacon), never open.
- **`TRACK_TOKEN_SECRET`, when set, bypasses its label entirely** — that derivation is
  the fallback path only. A deploy that has the dedicated secret provisioned loses
  nothing at all on the tracking key.

Bump the `:v1` suffix deliberately if a real rotation is ever wanted; do not rely on a
rename to do it.

## Public VAST endpoint hardening

- **Fail closed:** any error, missing data, or ambiguity → empty/fallback VAST, never
  the payload.
- **Input validation:** validate `creative_id` shape before any DB call; reject junk
  early. Treat all query params/macros as untrusted.
- **No RLS reliance:** there is no session here. Use a service-role client scoped to a
  single narrow read of the denormalized serving record — nothing else.
- **No Stripe calls / no heavy joins** on this path (perf + blast radius).
- **Rate limiting / abuse:** plan for per-IP / per-creative limits and cache to absorb
  spikes (post-MVP hardening, but design for it). Applies to `POST /api/vast/preview`
  too: it requires a session (a materially higher bar than the fully public
  `/api/vast`) but has no subscription check and no rate limit today, so a scripted
  client could re-mint indefinitely against any published template.

## Tracking beacon hardening (`/api/track`)

- **Signed, not just shape-validated.** A `creative_id` is visible in plain sight
  in the VAST tag URL a customer pastes into their DSP, so validating its UUID
  shape alone does not stop a third party from hitting `/api/track?cid=<their
  tag's id>&e=impression` directly, inflating a competitor's or a customer's own
  funnel numbers — numbers that now feed a customer-facing dashboard
  (`public.get_creative_overview`). Every beacon URL the VAST builder emits
  carries an HMAC signature over `(creative_id, event, exp)`
  (`lib/track-token.ts`); the route drops any hit whose signature doesn't
  verify or whose `exp` has passed.
- **Expiry is generous on purpose (1 hour, not the preview token's 120s):** a
  beacon must stay valid for the full lifetime of one ad play — buffering, a
  slow connection, and (since ADR-0009) a creative that has no fixed end time
  at all and stays live until the viewer closes it — not just until the VAST
  document is fetched.
- **Still fail silent, not fail loud:** an invalid signature drops the beacon
  with the same 204 as a valid one processed successfully. This endpoint has
  always been fire-and-forget for the player; a signature failure must not
  become a visible error a player surfaces to a viewer.
- **Known residual gap:** signing stops *forgery* (minting a beacon without
  ever having seen a real one), not *replay* of a beacon someone actually
  captured from a live VAST response. Rate limiting per `(creative_id, event)`
  is the next layer if replay abuse is observed; not implemented yet.

## Preview endpoint hardening (`/api/vast/preview*`)

- **Fail closed identically to `/api/vast`:** any bad/expired/tampered/malformed
  token → `emptyVast()`, HTTP 200, never a differentiated error (an attacker
  shouldn't be able to distinguish "bad signature" from "expired" from "unknown
  template").
- **Constant-time signature check:** `crypto.timingSafeEqual`, not `===`.
- **No cross-user config leakage by construction:** the mint endpoint takes the
  config directly in the request body (the caller's own in-memory form state) and
  never accepts or looks up a `creative_id` — it cannot become a side-channel onto
  another user's saved creative.
- **Input validation even though the caller is authenticated:** POSTed field
  values are run through `parseConfigSchema` + `buildConfigFromValues` — the very
  same function `createCreative` uses, not a parallel implementation — before being
  embedded in the token, and the serialized token payload is size-capped (5120
  bytes of config under a 6144-byte payload cap, so an oversized config gets a 413
  rather than the uncaught throw the signer would otherwise raise).
- **Fields switched off by `showWhen` are pruned server-side**, regardless of what
  the client posts. The panel sends the whole form state, including values for
  fields the user has since hidden, so this is what keeps the preview honest about
  what Save would write — and keeps a switched-off branch off the serving path
  ([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)).
- **No new escaping obligation:** `<AdParameters>` is still wrapped in `cdata()`
  over the whole JSON string, same as the real endpoint.
- **Data minimization:** the token carries only what `resolveInteractiveUrl`/
  `buildInlineVast` need (template id, format, config, runtime key, a random
  preview id, expiry) — nothing tying it to the minting user.

## Outbound fetches to untrusted URLs (`/api/tools/vast/*`)

The VAST validator ([ADR-0014](decisions/0014-vast-inspection-engine.md)) fetches
a URL the caller chose. It is the **only** place in this codebase that does so —
everything else talks to Supabase, Stripe, or ourselves — which makes
[`lib/vast-inspect/fetch-tag.ts`](../lib/vast-inspect/fetch-tag.ts) the product's
entire SSRF surface. Any future feature that fetches a user-supplied URL should
go through it rather than reimplement these guards.

- **Scheme allow-list.** `http:` and `https:` only. `file:`, `gopher:`, `data:`
  and everything else are rejected before any work is scheduled.
- **Address classification.** Every resolved address must be publicly routable.
  Loopback, RFC1918, link-local (which is what makes `169.254.169.254` cloud
  metadata unreachable), CGNAT, multicast, reserved, IPv6 unique-local and the
  documentation ranges are all refused. IPv4-mapped and NAT64 IPv6 addresses are
  unwrapped and judged on their embedded v4 address, so `::ffff:127.0.0.1` is
  blocked for the right reason rather than by accident.
- **The check governs the socket, not a pre-flight.** A naive validator resolves
  the hostname, approves it, then hands the URL to `fetch()` — leaving a window
  in which the second resolution returns `127.0.0.1`. That is DNS rebinding, and
  it is why the guard is installed as the request's own `lookup` function: the
  connection can only be made to an address that already passed. TLS still sees
  the hostname, so certificate validation is unaffected. A host that answers with
  one public and one private address is refused outright rather than having the
  public one picked.
- **Per-hop caps.** 5 s deadline, 512 KB (streamed, aborted at the cap), 5 HTTP
  redirects, 5 wrapper hops. Every redirect target is fully re-validated — the
  scheme may have changed and the host certainly has.
- **Cycle detection.** A wrapper chain that revisits a URL is stopped and
  reported rather than followed until the hop limit.
- **Failing closed.** `/hop` answers an empty VAST for any problem — bad
  signature, expired token, unreachable host, blocked address — with no
  differentiation between them, matching `/api/vast`'s posture.

`/hop` carries its target inside an HMAC-signed token rather than an open query
parameter, so the route is not a general-purpose proxy. That signature is **not**
the SSRF control: the fetcher re-validates every address regardless of how the
URL arrived. It is what stops the route being useful to anyone but us.

**Rate limiting is absent here, deliberately, and this is the surface that makes
the standing gap real.** Access is open by product decision (ADR-0013). Nothing
is persisted, so the exposure is compute and egress rather than data, and the
per-request caps bound the cost of any single call — but not the number of calls.
`/api/tools/vast/void` is a bare 204 with no state and is not a concern; `inspect`
and `hop` both perform outbound work and are.

**Nothing submitted is stored.** No table, no bucket, no log of tags. The
inspection report lives in the caller's page and the state a hop needs travels in
its signed token. `/void` records nothing on purpose: logging would mean holding
fragments of other companies' ad tags.

## Running a stranger's creative (`/tools/vast-validator`)

The section above is the validator's *server* surface. This is its client one, and it
is the larger of the two.

The validator does not merely parse a tag — it plays it, through Google IMA, with
`VpaidMode.INSECURE`. That is not a lapse: **every production player that runs VPAID at
all runs it this way**, and a validator that sandboxed the unit would report a success
the tag will never actually have. Fidelity is the entire product.

INSECURE means IMA executes the VPAID JavaScript in the **hosting document's own
origin**. So the hosting document is not the app.

**The player runs in an iframe on an isolated origin**
([ADR-0021](decisions/0021-validator-player-on-an-isolated-origin.md)). `app/c/player`
is that page; `getSandboxUrl()` in [`lib/site.ts`](../lib/site.ts) resolves where it
lives — `NEXT_PUBLIC_SANDBOX_URL`, else the ad domain of
[ADR-0018](decisions/0018-dedicated-ad-serving-domain.md), else, in local development
only, the loopback twin (`localhost` ↔ `127.0.0.1`). A hostile unit therefore reaches
an origin that carries no session of ours, no `localStorage` of ours, and no API of
ours. Dry-run is not what protects here and never could be: `neutralize.ts`
deliberately leaves `MediaFile` intact, because rewriting the ad itself would mean not
testing the ad.

- **It fails closed.** With no cross-origin home configured the stage refuses to run and
  the page says why. Falling back to the app origin would be a control whose absence
  looks like success, which is the one failure mode a boundary may not have.
- **The channel is origin-pinned both ways.** `targetOrigin` is never `*` once the peer
  is known, and every inbound message is checked against the expected origin *and* the
  expected `source` window — origin alone is not enough, because the page hosts IMA's
  own frames. The single exception is the frame's opening `ready` ping, which carries no
  data and exists because a frame cannot know its parent's origin before being told.
  Same discipline as the creative telemetry channel (ADR-0019), one boundary out.
- **`frame-ancestors` on `/c/player`** (next.config.ts) stops anyone else embedding it
  and inheriting a ready-made VPAID execution surface pointed at our domain.
- **`allow="autoplay"` is deliberate.** Transient user activation does not cross into a
  cross-origin frame, so the click that starts a run is delegated explicitly.

The trade this makes: the app page can no longer instrument the player, because the
same-origin policy that stops a creative reading our page stops our tooling reading the
frame. The frame therefore reports what it *did* — `contentPlaying`, `contentPaused`,
`contentBlocked`, source `validator` — beside what IMA asked for. A timeline showing
only the request is what made the original content-resume fault look like a mystery.
## Creative payload protection (see ADR-0003)

We provide **access control, not secrecy of client code**. Layers: dynamic VAST
kill-switch, short-TTL signed URLs, server-side config injection, obfuscation. We
never claim creative JS is unrecoverable. (Domain/referer allow-listing was listed
here for a long time and never existed — dropped, see ADR-0003.)

**The two interactive assets are protected differently, and the asymmetry is
deliberate** — see [ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md).

**The VPAID unit is a public, immutable CDN object.** Anyone holding the URL can
fetch it indefinitely, and that is accepted rather than overlooked: the file is our
own template code, identical for every advertiser using that template. The
advertiser's configuration is injected at serve time through `<AdParameters>` and
is not in the file, so the kill-switch still bites — a lapsed subscription yields
empty VAST, no `<AdParameters>`, and the retained URL returns an anonymous
template. ADR-0003 already refuses to claim the code is unrecoverable. The residual
exposure is bandwidth (hotlinking), the same one ADR-0010 accepted for the public
`creative-media` bucket.

**The SIMID document is still one hop indirect**, reached through our own route
with an HMAC-signed, 120s-TTL token (`lib/vast/interactive-token.ts`). The token
authorizes exactly one object path, matched against a closed list of shapes per
kind — `^[a-z0-9_-]+/simid/index\.html$` for SIMID,
`^[a-z0-9_-]+/(?:vpaid\.js|vpaid/unit\.js)$` for VPAID (still used by the fallback
route) — as defense in depth against a token ever being minted for something
outside `runtime/`. **The kind is re-checked against the calling route's own
pattern**, so a token minted for a SIMID document cannot be replayed against the
VPAID route and re-served as executable JavaScript, or the reverse.

- `GET /api/creative/simid/[token]` exists because Supabase Storage forces
  `.html` objects to `text/plain` with `Content-Security-Policy: sandbox` (no
  `allow-scripts`) — a platform-level anti-XSS-hosting policy that can't be
  turned off per bucket, and that silently breaks the SIMID postMessage handshake
  if the player loads that URL directly. The route downloads the object
  service-role and re-serves it as `text/html` with a CSP that allows the
  (first-party, static) inline script/style but keeps `default-src 'none'`. This
  document is never advertiser-controlled today; if that ever changes, this
  route's CSP needs re-review before it does.
- `GET /api/creative/unit/[token]` exists for a different reason — availability,
  not correctness. `createSignedUrl` is a network call to Supabase, and it used
  to sit on the VAST generation path ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md)).
  It re-serves the unit as `application/javascript` with `nosniff`, and carries
  no CSP: the unit executes in the player's document, where our header would
  govern nothing.

This does not weaken ADR-0003's lever. The URL is still signed and still expires
in 120s; only the signer changed, from Supabase to us.

**The OMID verification pass-through (ADR-0012) does not change this.** A
SIMID creative's `verificationScriptUrl` (advertiser-supplied) only ever
reaches the VAST `<AdVerifications>` node — never this route, never this
document. Per IAB's OMID Web Implementation Guide, a verification script
loads into a sandboxed context the *video player* manages, not into the
creative's own iframe, so there is no path by which the vendor's script
reaches `runtime/shoppable/simid/index.html`. The "never advertiser-controlled
today" statement above stays literally true after this change.

## RLS scope

RLS protects the authenticated dashboard path only. The serving path deliberately
bypasses it via a scoped service-role read. Both facts must stay true together: if RLS
weakens, the dashboard leaks; if the service-role read widens beyond the serving
record, the blast radius of the public path grows. Keep both tight.

The `creative-media` Storage bucket's public-read is a deliberate, documented
exception to "RLS protects the dashboard path" — reads are meant to be public (any
viewer's ad player fetches the URL with no session), so `public = true` bypassing
RLS for GETs is correct here, not a gap. The same class of exception as
`templates_select_published`. Writes stay RLS-gated to the uploader's own path.

## Developer-only surfaces (`isDevOnlyEnabled()`)

Three routes exist for local creative work and **must not be reachable anywhere else**:
`GET /api/dev/session` (signs in a local test account), `GET /api/dev/unit/[template]`
(serves a unit off local disk), and the `/dev/harness` page.

The gate is `lib/dev-only.ts`. `isDevOnlyEnabled()` answers *"is this a development
build"* — `NODE_ENV !== "production"` and no `VERCEL` env var, which excludes preview
deployments too (they run with `NODE_ENV=production` but are publicly reachable URLs).

**That question is not the same as "can anyone else reach this", and the difference is
the one that bites.** `next dev` binds `0.0.0.0` by default and prints a LAN address on
startup, and this product routinely needs a public tunnel so a third-party player or DSP
can fetch a tag. In all of those the build is still "development" while the port is open
to the network — and `/api/dev/session` hands out a real session.

**The control is the listener, not a header.** `npm run dev` and `npm run dev:https` both
pass `-H 127.0.0.1`, so the dev server accepts nothing but loopback connections and there
is no request from anywhere else to judge.

`isLocalHeaders()` / `isLocalRequest()` — a loopback `Host`, plus loopback values in
`x-forwarded-host` and `x-forwarded-for` where present — is the **second** lock, and its
limit is worth stating plainly because it is easy to over-trust: every value it reads is a
request header, and Next passes a client-supplied `Host` and `X-Forwarded-For` through
rather than overwriting them. Verified against the running server —
`curl -H "Host: localhost:3000" -H "X-Forwarded-For: ::1"` satisfies every check no matter
where it originated. It stops the accidental case (a browser opened at the LAN address, a
proxy or tunnel in front, which send honest headers), not a deliberate one.

**So never re-expose the dev server to a network on the strength of that check.** Running
`next dev -H 0.0.0.0` for cross-device testing makes `/api/dev/session` reachable by
anyone who can route to the port; clear `DEV_LOGIN_*` from `.env.local` before doing it,
which 404s the route outright.

A gate failure answers **404, not 403**: these should not exist even as something to probe
for. (A *credential* failure on the session route is a different thing and answers 401 with
a hint naming the missing account — the gate has already passed, and that response only
ever renders on loopback.)

Notes that bind any change here:

- **`/api/dev/session` is not an auth bypass.** It calls the same `signInWithPassword` the
  login form calls, against an account a developer created themselves, and yields an
  ordinary session — same cookie, same RLS, same expiry. Minting a session another way
  would let bugs in the real login path go unnoticed. `DEV_LOGIN_*` must never be set in
  Vercel and must never name a real user's account.
- **It is a state-changing GET, so it checks `Sec-Fetch-Site`.** Reachable by plain
  navigation means any page can send a developer's browser here and silently swap the
  session they are testing under — a top-level navigation carries cookies whatever
  `SameSite=Lax` says. `same-origin` and `none` (a typed or bookmarked URL) are allowed;
  `cross-site` 404s.
- **Its `next` parameter is resolved, not pattern-matched.** Prefix checks are the wrong
  tool for an open redirect: `//host` is protocol-relative, and so is `/\host`, because
  WHATWG treats `\` as `/` in a special scheme. Resolve against a base and compare
  origins. This endpoint hands out a session *and* a redirect, so an open redirect here is
  a login-and-bounce in one URL.
- **`/api/dev/unit/[template]` cannot traverse.** The path segment goes through
  `isPreviewUnitKey()` — `hasOwnProperty` against a closed allow-list — before it is used.
  A bare `TABLE[key]` index is not sufficient: an object literal answers `constructor`,
  `toString` and `__proto__` from its prototype chain, so the guarantee would rest on
  there happening to be no strings on `Object.prototype`. Never resolve a filesystem path
  from the URL directly.
- **`/api/dev/*` is excluded from the middleware matcher**, so `updateSession()` does not
  write session cookies on the same response the session route writes its own.
- **Adding a fourth dev surface means using the same gate**, not a new ad-hoc check.

## Creative telemetry channel (ADR-0019)

The VPAID runtime posts its lifecycle to `postMessage` with `targetOrigin` set to the
origin it was served from. **That argument is the entire access control**: in production
the top frame is the publisher's page, the origin does not match, and the browser drops
the message before delivery — so a creative cannot leak its state to the page hosting it.

- **Never widen it to `"*"`.** A need to reach a genuinely different origin is a new
  decision, not a parameter change.
- **Receivers check `event.origin` as well.** The sender's argument stops our records
  reaching the wrong page; only the receiver's check stops someone else's messages being
  taken for ours. `subscribeToCreativeTelemetry` does both.
- **Nothing is collected server-side**, and adding an endpoint that did would be a
  privacy decision in its own right — the records originate in a third-party context.

## Web analytics and Speed Insights (Vercel)

`@vercel/analytics` and `@vercel/speed-insights` are mounted together, once, in the root
layout. They are the only third-party scripts our own pages load. Where they may run, and
what they are allowed to see:

- **App domain only.** The ad domain renders through that same root layout (`/cdn`, plus
  the `/cdn/blocked` catch-all every other path there rewrites to), so both mounts sit
  behind one gate on the request host — the same comparison
  [`middleware.ts`](../middleware.ts) makes before it declines to set a cookie
  ([ADR-0018](decisions/0018-dedicated-ad-serving-domain.md)). The host that appears inside
  strangers' VAST tags loads no script and reports nothing; its catch-all rewrite admits
  the ad paths and nothing else, so it would swallow the beacons in any case.
- **Never on the serving paths.** `/v`, `/t` and `/c/*` are API routes returning XML,
  JavaScript and beacons — no HTML, no layout, no script. A creative running inside a
  publisher's player cannot carry either of these onto their page.
- **Cookie-less and first-party.** In production both scripts and both beacons are served
  from our own origin; no request leaves for a third-party host. Not from the fixed
  `/_vercel/insights/*` and `/_vercel/speed-insights/*` routes, though — those answer, but
  what the browser actually loads is an opaque first-party path on the same origin, which
  is how these SDKs get past content blockers. The host gate does not depend on which of
  the two it picks: it removes the mount, so there is no request to route either way.
- **The beacons carry the real path, not just the route pattern**, so a dashboard URL
  reaches Vercel with a creative id in it. That is the party already terminating every
  request to the app, not a new one — but it is why the mounts are gated by host rather
  than global.
- **Page views and Web Vitals only.** No `track()` custom event is sent today. Adding one
  is a decision about what leaves the browser, not a call-site detail.
- **Speed Insights measures our pages, never a creative.** Vitals come from the app's own
  documents; a VPAID unit runs in the player's cross-origin iframe, which this cannot see
  and must not be extended to see. Creative-side measurement is the telemetry channel
  above ([ADR-0019](decisions/0019-creative-telemetry-channel.md)) and viewability is
  [ADR-0012](decisions/0012-viewability-measurement.md) — three separate mechanisms, on
  purpose.

## Pre-push checklist (security-sensitive changes)

- [ ] No secret in client bundle / `NEXT_PUBLIC_*`.
- [ ] Webhook verifies signature against raw body.
- [ ] VAST path validates input and fails closed.
- [ ] RLS policies cover new tables/columns (or explicit, documented exception).
- [ ] Any new outbound fetch of a user-supplied URL goes through
      `lib/vast-inspect/fetch-tag.ts` — not a bare `fetch()`.
- [ ] Any new developer-only route is behind `isDevOnlyEnabled()` and answers 404.
- [ ] No `postMessage` from the creative runtime with a widened `targetOrigin`.
- [ ] `/security-review` run and findings addressed.

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
| `POST /api/stripe/webhook` | Stripe | Signature-verified; treat unsigned/invalid as hostile |
| Creative runtime assets | Player iframes on third-party pages | Signed, short-TTL, domain/referer allow-listed |
| `GET /api/track` | Player beacons, fired from a VAST doc anyone who has the tag could have fetched | Public by necessity; each beacon URL is HMAC-signed with a 1-hour expiry at VAST-build time — an unsigned or stale hit is silently dropped, same as an unentitled `creative_id` |
| UI language cookie (`adinteract_locale`) | Anyone with a browser — it is user-writable and carries no authority | Treated as untrusted input: validated against the `ru`/`en` allow-list on read and falls back to the default; it only selects a copy dictionary, never gates data, and never reaches the serving path |
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
- Public/anon Supabase key is fine client-side **because RLS is enforced** — RLS is
  therefore load-bearing for the dashboard and must be correct (audit with the
  `supabase-rls-auditor` subagent).

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

## Creative payload protection (see ADR-0003)

We provide **access control, not secrecy of client code**. Layers: dynamic VAST
kill-switch, short-TTL signed URLs, domain/referer allow-lists, server-side config
injection, obfuscation. We never claim creative JS is unrecoverable.

**SIMID's signed URL is one hop indirect.** Supabase Storage forces `.html`
objects to `text/plain` with `Content-Security-Policy: sandbox` (no
`allow-scripts`) — a platform-level anti-XSS-hosting policy that can't be
turned off per bucket, and that silently breaks the SIMID postMessage
handshake if the player loads that URL directly. `GET /api/creative/simid/[token]`
(`app/api/creative/simid/[token]/route.ts`) exists to work around it: an
HMAC-signed, 120s-TTL token (`lib/vast/interactive-token.ts`) authorizes
exactly one Storage object path, matched against `^[a-z0-9_-]+/simid/index\.html$`
as defense in depth against the token ever being minted for something outside
`runtime/*/simid/index.html`. The route downloads that object service-role and
re-serves it as `text/html` with a CSP that allows the (first-party, static)
inline script/style but keeps `default-src 'none'`. This document is never
advertiser-controlled today; if that ever changes, this route's CSP needs
re-review before it does.

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

## Pre-push checklist (security-sensitive changes)

- [ ] No secret in client bundle / `NEXT_PUBLIC_*`.
- [ ] Webhook verifies signature against raw body.
- [ ] VAST path validates input and fails closed.
- [ ] RLS policies cover new tables/columns (or explicit, documented exception).
- [ ] Any new outbound fetch of a user-supplied URL goes through
      `lib/vast-inspect/fetch-tag.ts` — not a bare `fetch()`.
- [ ] `/security-review` run and findings addressed.

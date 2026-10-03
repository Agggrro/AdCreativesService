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
| Creative runtime assets, via `/c/s/:token` on the ad Worker and `GET /api/creative/{simid,unit}/[token]` | Player iframes and `<script src>` on third-party pages, fetched with no session | Self-authorizing via an HMAC-signed 10-minute token that names one runtime path from a closed allow-list, re-checked against the calling route's kind; **fail closed** (404) |
| The ad domain (`creosmith-ads` Worker) | The open internet, on every path of `smithcdn.net` | Answers the ad paths through the same handlers as the app, 404s everything else, and **forwards only** `/`, `/cdn…`, `/c/player` and `/_next/…` to the app's Worker (over a service binding), GET and HEAD only — so no dashboard, auth or API route, and no server action, is reachable on the ad domain. `Set-Cookie` is stripped from every response; the zone adds none after it, because Bot Fight Mode, Browser Integrity Check and challenges stay off on this zone. `/c/u/…` forwards only a content-addressed runtime **script** (`RUNTIME_SCRIPT_KEY_RE`) to the media host — never an advertiser's object, never the SIMID document, never an arbitrary path. The app's own `/c/u/` rewrite (`next.config.ts`) is held to the same pattern. See [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md) |
| The app domain (`creosmith-web` Worker) | The open internet, on every path of `creosmith.com` | Every route the app has, behind the Workers Route `creosmith.com/*`. The zone adds HSTS (`max-age=63072000`, as Vercel sent it), TLS 1.2 at least, Always Use HTTPS, and a 308 from `www` to the bare domain. **No challenge in front of it either:** Stripe and partner networks' servers call `/api/stripe/webhook` and `/pb`, not always with a browser's User-Agent, which Browser Integrity Check refuses — so it, Bot Fight Mode and the security level's challenges stay off, as nothing stood in front of the app on Vercel. Each of those routes authenticates its caller itself. See [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md) |
| Serving snapshots (Workers KV) | Read only through the two Workers' bindings, never by a player | **No public URL exists for KV**: a document is readable only through a binding or an API token. That property matters because keys derive from `creative_id`, which is published in every VAST tag URL a customer pastes into a DSP — a public store would let anyone holding a tag read `user_id` and the full creative config without passing the entitlement gate. Keys are shape-checked as UUIDs before use, so a crafted id cannot become a traversal. Until the app leaves Vercel it also writes the private Blob store it used before. See [ADR-0015](decisions/0015-serving-snapshots-on-cdn.md), [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md) |
| `GET /api/track` | Player beacons, fired from a VAST doc anyone who has the tag could have fetched | Public by necessity; each beacon URL is HMAC-signed with a 1-hour expiry at VAST-build time — an unsigned or stale hit is silently dropped, same as an unentitled `creative_id` |
| `GET /r` (click redirect) | A viewer's browser leaving an ad, from a link anyone holding the tag could have fetched | Public by necessity. The destination is read from the creative's own config by field name, never from the request, **and only a genuine signature minted by `/v` gets a redirect** — forged, missing or week-old links are 404, so no account can use the ad domain as a redirect to what it configured. See "Click redirect and postbacks" below |
| `GET\|POST /pb` (postback) | A partner network's server | Authenticated only by the account's postback key in the URL; a wrong key writes nothing. See "Click redirect and postbacks" below |
| UI language cookie (`creosmith_locale`) | Anyone with a browser — it is user-writable and carries no authority | Treated as untrusted input: validated against the `ru`/`en` allow-list on read and falls back to the default; it only selects a copy dictionary, never gates data, and never reaches the serving path |
| Browser → R2 media upload (`requestMediaUpload`, then a PUT to R2) | Signed-in dashboard users, uploading straight to Cloudflare R2 with a presigned URL (no app server in the byte path) | The server action is the gate: it checks the session, the MIME allow-list (`Object.hasOwn`, so no prototype names) and the 25 MB cap, mints the key under the caller's own prefix, and signs **type and size** into a 5-minute URL — R2 answers any other body `403`. The browser never names the key. The bucket is deliberately public-read, at `media.smithcdn.net`. See [ADR-0028](decisions/0028-creative-media-on-r2.md) |
| Browser → `creative-media` Storage upload | Signed-in dashboard users, uploading directly to Supabase Storage — only on a deployment without the R2 variables | RLS-gated to the uploader's own `auth.uid()` path prefix (write); bucket is deliberately public-read. Bucket-level `file_size_limit`/`allowed_mime_types` is the authoritative validation gate, not the client. See [ADR-0010](decisions/0010-advertiser-media-uploads.md) |
| `POST /api/tools/vast/inspect`, `GET /api/tools/vast/hop` | The open internet, and **an arbitrary third-party host the caller names** | Public, unauthenticated, no rate limit. This is the only outbound-fetch boundary in the product — see "Outbound fetches to untrusted URLs" below |

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, full DB power, bypasses RLS. Must
  never reach the client bundle or any `NEXT_PUBLIC_*` var. Used only on: the serving
  read (`/v`, in the ad Worker and the Next route alike) and its Storage fallback for a
  unit not yet in the manifest (`lib/runtime-bytes.ts`); the beacon, click and postback
  writes; the Stripe webhook
  write path; serving-snapshot publishing, its health check and its reconciler
  (`lib/serving/publish.ts`, `lib/serving/health.ts`, `lib/serving/reconcile.ts`,
  `/api/cron/health`, `/api/cron/reconcile`, `scripts/snapshot-backfill.mjs`); the
  one-off media move to R2, which reads every creative and rewrites the config of each
  one it moves (`scripts/media-migrate-r2.mjs`, [ADR-0028](decisions/0028-creative-media-on-r2.md));
  and, on loopback only, `/dev/harness`'s read of draft templates (below). A new use is a
  change to this list.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — server-only.
- `CRON_SECRET` — server-only. The bearer `/api/cron/health` and `/api/cron/reconcile`
  demand (constant-time compare, `lib/cron-auth.ts`); both refuse to run without it. It
  authorizes service-role jobs that read across every tenant, write the snapshot stores
  and answer with tenant ids. The web Worker's cron sends it in-process, so it never
  crosses the network there.
- `PREVIEW_TOKEN_SECRET` — server-only. Signs the short-TTL live-preview tokens
  (`lib/vast/preview-token.ts`). Independent of the Supabase/Stripe secrets above —
  never derive one from another.
- `TRACK_TOKEN_SECRET` — server-only. Signs tracking-beacon URLs and click links
  (`lib/track-token.ts`). Set since 2026-10-03; before that, beacon signing derived a
  key from `PREVIEW_TOKEN_SECRET` via HMAC domain separation (a label-keyed KDF, not
  secret reuse), which the code still does when it is unset.
- **Where these live.** Since ADR-0029 the signing secrets (`PREVIEW_TOKEN_SECRET`,
  `TRACK_TOKEN_SECRET`) and `SUPABASE_SERVICE_ROLE_KEY` are held twice: as secrets of
  each Worker (`wrangler secret put`, read through `process.env`). **The copies must be
  equal** — a beacon or click link minted by one Worker is verified by the other — so
  they change together or not at all. Vercel stored them write-only, which is why the
  move rotated both signing secrets once rather than copying them, and why the Stripe
  webhook got a new endpoint with a new secret ([billing.md](billing.md)).
- `SNAPSHOT_KV_API_TOKEN` — server-only. A Cloudflare API token holding **Workers KV
  Storage: Edit on the account and nothing else**, for writing snapshots from outside
  a Worker: the Node scripts and `npm run dev`. It can
  read and rewrite every serving snapshot — which is to say, decide whether a tag
  serves — so it is as sensitive as the service-role key's write to the same rows.
  `lib/serving/kv.ts` sends it only to `api.cloudflare.com` and never logs it. Roll it
  in the Cloudflare dashboard if it leaks. `CLOUDFLARE_ACCOUNT_ID` and
  `SNAPSHOT_KV_NAMESPACE_ID` beside it are identifiers, not secrets.
- `CLOUDFLARE_API_TOKEN` — **CI and the operator's machine only, never the app.** The
  deploy token for both Workers: Workers Scripts and KV edit on the account, Workers
  Routes, DNS and certificates on the two zones, and nothing else. It is a GitHub
  Actions secret for the deploy job and a line in `.env.local`; no Worker and no
  deployment of the app holds it.
- `R2_SECRET_ACCESS_KEY` — **server-only**. With `R2_ACCESS_KEY_ID`, the S3 credential
  of a Cloudflare token with object read and write on the `creative-media` R2 bucket and
  nothing else in the account ([ADR-0028](decisions/0028-creative-media-on-r2.md)).
  Leaked, it can overwrite or delete any advertiser's media — which is all public
  already, so it reads nothing new. Since ADR-0029 the creative runtime shares the bucket
  under `runtime/`, and that prefix is **locked**: an indefinite R2 bucket lock rule
  (`runtime-immutable`) refuses any overwrite or delete of an existing unit, whoever
  holds the key (`409 ObjectLockedByBucketPolicy`, verified). A leaked key can add
  objects there, which no tag names — the committed manifest decides what is served,
  and `runtime:push` checks each served unit's bytes against its hash.
  Used only by `lib/r2.ts`: signing uploads (`requestMediaUpload`), `deleteCreative`,
  `npm run media:migrate`, and `npm run runtime:push`. The remedy
  for a leak is to roll the token in the Cloudflare dashboard. The access key id is
  not a secret — every presigned upload URL carries it in `X-Amz-Credential` — and
  neither are `R2_ACCOUNT_ID`, `R2_BUCKET` and `NEXT_PUBLIC_MEDIA_URL`.
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
  creative URLs up to 10 minutes. The effect is undercounted events in that window, and it
  fails closed (a dropped beacon), never open.
- **Click links are the exception, and they fail visibly** ([ADR-0023](decisions/0023-conversion-postbacks.md)).
  They are signed with the same key but redirect only on a genuine signature, so after a
  rotation every click link still on a screen or in a cached tag is a `404` for the
  viewer — for up to its eight-day life, though in practice for the minutes an ad stays
  up, since `/v` mints fresh links on every fetch. Rotate off-peak.
- **`TRACK_TOKEN_SECRET`, when set, bypasses its label entirely** — that derivation is
  the fallback path only. A deploy that has the dedicated secret provisioned loses
  nothing at all on the tracking key once it is in place — but **provisioning it is itself
  a rotation**, with the click-link cost above.

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
- **CORS echoes the origin, with credentials — safe only because nothing here reads
  them.** VAST 4.2 requires `Access-Control-Allow-Origin: <Origin>` plus
  `Access-Control-Allow-Credentials: true` (`lib/vast/cors.ts`,
  [ADR-0026](decisions/0026-vast-cors-credentialed-requests.md)). The usual danger of that
  pair — any site reading a response made with the visitor's cookies — does not arise:
  `/v`, `/api/vast` and the preview route read no cookie and no session on any host, and
  the ad domain never sets one. That is a property to keep, not an accident: a route that
  ever reads a session or a cookie must not use this helper. `null` is never echoed (it
  gets `*` without credentials — every sandboxed frame shares it), and a value that is not
  a serialized origin is treated as absent.
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

## Click redirect and postbacks (`/r`, `/pb` — ADR-0023)

- **The request cannot point `/r` anywhere.** The link carries `cid` and a field *name*;
  the destination comes from the creative's config (snapshot, then Postgres) and only for
  a field in `click_fields`, and it must be an absolute http(s) URL. A field that no longer
  resolves falls back to the creative's own `clickThroughUrl`, never to anything in the
  request. The only request data that reaches the `Location` header is the macro values
  we mint ourselves — the click id, the creative id and the field name — each
  `encodeURIComponent`-ed, and the result is normalized through `URL` (punycode host,
  percent-encoded path), since a header carries Latin-1 only.
- **But the owner's config is not trusted either — signing up is free.** Without more,
  any account could configure a phishing page and hand out `/r?cid=…` as a redirect from
  our ad domain, and a domain on a blocklist takes every customer's tag down with it. So
  `/r` redirects only on a **genuine signature**, which only `/v` mints and only for a
  creative that may serve: fresh (≤ 24 h) redirects and records, stale (≤ 7 more days)
  redirects without recording, anything else — forged, missing, older — is `404`. A
  lapsed account's links therefore stop redirecting within eight days of its last served
  tag. The signature also covers the creative's **owner**, checked against the creative as
  read at click time: an authenticated client can insert a creative with an id of its
  choosing, so once a creative is deleted its id can be re-registered by another account,
  and links collected while the old one was live then fail rather than redirect to the
  newcomer's URL.
- **Signed under the beacon key, domain-separated.** `/r` signs `r:<field>` with
  `signTrackToken`; `/t` accepts only its three event names and `/r` only `r:<field>`, so
  neither route accepts the other's signature. The same residual gap as the beacons
  applies, and it is sharper here: anyone who fetched a tag holds day-long signed click
  links and can replay them. That can dilute click counts and CR — bounded by
  `record_click()`'s 600 per creative per minute, and a flood past that cap denies that
  minute's genuine clicks their ids. It cannot create a conversion. **A per-IP rate limit
  on `/r` and `/pb` is the recommended next layer** — since ADR-0029 a Cloudflare rate
  limiting rule on each zone, and on the ad domain a **block** rule, never a challenge: a
  challenge sets a cookie on the ad domain and breaks the players fetching from it. It is
  configuration, and not yet set.
- **Crawlers get the redirect, not a click.** Known bot, scanner and HTTP-library user
  agents (`isLikelyBot()`), HEAD requests and stale links are redirected identically —
  varying the answer by user agent would read as cloaking — but mint no id and write no
  row. `no-store` on every response: a cached 302 would give the next viewer the
  previous one's click id.
- **No IP address is stored.** A click keeps its creative, exit, time, and a two-letter
  country from the platform's geo header.
- **Script-capable click destinations never reach a tag.** `<input type="url">` accepts
  `javascript:` and `data:` — they are valid URLs — so `coerceFieldValue` refuses them at
  save and the VAST builder drops any already stored. On a player that `window.open`s a
  click-through inside the publisher's page, such a destination is script in someone
  else's site.
- **`/pb` is authenticated by the account's postback key alone** — 32 hex characters from
  `gen_random_uuid()` (122 random bits), shape-checked before any database call. A wrong
  key returns `403 unknown_key` and writes nothing, so it cannot be used to fill the log.
  With the right key, a caller can only attach conversions to **that account's own**
  clicks: `record_postback()` joins every click and conversion to `creatives.user_id`,
  and another account's click reads exactly like one that never existed.
- **The key is stored in the clear** because the owner has to be able to copy the URL
  again; it is readable only through `ensure_postback_key()`, scoped to `auth.uid()`.
  `rotate_postback_key()` replaces it and the old one stops working at once. Treat it
  like a password; the settings page says so.
- **Input is untrusted and parsed in one place** (`lib/postback.ts`): statuses from a
  closed list (a `Map`, so a word like `constructor` is not accidentally "known"), an
  unexpanded macro an error rather than "not sent", payout finite and under 1e9 (and
  `1,234` refused as ambiguous), currency three letters, txid ≤ 128 characters, goal ≤ 64
  (refused rather than truncated, which would merge two goals into one row — ADR-0027), NUL
  bytes removed (Postgres text cannot hold them, and one would fail the whole write into
  an endless retry), logged parameters truncated to 128 characters — never inside a
  surrogate pair, since a lone half is invalid JSON to PostgREST and fails the whole call
  into the same retry — and the jsonb capped at 4 KB by a CHECK. A form body is streamed
  and read to 8 KB, no further; JSON bodies are not read. `npm run test:postback` pins
  all of it.
- **A leaked key writes a bounded log.** `record_postback()` stops logging past 3,600
  rows per account per hour (the postbacks themselves are still processed), and a log
  write that fails never rolls back the conversion.
- No per-IP rate limit on either endpoint yet — see the Firewall note above.

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
- **On a Cloudflare Worker, a pre-flight — and the window it leaves**
  ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)). workerd's
  `http.request` is a shim over `fetch` with no socket to pin, and it refuses a custom
  `lookup` outright — the Node path would fail closed there, but never work. So on a
  Worker the fetcher (chosen by runtime, `lib/runtime-env.ts`) refuses IP-literal
  hosts, `localhost`, `*.localhost` and single-label names outright; resolves A and
  AAAA through `node:dns` (DNS-over-HTTPS to 1.1.1.1), keeps only the answers that are
  addresses — workerd lists a CNAME's target *name* among them — and requires at least
  one, every one public; and only then fetches, with redirects, deadline and byte cap
  enforced as on Node. What
  that gives up is the rebinding guarantee above: `fetch` resolves the name again.
  What is left behind the window is small — a Worker has no private network, no cloud
  metadata endpoint and no loopback service, and Cloudflare does not route its
  subrequests to private ranges — and it is accepted rather than hidden. Under
  `next dev` the socket-level guard still applies.
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
`creative-media` bucket — and, since [ADR-0028](decisions/0028-creative-media-on-r2.md),
for the media host `media.smithcdn.net`, where R2 makes delivery free of charge, so
hotlinking costs nothing there either. Every response from the media host carries
`X-Content-Type-Options: nosniff`, and any `.html` there `Content-Security-Policy:
sandbox` (zone response-header rules, ADR-0029): the host serves our runtime and
strangers' uploads, and neither should ever run as a page on it. Cloudflare can rate-limit the host if abuse is
ever observed.

**The SIMID document is still one hop indirect**, reached through our own route
with an HMAC-signed, 10-minute token (`lib/vast/interactive-token.ts`; 120s until
ADR-0029, whose tag cache and last-good copy can hand out a document six minutes old). The token
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
(in 10 minutes since ADR-0029); only the signer changed, from Supabase to us.

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

The R2 bucket that took over new uploads ([ADR-0028](decisions/0028-creative-media-on-r2.md))
has no RLS at all, so its prefix rule lives in code, in two places that must stay
strict: `requestMediaUpload` mints every key itself (the browser never names one), and
`deleteCreative` deletes only keys that `parseOwnMediaUrl()` accepts — exactly
`{uuid}/{uuid}.{ext}`, nothing a URL parser could normalize — under the caller's own
`{userId}/` prefix. A looser parse there is a cross-tenant delete.

## Developer-only surfaces (`isDevOnlyEnabled()`)

Three routes exist for local creative work and **must not be reachable anywhere else**:
`GET /api/dev/session` (signs in a local test account), `GET /api/dev/unit/[template]`
(serves a unit off local disk), and the `/dev/harness` page.

The gate is `lib/dev-only.ts`. `isDevOnlyEnabled()` answers *"is this a development
build"* — `NODE_ENV !== "production"`, no `VERCEL` env var, which excludes preview
deployments too (they run with `NODE_ENV=production` but are publicly reachable URLs),
and not inside a Cloudflare Worker (`navigator.userAgent === "Cloudflare-Workers"`,
ADR-0029) — every Worker is a deployment, whatever its env says.

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
- **`/dev/harness` reads `templates` with the service role**, so it can list draft
  templates (`is_published = false`) that RLS hides from every session — a new template has
  to pass the harness before it is published ([ADR-0024](decisions/0024-pick-message-template.md)).
  It is safe for three reasons that must all stay true: nothing off this machine can reach
  the page (the `127.0.0.1` listener above is the control, and the `isLocalHeaders()` gate
  that 404s *before* the query runs is the second lock); the read is the catalog table
  alone, which holds no user data, narrowed to the columns the page uses; and only what
  the harness already needed leaves the server, as the same schema-derived demo config it
  passed before — with, at most, the `?set=` values the request itself carried laid over
  it. Never move this read above the gate, and never widen it to another table on the
  strength of this exception.
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

## Web analytics (Cloudflare)

Cloudflare Web Analytics ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md);
Vercel Web Analytics and Speed Insights before it) is mounted once, in the root layout
([`components/WebAnalytics.tsx`](../components/WebAnalytics.tsx)). It is the only
third-party script our own pages load. Where it may run, and what it is allowed to see:

- **App domain only.** The ad domain renders through that same root layout (`/cdn`, plus
  the `/cdn/blocked` catch-all every other path there rewrites to), so the mount sits
  behind one gate on the request host — the same comparison
  [`middleware.ts`](../middleware.ts) makes before it declines to set a cookie
  ([ADR-0018](decisions/0018-dedicated-ad-serving-domain.md)). The host that appears inside
  strangers' VAST tags, and that the validator runs their creatives on, loads no script
  and reports nothing.
- **Never on the serving paths.** `/v`, `/t` and `/c/*` return XML, JavaScript and
  beacons — no HTML, no layout, no script. A creative running inside a publisher's player
  cannot carry this onto their page.
- **Cookie-less, and third-party.** The script loads from `static.cloudflareinsights.com`
  and reports to `cloudflareinsights.com` — unlike Vercel's, which hid behind a
  first-party path, so a content blocker may drop it and the counts read low. The site
  token (`NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`) is public by design: it rides in every
  page and can only report a view to this one site. Unset, nothing renders — so no local
  or CI session lands in production numbers.
- **The beacons carry the real path**, so a dashboard URL reaches Cloudflare with a
  creative id in it. That is the party terminating every request to the app once it
  runs on Workers, not a new one — but it is why the mount is gated by host rather
  than global.
- **Page views and Web Vitals only.** No custom event is sent. Adding one is a decision
  about what leaves the browser, not a call-site detail.
- **It measures our pages, never a creative.** Vitals come from the app's own documents;
  a VPAID unit runs in the player's cross-origin iframe, which this cannot see and must
  not be extended to see. Creative-side measurement is the telemetry channel above
  ([ADR-0019](decisions/0019-creative-telemetry-channel.md)) and viewability is
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

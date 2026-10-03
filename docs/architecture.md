# Architecture

> Status: design phase. This describes the agreed target design, not shipped code.

## Overview

CreoSmith has three logically distinct parts with **different trust models and
performance profiles**. Keeping them separate is the core architectural idea.

```
┌──────────────────────────────────────────────────────────────────┐
│  A. Dashboard App (authenticated, low QPS, user-facing)            │
│     Next.js App Router · Supabase Auth · RLS-protected             │
│     - Landing + template showcase                                  │
│     - Configure creatives, manage billing, copy VAST tag URLs      │
└──────────────────────────────────────────────────────────────────┘
                │ writes config              │ Stripe Checkout
                ▼                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  B. Database (Supabase / PostgreSQL)                               │
│     users · templates · creatives · subscriptions · counters       │
│     RLS protects user-facing access. A denormalized "serving view" │
│     gives the VAST path a fast, RLS-free read.                     │
└──────────────────────────────────────────────────────────────────┘
                ▲ webhook sync               ▲ scoped service-role read
                │                            │
┌──────────────────────────────────────────────────────────────────┐
│  C. Ad-Serving Layer (public, high QPS, latency-sensitive)         │
│     GET /api/vast?creative_id=…  (edge, cacheable)                 │
│     GET /r click redirect · /pb conversion postbacks (ADR-0023)    │
│     Stripe webhook  /api/stripe/webhook  (source of truth)        │
│     Creative runtime/CDN: SIMID iframe / VPAID unit (signed URLs)  │
└──────────────────────────────────────────────────────────────────┘
```

## A. Dashboard App

Standard authenticated Next.js app. All data access goes through Supabase with RLS,
so a user can only ever see/modify their own creatives and subscriptions. This layer
is **not** performance-critical and may use the Node runtime freely.

Surfaces, after [ADR-0008](decisions/0008-catalog-first-information-architecture.md):

| Route | Access | What it does |
| --- | --- | --- |
| `/` | public | Landing. Brand stage, one live demo well with a template switcher, how-it-works, the full template grid, standards and the free tools, closing CTA, footer. Exactly one VPAID unit is mounted at a time — the grid below it is static previews ([design-system.md](design-system.md) §6) |
| `/catalog`, `/catalog/[slug]` | public | Template catalog and a detail page with one live in-browser demo. Replaces the old `/preview` fixtures; `/preview` is a permanent redirect |
| `/login`, `/signup`, `/auth/*` | public | Email/password auth; [`middleware.ts`](../middleware.ts) refreshes the session |
| `/dashboard` | session | Redirect only — to `/dashboard/creatives`, or `/catalog` for a user with none |
| `/dashboard/creatives`, `/dashboard/creatives/[id]` | session | The user's creatives, their VAST tags, and delivery counts |
| `/dashboard/creatives/new?template=` | session | The schema-driven configurator with the live player panel |
| `/dashboard/subscriptions` | session | All billing; Stripe checkout returns here |
| `/tools/vast-validator`, `/tools/vast-generator` | public | Free tools ([ADR-0013](decisions/0013-public-free-tools-section.md)), reached via the top-bar dropdown — no `/tools` index page. No session, no database read; the generator is a placeholder |
| `/c/player` | public | The validator's player, deliberately on a **different origin** from the app ([ADR-0021](decisions/0021-validator-player-on-an-isolated-origin.md)) — it executes a stranger's VPAID unit, so it hosts nothing of ours. Inert until its parent posts a document |
| `/icon`, `/opengraph-image` | public | Generated from the monogram’s own geometry at build time (Satori, so they read `lib/brand-palette.ts` rather than CSS tokens — [design-system.md](design-system.md) §12). `/favicon.ico` redirects to `/icon`, **app domain only**: an unscoped redirect would fire on the ad domain, which answers ads and one page and nothing else (ADR-0018) |
| `/dev/harness` | **local only** | The creative harness: runs a built VPAID unit against schema-derived config at four slot sizes and judges it against the mandatory lifecycle. `?t=<unit>&set=field:value` runs a mode other than the schema default — the slider's vertical divider, the quiz's per-path results — including a field not yet seeded. Lists draft templates too, so a new one is checked before it is published ([ADR-0024](decisions/0024-pick-message-template.md)). 404 outside local development ([security.md](security.md)) |

The public catalog reads `templates` as `anon` — `templates_select_published` already
allows it — and its demo runs a built unit straight from `/api/preview-unit/<key>`, with
sample config derived from the template's own `config_schema` defaults
([`lib/template-demo.ts`](../lib/template-demo.ts)). Browser/SSR Supabase clients live in
[`lib/supabase/`](../lib/supabase).

Dashboard analytics are read through the owner-scoped aggregate
`public.get_creative_overview()` (see [data-model.md](data-model.md)); `creative_event_counters`
itself stays unreadable from the client.

Traffic and page performance on these surfaces are measured by **Cloudflare Web
Analytics** (page views and Core Web Vitals, cookie-less; `components/WebAnalytics.tsx`,
Vercel's Analytics and Speed Insights until ADR-0029), mounted once in the root layout — distinct from the delivery counts above, which are our own, and from
anything happening inside a creative. Both are deliberately gated off the ad domain, which
renders through that same layout: see
[security.md](security.md#web-analytics-cloudflare).

The UI is bilingual (RU/EN). Copy lives in [`lib/i18n/dictionaries.ts`](../lib/i18n/dictionaries.ts)
with the English dictionary typed against the Russian one, so a missing translation is a
build error. Server components read the locale from a cookie
([`lib/i18n/server.ts`](../lib/i18n/server.ts)), the root layout hands it to client
components through a context provider, and the top-bar switcher persists the choice with
a server action ([`app/actions/locale.ts`](../app/actions/locale.ts)). **This is a
dashboard-layer concern only — no locale logic exists on, or may be added to, the
ad-serving path,** which has neither a session nor an interface. Visual rules for all of
it are fixed in [design-system.md](design-system.md).

## B. Database

See [data-model.md](data-model.md) for entities. Two access patterns coexist:

- **User path (dashboard):** RLS-enforced, per-user. The default and the safe one.
- **Serving path (VAST):** there is no user session. We do a **narrow service-role
  read** of exactly the fields the VAST builder needs, against a denormalized shape
  that already contains the effective subscription status. This avoids both RLS
  (which can't apply without a session) and expensive joins on a hot path.

## C. Ad-Serving Layer

### `GET /v?creative_id=XYZ` (formerly `/api/vast`)

The heart of the product and the most demanding endpoint. It is called by ad players
in the wild — **public, unauthenticated, high QPS, latency-sensitive**.

It answers on both domains, under a neutral public path
([ADR-0018](decisions/0018-dedicated-ad-serving-domain.md)): `/v` for the tag, `/t`
for the beacons, `/r` for clicks ([ADR-0023](decisions/0023-conversion-postbacks.md)),
`/c/s/…` for the SIMID document. `/api/*` still resolves on the app domain and always
will — tags already pasted into a DSP point there.

**The ad domain is a Cloudflare Worker, `creosmith-ads`**
([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md),
[`workers/ads/src/index.ts`](../workers/ads/src/index.ts)). It answers the paths above,
`/c/u/…` (runtime scripts only: a forward to the media host for tags built before units
moved there) and `robots.txt`; it forwards `/`, `/cdn…`, `/c/player` and `/_next/…` to
the app's Worker unchanged, over a service binding that keeps the ad domain's `Host`, GET
and HEAD only; ACME challenges go to the zone's origin (Vercel, while it exists); and
everything else is a 404. No cookie is ever set on that host —
the Worker strips `Set-Cookie` from anything it forwards — and every answer carries
HSTS. The postback endpoint `/pb` lives on the app domain only.

**One implementation, two runtimes.** The handlers are
[`lib/serving/http/`](../lib/serving/http): functions of `(request, platform)`, where
the platform supplies the snapshot store, `waitUntil` and the viewer's country. The
Worker builds its platform from its KV binding, `ctx.waitUntil` and `request.cf`; the
Next routes in `app/api/{vast,track,click,creative}` are one-line wrappers using Next's
`after()` and the geo header, and serve `npm run dev` and the legacy `/api/*` paths. A
VAST document is therefore the same bytes whichever runtime built it —
`npm run test:vast` pins them, signatures included.

The ad domain's DNS is on Cloudflare since
[ADR-0028](decisions/0028-creative-media-on-r2.md). The apex records are proxied and a
Workers Route `smithcdn.net/*` sends every request to the Worker; the zone's origin is
still Vercel until it is decommissioned (ADR-0029 §4), and **deleting the route is the
rollback** — traffic falls straight through to Vercel, which still serves everything.
The app domain is set up the same way: `creosmith.com`'s records are proxied, a route
`creosmith.com/*` sends it to `creosmith-web`, and turning the proxy off is its rollback.
`media.smithcdn.net` is the R2 bucket's custom domain: advertiser media and, since
ADR-0029, the VPAID units — a separate host, so none of the routing above applies to it.

Request flow:

1. Parse + validate `creative_id` (and optional `format` override, macros).
2. Read the serving state from the **snapshots** in Workers KV, not the database
   ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md),
   [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)):
   `serving/creative/<creative_id>.json` for the creative and its template's runtime
   facts, then `serving/entitlement/<user_id>.json` for that user's subscription rows.
   Neither read touches Postgres; each is answered from the data centre's own KV cache
   for up to 60 s.
   - **Fallback:** if the creative snapshot is absent, or either document cannot be
     read (the store did not answer, the body is unparseable, or it carries an
     unrecognised `schema_version`), the endpoint falls back to the
     `get_creative_serving` RPC (service-role; PostgREST doesn't expose the `private`
     schema, so a SECURITY DEFINER function in `public` — EXECUTE restricted to
     `service_role` — is the read path). See [data-model.md](data-model.md). A miss
     degrades to the previous behaviour, never to a dark ad. A missing *entitlement*
     document is not a miss: it is a user who never subscribed, and does not serve.
3. **Subscription gate:** is there an active subscription covering this creative's
   template (single-template sub for that `template_id`, OR an all-access sub)?
   Evaluated in `lib/serving/entitlement.ts` from the snapshot's facts — including
   comparing `current_period_end` against the clock, so a subscription still lapses
   on time when no webhook arrives to say it did.
   - **Active** → build a valid VAST 4.2 document containing the interactive payload
     for the selected format via the **format adapter** (see below).
   - **Inactive / missing / invalid** → return empty VAST: `<VAST version="4.2"></VAST>`
     (optionally with a configured fallback ad).
4. Return XML with correct `Content-Type` and cache headers.

Hard rules for this path (also in [CLAUDE.md](../CLAUDE.md)):

- **No Stripe calls here.** Subscription status comes from the denormalized record,
  kept fresh by webhooks.
- **No RLS dependency.** Use a scoped service-role client; never expose the service
  key to the client.
- **Cache deliberately.** The Worker keeps each tag 60 s in its data centre's Cache
  API, keyed on `creative_id` alone — a DSP's cache-buster no longer makes every
  request a miss — and on the deploy's version, so a new build never serves the old
  one's document. The body is stored without CORS headers; they are added per request
  (see the CORS rule below). Players see `Cache-Control: public, max-age=0`: Vercel's CDN
  passed on a bare `public`, which lets a downstream cache invent a lifetime of its own.
- **Fail closed.** Any error or ambiguity → empty/fallback VAST, never the payload.
- **Answer by reason, not uniformly.** A settled "no ad" (unknown id, lapsed
  subscription, archived creative) is a 200 with empty VAST, cached the full 60 s — it
  is correct and stable. A failure to read our own state is a **503**, and the player
  is handed the last good document instead of an empty one: the Worker keeps every
  good answer for a further five minutes under a second cache key (the Cache API has
  no `stale-if-error`, so this is that directive rebuilt), and a 503 is never stored.
  The Postgres fallback is bounded at 2.5 s, so a database that is slow rather than down
  still ends in that 503 while the player waits; and while the last good copy is being
  served it is also the fresh copy for ten seconds, so an outage is retried every ten
  seconds per data centre, not on every request. The SIMID token inside a tag lives ten
  minutes for the same reason: a tag can be handed out six minutes old.
  Both used to be an empty 200, which made a one-second blip indistinguishable from
  "no ad" and cached it as a valid answer for a full minute on every PoP that missed
  during it.
- **CORS by the VAST 4.2 rule, with `Vary: Origin`.** The tag is read cross-origin by
  players on publishers' pages, and some fetch it with credentials — the player's
  choice, not ours. VAST 4.2 requires the request's `Origin` echoed with
  `Access-Control-Allow-Credentials: true`, and `*` only when `Origin` is null or absent;
  a bare `*` fails every credentialed player (`lib/vast/cors.ts`,
  [ADR-0026](decisions/0026-vast-cors-credentialed-requests.md)). `Vary: Origin` is on
  every response so a shared cache downstream keeps a copy per origin. The handler is
  the only source of these headers, on a cache hit as on a miss; `next.config.ts` and
  the Worker set `*` for `/t` and `/c/…` only.
- **No database write on the beacon path.** `/t` hands its counter upsert to
  `waitUntil` and returns 204 immediately.

### Click redirect `GET /r` and postbacks `GET|POST /pb`

Conversion attribution, the way trackers do it
([ADR-0023](decisions/0023-conversion-postbacks.md)).

- **The builder routes every click destination through `/r`.** For each field in the
  serving row's `click_fields` — the `config_schema` fields of type `url`, minus the OMID
  script — whose value is an http(s) URL, `<ClickThrough>` and the matching
  `<AdParameters>` key become a signed `/r?cid=&f=&exp=&sig=` link (`lib/click-url.ts`,
  24-hour TTL). A script-capable destination (`javascript:`, `data:`) is dropped; any
  other scheme passes through untracked. The units open what they are handed, so no
  template changed. The preview context sets `click_fields: []`: previews are never
  tracked.
- **`/r` (`lib/serving/http/click.ts`)** reads the destination from the creative's own
  config (snapshot first, `get_creative_serving` on a miss) by field name, then checks the
  signature against that creative's current owner — forged, missing, minted for another
  owner or more than a week past expiry is a `404`, which is what keeps it from being a
  redirect to whatever an account configured. A
  fresh link fetched by something that is not a known crawler mints a click id, writes it
  through `record_click()` in `waitUntil` (capped per creative per minute, and logged when
  it does not land), and 302s with `{click_id}`, `{creative_id}` and `{outcome}` filled in
  and the result normalized through `URL`. A stale link, a HEAD or a crawler gets the same
  302 with no id. A field that no longer resolves falls back to `clickThroughUrl`; an
  unreadable database is a `503`; everything is `no-store`. There is no entitlement read:
  only a served tag can have produced a genuine signature.
- **`/pb` (`app/api/postback/route.ts`)** is called by a partner network's server with the
  account's postback key and the click id. `lib/postback.ts` parses; `record_postback()`
  does find-or-update-or-insert atomically in SQL and logs the hit for the owner. It is on
  the app domain — a network's server is not a publisher's page.
- **Reporting** is `get_creative_conversions()` per (UTC day, exit) and
  `get_creative_conversion_goals()` per goal the network reported
  ([ADR-0027](decisions/0027-conversion-goals.md)), rendered by
  `components/ConversionReport.tsx` on the creative page. The key and the log live on
  `/dashboard/creatives/postback`.

### Format adapter layer

VAST output is **format-agnostic**. A registry maps a delivery format to an adapter
that knows how to emit the correct VAST fragment and reference the right runtime:

```
FormatAdapter:
  format: 'simid' | 'vpaid' | <future>
  buildMediaNodes(creative, ctx): VastFragment   // e.g. InteractiveCreativeFile (SIMID)
                                                  //      or MediaFile apiFramework=VPAID
  runtimeUrl(creative, ctx): SignedUrl
  adVerificationsInner?(creative, ctx): VastFragment  // OMID <Verification> pass-through,
                                                       // SIMID only — ADR-0012. Optional;
                                                       // VPAID doesn't implement it.
```

The VAST builder selects the adapter from the user's chosen format on the creative.
Adding a new standard = adding an adapter, not touching the endpoint. See
[ADR-0002](decisions/0002-multi-format-creative-delivery.md).

### Live preview: `POST /api/vast/preview` + `GET /api/vast/preview/[token]`

The dashboard configurator ([`components/ConfiguratorForm.tsx`](../components/ConfiguratorForm.tsx),
shared by [`app/dashboard/creatives/new`](../app/dashboard/creatives/new) and
[`app/dashboard/creatives/[id]/edit`](../app/dashboard/creatives/[id]/edit)) has a
"Launch Ad" panel ([`components/PreviewPanel.tsx`](../components/PreviewPanel.tsx))
that runs a template with whatever is **currently typed into the form** — before the
creative is saved (or the edit committed) — in three player backends: an in-house
sandbox harness, Google IMA SDK, and Fluid Player. This is a **separate, authenticated
surface**, not a variant of the public serving path above:

1. `POST /api/vast/preview` — requires a signed-in dashboard user (no subscription
   check: preview is a try-before-you-configure surface, open to any account). Takes
   `{ templateId, format, fields }`, validates them through the very same
   `buildConfigFromValues` that `createCreative`/`updateCreative` use — one function,
   not three copies of a loop that must be kept in step — and mints a
   **stateless, HMAC-signed, 120s-TTL token**
   (`lib/vast/preview-token.ts`) encoding the template/format/config — no DB row is
   read or written. A stateless token was chosen over a server-side cache because the
   stack has no Redis/KV and Vercel functions don't share memory across invocations
   (ADR-0004); see [ADR-0006](decisions/0006-live-preview-token.md).
2. `GET /api/vast/preview/[token]` — public by necessity (the third-party player SDKs
   fetch it directly, with no session), but **self-authorizing** via the token's HMAC
   signature + expiry rather than the subscription entitlement gate. It reuses
   `resolveInteractiveUrl()` + `buildInlineVast()` directly (not `generateVast()`,
   which gates on `should_serve`) against a synthetic `CreativeServing`-shaped context
   built from the token (`lib/vast/preview-context.ts`). Response is
   `Cache-Control: no-store` — never cached, unlike the real endpoint. Its CORS headers
   come from the same `lib/vast/cors.ts` as the real endpoint's, so a preview cannot
   pass where the served tag would fail
   ([ADR-0026](decisions/0026-vast-cors-credentialed-requests.md)).

Because the panel POSTs the whole form state, that shared build is also what prunes
fields a `showWhen` has switched off ([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)) —
preview would otherwise show a configuration Save would refuse to write.

**Size ceiling.** The token is a base64url **URL path segment**, so its payload bounds the
request line. The config is capped at 5120 bytes and the payload at 6144, in that order so
an oversized config gets a clean 413 instead of the uncaught throw the signer raises past
its own cap. ~6KB of payload is ~8.2KB of URL, and the binding limit is the 8KB request
line most CDN front-ends allow — not Vercel's larger URL+headers budget — which puts the
architectural ceiling at roughly **5.6KB of config**. A template that needs more wants a
short opaque id backed by a row (ADR-0006's rejected alternative), not a bigger token; a
query string would not help, since it is the same request-line bytes. Production serving
has no such cap — `/api/vast` reads `config_json` from the database.

Both routes are additive: the real `/api/vast?creative_id=` path, its entitlement gate,
and its 60s cache are untouched. The only shared code is `buildInlineVast()` itself,
which both now feed via a `rawConfig` field so a creative's full `config_json` — not
just the fixed subset `CreativeConfig` knows about — reaches `<AdParameters>` (this
also fixed a real bug: custom per-template fields like a Scratch & Reveal's `coverText`
were previously silently dropped from production `<AdParameters>`).

**Player history:** the third tab originally used Video.js + `videojs-ima` +
`videojs-contrib-ads`. That combination hit an unresolved upstream `videojs-ima`
limitation with **VPAID** creatives — the ad request succeeded and its own
outstream-mode state machine engaged correctly (`playerMode: "outstream"` via
`contribAdsSettings`), but the ad never became visible; IMA's own `ima-ad-container`
was created and stayed `hide-ad-container` regardless. It was replaced with
[Fluid Player](https://github.com/fluid-player/fluid-player) (MIT, actively
maintained, ~530KB, built-in VAST/VPAID support via `allowVPAID` — no separate ad
plugin needed), configured as a single `preRoll` with no content `<source>` — the
same "ad-only outstream" pattern Prebid's own outstream renderer uses for Fluid
Player (`prebid/prebid-outstream`). See
[`components/players/FluidPlayer.tsx`](../components/players/FluidPlayer.tsx).
One integration gotcha worth knowing: Fluid Player restructures the DOM around
whatever `<video>` element it's given, so — like `SandboxPlayer.tsx` — the element
is created imperatively into an empty slot div rather than rendered directly in
JSX; letting React believe it owns that node caused it to be wiped out from under
the player on the next parent re-render (e.g. from an `onStatus` call).
`vastVideoEndedCallback` doesn't reliably fire for VPAID (no real media file ever
plays, so there's no native `ended` event to key off of) — the status line can stay
on "Playing" after a VPAID creative's own internal timer completes; the ad itself
renders and behaves correctly regardless.

Its control bar is hidden entirely (`components/players/fluid-preview.css`,
docs/design-system.md §7) — it steers content this configuration does not have.
`keyboardControl` is off with them, and that one is a correctness fix rather than a
cosmetic one: Fluid binds it on `document` in the **capture** phase after the first
click inside the player, and the handler calls `preventDefault()` for space, Enter,
`m`, `f`, the arrows and every digit with no exemption for form fields. Clicking the
creative — which our creatives invite — and then tabbing back into the configurator
left those keystrokes never reaching the input being typed into.

**What each tab can and can't test.** The three tabs are not interchangeable, and a
failure in one is not automatically a defect in the creative:

- **Sandbox is a VPAID host only.** It loads the unit as a `<script>` and calls
  `getVPAIDAd()`. A SIMID creative is an HTML document meant to run in a sandboxed
  iframe over `postMessage`, so this harness cannot execute it — selecting SIMID says
  so plainly rather than surfacing a misleading load error. Use IMA or Fluid for SIMID.
- **Sandbox and Fluid do not fetch the ad tag the same way IMA does.** Sandbox never
  requests `/api/vast/preview/[token]` at all — it uses the signed unit URL and the
  minted `adParameters` directly. So "works in Sandbox, fails in IMA/Fluid" points at
  the *ad request*, not the creative.
- **IMA cannot fetch a `localhost` tag at all — on loopback the tab hands it the VAST
  directly.** IMA issues its ad request from a bridge iframe on `imasdk.googleapis.com`,
  a *public* address space; a tag on `localhost` is *loopback*. Chrome's **Private
  Network Access** refuses that direction in two successive gates: first for want of a
  secure context (plain `next dev` is `http://`, so the bridge is too), then — once
  served over https — with *"Permission was denied for this request to access the
  `loopback` address space"*, a permission the third-party bridge has no way to
  request. **No response header fixes this**; the restriction is on the requesting
  context, not the response. Either way IMA reports only the generic code **1005
  `FAILED_TO_REQUEST_ADS`**.
  `ImaPlayer.tsx` therefore detects a loopback tag host and fetches the VAST itself
  (same-origin with the page, so PNA never applies), passing it to IMA via
  `adsRequest.adsResponse` instead of `adTagUrl`. IMA parses the identical document —
  only who performs the GET differs. A deployed tag is a public address, so production
  keeps the `adTagUrl` path and its full fidelity to what a real DSP does.
  `npm run dev:https` is still worth using locally: the VAST's tracking beacons point
  at the same origin, and over plain http on an https page they'd be mixed content.
- **Fluid Player detects VPAID by position, not capability.** It tests only
  `mediaFileList[0].apiFramework`, so the VPAID `<MediaFile>` must be emitted before
  the base-video fallback or Fluid plays the fallback and never loads the unit —
  which is why Shoppable Video (the one template with a base video) failed there
  while image-only templates worked. Handled in `lib/vast/adapters/vpaid.ts`; don't
  "tidy" that ordering.
- **1005 is an ad-*request* failure, never an asset or VAST-validity problem.** Don't
  go looking in the VAST builder for it. Ad blockers cause the same code by a different
  route (`imasdk.googleapis.com` and paths containing `/vast/` are common blocklist
  entries). Either way, confirm whether the request reached the server before touching
  ad-serving code: the endpoint's output can be verified independently of any browser
  by minting a token with `PREVIEW_TOKEN_SECRET` and fetching the URL from a shell.
- **The SDK failing to load is a different failure from the ad failing to serve.**
  `loadImaSdk()` ([`components/players/load-ima-sdk.ts`](../components/players/load-ima-sdk.ts)),
  shared by the IMA tab and the VAST validator, rejects with a typed `ImaSdkLoadError`
  — `blocked` (refused, or answered with something that is not the SDK) or `timeout`
  (12s, so a request nobody will answer stops presenting as a spinner). A script that
  loads without leaving `google.ima.AdsLoader` callable counts as `blocked`: a blocker
  answering with an empty 200 or a stub fires `onload` exactly like a real load, and
  the failure would otherwise resurface as a `ReferenceError` from whichever line
  touched `google.ima` first. Callers catch the load and everything after it
  **separately**, so a throw while setting the ad up is reported as its own failure and
  never as "could not load the SDK". `ima3.js` is a third-party script from an
  ad-serving domain: when it does not arrive, the browser blocked it, and no change on
  our side makes it arrive.

### Stripe webhook `/api/stripe/webhook`

Source of truth for subscription state. Verifies the Stripe signature, then updates
the subscription record + the denormalized serving status. See [billing.md](billing.md).

### Creative runtime / CDN

The actual interactive unit (SIMID iframe document / VPAID JS) is served via
**short-TTL signed URLs** and gets its config **injected server-side** (never baked
into static assets). This is the protection model — see
[ADR-0003](decisions/0003-access-control-over-code-hiding.md), whose domain/referer
allow-listing layer was dropped as never-implemented.

**Hosting: R2, content-addressed, on the media host**
([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md),
[ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)). `npm run runtime:push`
hashes each built file, uploads it to the `creative-media` bucket as
`runtime/<template>/<file>.<sha256[0..8]>.js` with a year-long immutable cache, and
writes the committed `runtime/manifest.ts` that maps logical `runtime_keys` to
`https://media.smithcdn.net/runtime/…`. The app and the ad Worker import that manifest
at build time, so resolving a unit URL costs no network call. Runtime keys
(`lib/runtime-keys.ts`) and advertiser media keys (`{uuid}/{uuid}.{ext}`) cannot match
each other, so nothing that writes or deletes one can reach the other. Units moved there
from a public Vercel Blob store in ADR-0029, superseded hashes included
(`npm run runtime:migrate`).

The two formats then diverge, and not symmetrically:

- **VPAID goes straight to the CDN.** `<MediaFile>` carries the public hashed URL on
  the media host, so the player fetches it from Cloudflare's cache with nothing of ours
  in the path and a stable cache key. The previous scheme put a 120s token in the URL,
  which changed every minute — meaning nearly every asset fetch was a cache miss *and*
  a Supabase download.
- **SIMID keeps a proxy route,** for its headers and its token. The stores it lived in
  before would not serve HTML an iframe can run — Vercel Blob set
  `content-disposition: attachment` on it ("prevents hosting HTML pages", per its docs),
  Supabase Storage forces `.html` to `text/plain` with a script-blocking
  `Content-Security-Policy: sandbox` — and in a player that means the video plays (it's a
  plain `<MediaFile>`, unaffected) while the interactive overlay's script never runs. R2
  serves HTML inline but bare, so new copies there are stored as attachments and the
  media host's `.html` responses carry `Content-Security-Policy: sandbox`. `/c/s/:token`
  ([`lib/serving/http/interactive.ts`](../lib/serving/http/interactive.ts)) fetches the
  bytes and re-serves them as `text/html` with a permissive-but-scoped CSP.

`lib/runtime-bytes.ts` falls back to the Supabase `creatives` bucket for any logical
key not yet in the manifest, which is what let this ship before the public store
existed. Supabase Storage was the MVP host under
[ADR-0004](decisions/0004-mvp-on-free-tiers.md); that fallback is the last of it on
this path.

The SIMID token's kind comes from the object path and the route demands it
explicitly, so a token minted for the other format cannot be replayed against it.

The consequence that matters: building a VAST document is now pure local
computation, and for VPAID the asset request is too — it is a static CDN object.
Only the SIMID document still runs through a function, and its bytes come from the
same public store, so a Supabase outage no longer stops either format once the
manifest is populated.

### Advertiser media uploads

Separate from the runtime bucket above: `"image"`-typed config fields (background,
before/after, quiz options, reveal image, and Shoppable Video's `videoUrl`) let an
advertiser **upload** a file instead of pasting an external URL — added after
discovering that externally hosted media routinely breaks via hotlink protection
(a host redirecting a cross-origin request to a URL that 404s). See
[ADR-0010](decisions/0010-advertiser-media-uploads.md).

- **Store:** the Cloudflare R2 bucket `creative-media`, public-read and served by
  Cloudflare's CDN at `media.smithcdn.net` — under the ad domain, and free of egress
  charges at any volume ([ADR-0028](decisions/0028-creative-media-on-r2.md)). Public
  because the URL is baked into `<AdParameters>` and must keep resolving for the
  creative's lifetime — a short-TTL signed URL is the wrong shape for this, unlike the
  runtime JS bucket above. Media uploaded before ADR-0028 sit in the Supabase Storage
  bucket of the same name until `npm run media:migrate` moves them; both stores count
  as ours (`parseOwnMediaUrl()`).
- **Upload path:** straight from the browser to R2 with a presigned PUT, **not**
  proxied through a Vercel serverless function — those cap request bodies around
  ~4.5MB, which video/gif files can exceed. The server action `requestMediaUpload`
  checks the session, type and size, mints the key under the uploader's own
  `{userId}/` prefix, and signs type and size into the URL. A deployment without the
  R2 variables uploads to the Supabase bucket instead, RLS-gated to the same prefix.
- **Delete path:** `deleteCreative` removes a creative's objects from both stores — R2
  with the server's bucket-scoped key, Storage with the user's session — since a
  migrated file keeps its Supabase original under the same key; a key another of the
  user's creatives still references is kept. A replaced file is left behind, because
  the live tag points at it until the form is saved.
- **Downstream:** the resulting public URL is just a string written into the same
  `config_json`/`<AdParameters>` field a pasted URL would occupy — `lib/vast/builder.ts`
  and the runtime's media helpers (`adInteractMediaLayer` / `adInteractFitMedia` in
  `runtime/lib/vpaid-base.js`, ADR-0025) need no awareness of where the URL came from.

## Runtime placement summary

| Concern | Runtime | Why |
| --- | --- | --- |
| Dashboard / auth pages | Cloudflare Worker `creosmith-web` — Next through OpenNext, `nodejs_compat` | Rich, low QPS. On the Worker since 2026-10-03, on Vercel before ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md) §2) |
| `GET /v`, `/t`, `/r`, `/c/s/:token` on the ad domain | Cloudflare Worker `creosmith-ads` (`nodejs_compat`), tag in the Cache API for 60 s | The impression path: about a millisecond of CPU per request, billed per request rather than per function invocation. Reads KV snapshots, not Postgres, and mints asset URLs locally — no Supabase call to build a tag ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md), [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)) |
| `GET /api/vast` (legacy, app domain) | App Worker, no edge cache in front | The same handler as the ad Worker's, through a Next route; also what `npm run dev` serves. A Worker's own answers are not cached by the zone, so `s-maxage` is advisory here and each request reads KV through the binding — fine for the few tags still pointing at it |
| VPAID unit | R2 + Cloudflare CDN at `media.smithcdn.net` (1y immutable) | Content-addressed URL straight in `<MediaFile>` — nothing of ours in the path ([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md), ADR-0029) |
| Advertiser media | Cloudflare R2 + Cloudflare CDN at `media.smithcdn.net` (1 day, Smart Tiered Cache) | The heaviest bytes on the ad path — two looping videos are ~7 MB an impression — so they live where egress is free at any volume and no Vercel or Supabase quota is spent on them ([ADR-0028](decisions/0028-creative-media-on-r2.md)) |
| `GET /api/creative/unit/[token]` | App Worker | Fallback only, for a logical key not yet in `runtime/manifest.ts`; app domain only. Removable once every template has been pushed |
| Serving snapshots | Workers KV `creosmith-snapshots`, 60 s edge cache | Written by the creative writers and the Stripe webhook through the app Worker's binding, and by the Node scripts over the REST API — which also write the private Blob store a rollback to Vercel would read; read by both Workers through their bindings. KV has no public URL, which matters because keys derive from `creative_id`, public in every tag ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)) |
| `GET /r` | Ad Worker (`/api/click`: Node, app domain) | The click redirect ([ADR-0023](decisions/0023-conversion-postbacks.md)): `node:crypto` for the link signature and the click id, and the service-role `record_click()` in `waitUntil` — the 302 never waits on Postgres. Excluded from the middleware matcher |
| `GET\|POST /pb` → `/api/postback` | App Worker | S2S postbacks from partner networks. Awaits `record_postback()`, because the network needs to know whether it landed — a 5xx is what makes it retry. Excluded from the middleware matcher |
| `POST /api/stripe/webhook` | App Worker | Needs the raw body for signature verification, checked through WebCrypto (`constructEventAsync`) |
| `GET /c/s/:token` → `/api/creative/simid/[token]` | Ad Worker (the app Worker on the app domain) | Re-serves the SIMID document from the media host with headers an iframe will run; the Supabase `creatives` bucket only for a key not in the manifest |
| Daily audit, reconciler | The app Worker's `scheduled()` — 03:00 UTC, and every ten minutes | Call `/api/cron/health` and `/api/cron/reconcile` in-process with the cron bearer, and fail the run on drift so it shows in the Worker's cron history (`workers/web/index.ts`). Vercel's crons until ADR-0029 |
| `/api/tools/vast/*` | App Worker | The validator ([ADR-0014](decisions/0014-vast-inspection-engine.md)). On the Worker the SSRF guard resolves every name first and refuses any private answer, then fetches — a pre-flight with a rebinding window that [security.md](security.md) weighs; under `npm run dev` it still pins the socket's own `lookup` through `node:http`. Excluded from the middleware matcher — `/hop` sits inside a player's wrapper-resolution timeout |
| `/api/dev/*`, `/dev/harness` | Node, **loopback only** | Developer surfaces: a password-less sign-in for a local test account, and a unit served off local `runtime/dist/` so the harness shows the working copy rather than the published object. Kept off the network by the *listener* — `npm run dev` binds `127.0.0.1` — with [`lib/dev-only.ts`](../lib/dev-only.ts) (not production, not a Worker, not Vercel, loopback headers) as a second lock that answers 404. See [security.md](security.md) for why the header check alone would not be enough |

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
| `/dev/harness` | **local only** | The creative harness: runs a built VPAID unit against schema-derived config at four slot sizes and judges it against the mandatory lifecycle. 404 outside local development ([security.md](security.md)) |

The public catalog reads `templates` as `anon` — `templates_select_published` already
allows it — and its demo runs a built unit straight from `/api/preview-unit/<key>`, with
sample config derived from the template's own `config_schema` defaults
([`lib/template-demo.ts`](../lib/template-demo.ts)). Browser/SSR Supabase clients live in
[`lib/supabase/`](../lib/supabase).

Dashboard analytics are read through the owner-scoped aggregate
`public.get_creative_overview()` (see [data-model.md](data-model.md)); `creative_event_counters`
itself stays unreadable from the client.

Traffic and page performance on these surfaces are measured by **Vercel Web Analytics**
and **Speed Insights** (`@vercel/analytics`, `@vercel/speed-insights`), mounted together
in the root layout — distinct from the delivery counts above, which are our own, and from
anything happening inside a creative. Both are deliberately gated off the ad domain, which
renders through that same layout: see
[security.md](security.md#web-analytics-and-speed-insights-vercel).

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
for the beacons, `/c/s/…` and `/c/u/…` for the creative assets. `/api/*` still
resolves and always will — tags already pasted into a DSP point there.

On the ad domain (`NEXT_PUBLIC_CDN_URL`), those four paths plus one information page
are the *only* things that answer; everything else is 404 at the routing layer, and
no cookie is ever set on that host.

Request flow:

1. Parse + validate `creative_id` (and optional `format` override, macros).
2. Read the serving state from the **CDN snapshots**, not the database
   ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md)): `creative/<creative_id>`
   for the creative and its template's runtime facts, then
   `entitlement/<user_id>` for that user's subscription rows. Neither read touches
   Postgres.
   - **Fallback:** if the creative snapshot is absent or carries an unrecognised
     `schema_version`, the endpoint falls back to the `get_creative_serving` RPC
     (service-role; PostgREST doesn't expose the `private` schema, so a SECURITY
     DEFINER function in `public` — EXECUTE restricted to `service_role` — is the
     read path). See [data-model.md](data-model.md). A miss degrades to the previous
     behaviour, never to a dark ad.
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
- **Cache deliberately.** Short-TTL edge cache keyed by `creative_id` (+ format),
  with explicit invalidation when the creative config or subscription status changes.
- **Fail closed.** Any error or ambiguity → empty/fallback VAST, never the payload.
- **Answer by reason, not uniformly.** A settled "no ad" (unknown id, lapsed
  subscription, archived creative) is a 200 with empty VAST and the full
  `s-maxage=60` — it is correct and stable. A failure to read our own state is a
  **503**, and successful responses carry `stale-if-error=300`, so the CDN hands the
  player the last good document instead of an empty one. Both used to be an empty
  200, which made a one-second blip indistinguishable from "no ad" and cached it as
  a valid answer for a full minute on every PoP that missed during it.
- **CORS on the response, and no `Vary: Origin`.** The tag is read cross-origin by
  players on publishers' pages, so `Access-Control-Allow-Origin: *` is required for
  the ad to render at all. Varying on origin would shard this cache per publisher —
  an origin miss for every new site the tag appears on.
- **No database write on the beacon path.** `GET /api/track` hands its insert to
  `waitUntil` and returns 204 immediately — up to seven beacons fire per impression.

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
   `Cache-Control: no-store` — never cached, unlike the real endpoint.

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

**Hosting: a public Vercel Blob store, content-addressed**
([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md)). `npm run runtime:push`
hashes each built file, uploads it as `runtime/<template>/<file>.<sha256[0..8]>.js`
with a year-long cache, and writes the committed `runtime/manifest.ts` that maps
logical `runtime_keys` to real URLs. The app imports that manifest at build time, so
resolving a unit URL costs no network call.

The two formats then diverge, and not symmetrically:

- **VPAID goes straight to the CDN.** `<MediaFile>` carries the public hashed URL,
  so the player fetches it with no function in the path and a stable cache key. The
  previous scheme put a 120s token in the URL, which changed every minute — meaning
  nearly every asset fetch was a cache miss *and* a Supabase download.
- **SIMID keeps a proxy route,** because it cannot be served directly by anyone.
  Vercel Blob sets `content-disposition: attachment` on HTML ("prevents hosting HTML
  pages", per its docs) and Supabase Storage forces `.html` to `text/plain` with a
  script-blocking `Content-Security-Policy: sandbox`. Either way a player's iframe
  will not run the document: the video plays (it's a plain `<MediaFile>`, unaffected)
  but the interactive overlay's script never runs. `GET /api/creative/simid/[token]`
  fetches the bytes and re-serves them as `text/html` with a permissive-but-scoped
  CSP.

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

- **Bucket:** `creative-media`, public-read (unlike `creatives`), created in
  `supabase/schema.sql`. Public because the URL is baked into `<AdParameters>` and
  must keep resolving for the creative's lifetime — a short-TTL signed URL is the
  wrong shape for this, unlike the runtime JS bucket above.
- **Upload path:** straight from the browser to Storage
  (`lib/supabase/client.ts`'s anon-key client, the user's own session), **not**
  proxied through a Vercel serverless function — those cap request bodies around
  ~4.5MB, which video/gif files can exceed. RLS on `storage.objects` gates writes
  to the uploader's own `{auth.uid()}/...` path prefix, mirroring the
  `creatives_*_own` policy pattern.
- **Downstream:** the resulting public URL is just a string written into the same
  `config_json`/`<AdParameters>` field a pasted URL would occupy — `lib/vast/builder.ts`
  and the runtime's `adInteractMediaLayer` (`runtime/lib/vpaid-base.js`) need no
  awareness of where the URL came from.

## Runtime placement summary

| Concern | Runtime | Why |
| --- | --- | --- |
| Dashboard / auth pages | Node (Vercel) | Rich, low QPS |
| `GET /api/vast` | Node + CDN cache (`s-maxage=60`) | Reads CDN snapshots, not Postgres, and mints asset URLs locally — no Supabase call on this path at all ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md)). Node only for the `node:crypto` HMAC; edge needs those helpers ported to Web Crypto first, and is the natural next optimization. |
| VPAID unit | Public Vercel Blob (CDN, 1y immutable) | Content-addressed URL straight in `<MediaFile>` — no function at all ([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md)) |
| `GET /api/creative/unit/[token]` | Node | Fallback only, for a logical key not yet in `runtime/manifest.ts`. Removable once every template has been pushed |
| Serving snapshots | Vercel Blob (private), 60s cache | Written by the creative writers and the Stripe webhook; read by `/api/vast`. Private because keys derive from `creative_id`, which is public in every tag URL. |
| `POST /api/stripe/webhook` | Node | Needs raw body for signature verification |
| `GET /api/creative/simid/[token]` | Node | Service-role Storage download; must be Node for supabase-js storage support, same as `/api/vast` |
| `/api/tools/vast/*` | Node | The validator ([ADR-0014](decisions/0014-vast-inspection-engine.md)). Node is required, not incidental: the SSRF guard installs its own `lookup` on the socket via `node:http`/`node:dns`, which has no edge equivalent. Excluded from the middleware matcher — `/hop` sits inside a player's wrapper-resolution timeout |
| Creative runtime assets | Supabase Storage (free tier, CDN) | Static-ish, signed URLs, geo-distributed |
| `/api/dev/*`, `/dev/harness` | Node, **loopback only** | Developer surfaces: a password-less sign-in for a local test account, and a unit served off local `runtime/dist/` so the harness shows the working copy rather than the published object. Kept off the network by the *listener* — `npm run dev` binds `127.0.0.1` — with [`lib/dev-only.ts`](../lib/dev-only.ts) (not production, not Vercel, loopback headers) as a second lock that answers 404. See [security.md](security.md) for why the header check alone would not be enough |

# Architecture

> Status: design phase. This describes the agreed target design, not shipped code.

## Overview

AdInteract has three logically distinct parts with **different trust models and
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
│     users · templates · creatives · subscriptions · creative_events│
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
| `/` | public | Landing; renders the catalog grid at teaser length |
| `/catalog`, `/catalog/[slug]` | public | Template catalog and a detail page with one live in-browser demo. Replaces the old `/preview` fixtures; `/preview` is a permanent redirect |
| `/login`, `/signup`, `/auth/*` | public | Email/password auth; [`middleware.ts`](../middleware.ts) refreshes the session |
| `/dashboard` | session | Redirect only — to `/dashboard/creatives`, or `/catalog` for a user with none |
| `/dashboard/creatives`, `/dashboard/creatives/[id]` | session | The user's creatives, their VAST tags, and delivery counts |
| `/dashboard/creatives/new?template=` | session | The schema-driven configurator with the live player panel |
| `/dashboard/subscriptions` | session | All billing; Stripe checkout returns here |

The public catalog reads `templates` as `anon` — `templates_select_published` already
allows it — and its demo runs a built unit straight from `/api/preview-unit/<key>`, with
sample config derived from the template's own `config_schema` defaults
([`lib/template-demo.ts`](../lib/template-demo.ts)). Browser/SSR Supabase clients live in
[`lib/supabase/`](../lib/supabase).

Dashboard analytics are read through the owner-scoped aggregate
`public.get_creative_overview()` (see [data-model.md](data-model.md)); `creative_events`
itself stays unreadable from the client.

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

### `GET /api/vast?creative_id=XYZ`

The heart of the product and the most demanding endpoint. It is called by ad players
in the wild — **public, unauthenticated, high QPS, latency-sensitive**.

Request flow:

1. Parse + validate `creative_id` (and optional `format` override, macros).
2. Read the denormalized serving record via the `get_creative_serving` RPC
   (service-role; PostgREST doesn't expose the `private` schema, so a SECURITY
   DEFINER function in `public` — EXECUTE restricted to `service_role` — is the
   read path). See [data-model.md](data-model.md).
3. **Subscription gate:** is there an active subscription covering this creative's
   template (single-template sub for that `template_id`, OR an all-access sub)?
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

### Format adapter layer

VAST output is **format-agnostic**. A registry maps a delivery format to an adapter
that knows how to emit the correct VAST fragment and reference the right runtime:

```
FormatAdapter:
  format: 'simid' | 'vpaid' | <future>
  buildMediaNodes(creative, ctx): VastFragment   // e.g. InteractiveCreativeFile (SIMID)
                                                  //      or MediaFile apiFramework=VPAID
  runtimeUrl(creative, ctx): SignedUrl
```

The VAST builder selects the adapter from the user's chosen format on the creative.
Adding a new standard = adding an adapter, not touching the endpoint. See
[ADR-0002](decisions/0002-multi-format-creative-delivery.md).

### Live preview: `POST /api/vast/preview` + `GET /api/vast/preview/[token]`

The dashboard configurator ([`app/dashboard/creatives/new`](../app/dashboard/creatives/new))
has a "Launch Ad" panel ([`components/PreviewPanel.tsx`](../components/PreviewPanel.tsx))
that runs a template with whatever is **currently typed into the form** — before the
creative is saved — in three player backends: an in-house sandbox harness, Google IMA
SDK, and Fluid Player. This is a **separate, authenticated surface**, not a
variant of the public serving path above:

1. `POST /api/vast/preview` — requires a signed-in dashboard user (no subscription
   check: preview is a try-before-you-configure surface, open to any account). Takes
   `{ templateId, format, fields }`, validates them the same way
   `createCreative` does, and mints a **stateless, HMAC-signed, 120s-TTL token**
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

### Stripe webhook `/api/stripe/webhook`

Source of truth for subscription state. Verifies the Stripe signature, then updates
the subscription record + the denormalized serving status. See [billing.md](billing.md).

### Creative runtime / CDN

The actual interactive unit (SIMID iframe document / VPAID JS) is served via
**short-TTL signed URLs** with domain/referer allow-listing, and gets its config
**injected server-side** (never baked into static assets). This is the protection
model — see [ADR-0003](decisions/0003-access-control-over-code-hiding.md).

**MVP hosting: Supabase Storage** (free tier, CDN-backed) with native signed URLs
(`createSignedUrl`, short expiry). No separate paid CDN for MVP. If serving volume
later justifies it, swap the storage adapter for a dedicated CDN (Cloudflare R2, etc.)
without touching the serving logic. See [ADR-0004](decisions/0004-mvp-on-free-tiers.md).

## Runtime placement summary

| Concern | Runtime | Why |
| --- | --- | --- |
| Dashboard / auth pages | Node (Vercel) | Rich, low QPS |
| `GET /api/vast` | Node + CDN cache (`s-maxage=60`) | Full supabase-js/storage support; CDN cache absorbs QPS/latency. Edge is a documented future optimization. |
| `POST /api/stripe/webhook` | Node | Needs raw body for signature verification |
| Creative runtime assets | Supabase Storage (free tier, CDN) | Static-ish, signed URLs, geo-distributed |

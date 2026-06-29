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
2. Read the denormalized serving record (service-role, single indexed lookup).
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
| `GET /api/vast` | Edge + cache | Latency, QPS, global reach |
| `POST /api/stripe/webhook` | Node | Needs raw body for signature verification |
| Creative runtime assets | Supabase Storage (free tier, CDN) | Static-ish, signed URLs, geo-distributed |

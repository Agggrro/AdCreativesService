# MVP Scope

> Status: **proposed** — to be confirmed before code. This is the smallest version
> that proves the core loop and can take money.

## The core loop we must prove

> A buyer subscribes → configures a creative from a template → copies a VAST tag →
> it serves the interactive ad in a DSP/player → when the subscription lapses, it
> stops serving.

If that loop works end-to-end for **one real template in both SIMID and VPAID**, the
product thesis is validated.

## In scope (MVP)

1. **Auth** — Supabase email/password (+ OAuth optional). Profiles with Stripe customer id.
2. **Template showcase** — public landing + catalog of templates (seeded; admin-curated).
3. **One real template end-to-end** — e.g. **Shoppable Video**, optimized into both
   **SIMID** and **VPAID** variants.
4. **Creative configuration** — form driven by the template's `config_schema`
   (video URL, product images, links) + **format picker** (SIMID/VPAID).
5. **VAST tag URL generation** — copyable URL pointing at `GET /api/vast`.
6. **Dynamic VAST endpoint** — format-aware (adapter layer), subscription-gated,
   fails closed, edge + cache. Empty/fallback VAST when not entitled.
7. **Billing** — Stripe Checkout for Single + All-Access; webhook as source of truth;
   denormalized entitlement refresh.
8. **Dashboard** — my creatives, my subscription/billing status, copy VAST tags.
9. **Minimal serving telemetry** — at least impression + quartiles wired into
   `creative_events` (proves the analytics foundation; rich dashboard is post-MVP).

## Implementation status (2026-06-30)

Code-complete and building green:

- [x] Auth (Supabase email/password, middleware, profiles via trigger)
- [x] Template showcase (public landing)
- [x] Creative configuration (format picker + config form)
- [x] VAST tag generation + dynamic `GET /api/vast` (gated, fail-closed, cached)
- [x] Billing: Checkout + webhook (source of truth) + idempotency
- [x] Dashboard (subscriptions, templates, creatives with copyable tags)
- [x] Telemetry beacon `GET /api/track` -> `creative_events`

Remaining before a true end-to-end demo (needs external setup / assets):

- [x] **Interactive runtime assets** — Shop Now overlay authored for both standards
      ([`runtime/shoppable/simid/index.html`](../runtime/shoppable/simid/index.html),
      [`runtime/shoppable/vpaid/unit.js`](../runtime/shoppable/vpaid/unit.js));
      reference impl, still needs upload to Storage + player validation.
- [x] **Seed data** — published Shoppable Video template
      ([`supabase/seed.sql`](../supabase/seed.sql)).
- [ ] **Upload assets** to the private `creatives` bucket (see runtime/README.md).
- [ ] **Live credentials** — Supabase project (apply `schema.sql` + `seed.sql`),
      Stripe products/prices + webhook secret, env vars.
- [ ] **Verification** — render the tag in Google IMA (VPAID) + a SIMID player;
      confirm the kill-switch flips on cancel.
- [ ] **`/security-review`** on payments, auth, and the public endpoints before push.

## Out of scope (post-MVP)

- Additional templates (Branching Story, Lead-Gen) and additional formats.
- Rich analytics dashboard, exports, reporting.
- MRAID / in-app display product line.
- OMID / OM SDK viewability integration.
- Advanced protection hardening (rotating signed keys, granular domain allow-lists).
- Rate limiting/anti-abuse beyond basic caching.
- Team/agency multi-seat, roles, white-label.
- Grace periods / dunning UX for `past_due`.

## Definition of done (MVP)

- [ ] A new user can sign up, subscribe via Stripe (test mode), configure the
      Shoppable Video creative, and copy a VAST tag.
- [ ] That tag renders the interactive ad in a reference player in **both** SIMID
      and VPAID.
- [ ] Cancelling/expiring the subscription flips the tag to empty/fallback within the
      webhook + cache window.
- [ ] `/security-review` clean on payments, auth, and the VAST endpoint.
- [ ] Docs in `docs/` reflect the shipped behavior (`doc-sync` clean).

## Resolved decisions (locked 2026-06-29)

1. **Reference players:** validate against **Google IMA SDK** (primary, free) for
   VPAID, plus a **SIMID-capable player** for SIMID. "It works" = renders + is
   interactive in these.
2. **Creative hosting:** **Supabase Storage** (free tier, CDN-backed) with native
   signed URLs (`createSignedUrl`, short expiry). No paid CDN for MVP. See
   [ADR-0004](decisions/0004-mvp-on-free-tiers.md).
3. **Billing:** recurring Stripe subscriptions with a **7-day trial** for new accounts
   that attach a card. Draft prices: **$2/week** & **$5/month** (single template),
   **$30/month** (Ultimate/all-access). See [billing.md](billing.md).
4. **VAST cache:** TTL **~60s** + **invalidation on Stripe webhook**. Subscription
   changes take effect within ~1 minute. Acceptable per product.

## Cost posture (MVP)

Building and testing the MVP runs on **free tiers ($0)**: GitHub, Next.js/Tailwind/
Lucide, Google IMA, Supabase Free (DB/Auth/Storage), Stripe test mode, Vercel Hobby.
**Going commercial** adds ~$20/mo (Vercel Pro — Hobby is non-commercial only) and
~$25/mo (Supabase Pro, to avoid project sleeping), plus Stripe per-transaction fees.
See [ADR-0004](decisions/0004-mvp-on-free-tiers.md).

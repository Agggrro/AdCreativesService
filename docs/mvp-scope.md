# MVP Scope

> Status: **proposed** — to be confirmed before code. This is the smallest version
> that proves the core loop and can take money.

## The core loop we must prove

> A buyer is granted access → configures a creative from a template → copies a VAST tag →
> it serves the interactive ad in a DSP/player → when access is revoked, it stops
> serving. (During the closed beta access is granted by hand —
> [ADR-0034](decisions/0034-closed-beta-manual-entitlement.md); it was a Stripe
> subscription before.)

If that loop works end-to-end for **one real template in both SIMID and VPAID**, the
product thesis is validated.

## In scope (MVP)

1. **Auth** — Supabase email/password (+ OAuth optional). A profile row per user.
2. **Template showcase** — public landing + catalog of templates (seeded; admin-curated).
3. **One real template end-to-end** — e.g. **Shoppable Video**, optimized into both
   **SIMID** and **VPAID** variants.
4. **Creative configuration** — form driven by the template's `config_schema`
   (video URL, product images, links) + **format picker** (SIMID/VPAID).
5. **VAST tag URL generation** — copyable URL pointing at `GET /api/vast`.
6. **Dynamic VAST endpoint** — format-aware (adapter layer), entitlement-gated,
   fails closed, edge + cache. Empty/fallback VAST when not entitled.
7. **Access** — granted by the admin on `/dashboard/admin` (closed beta, ADR-0034);
   denormalized entitlement refresh on every grant. Billing comes back later.
8. **Dashboard** — my creatives, my access status, copy VAST tags.
9. **Minimal serving telemetry** — impression, viewable and click counted into
   `creative_event_counters` ([ADR-0016](decisions/0016-three-events-hourly-counters.md);
   proves the analytics foundation, rich dashboard is post-MVP). Quartiles were part of
   this line until they were removed for costing a beacon each to duplicate a number the
   buyer's DSP already reports. VAST `<Error>` beacons are counted per code alongside
   them ([ADR-0033](decisions/0033-vast-error-statistics.md)).
10. **Conversion postbacks** — added after the MVP line was drawn, because a media buyer
    running CPA offers cannot judge a creative without them
    ([ADR-0023](decisions/0023-conversion-postbacks.md)). Click destinations go through
    the `/r` redirect, which mints a click id; partner networks post conversions to `/pb`
    with it; the creative page reports clicks, conversions, revenue, CR and EPC over 30
    days, and splits conversions by the goal the network reports — a registration and a
    deposit on one click are two conversions
    ([ADR-0027](decisions/0027-conversion-goals.md)). **Relay** of conversions to the
    traffic source, pixel postbacks and custom status mappings are out of scope.

## Implementation status (2026-06-30)

Code-complete and building green:

- [x] Auth (Supabase email/password, middleware, profiles via trigger)
- [x] Template showcase (public landing)
- [x] Creative configuration (format picker + config form)
- [x] VAST tag generation + dynamic `GET /api/vast` (gated, fail-closed, cached)
- [x] Access: the closed-beta grant with snapshot publish (billing removed, ADR-0034)
- [x] Dashboard (access, templates, creatives with copyable tags, the admin's accounts list)
- [x] Telemetry beacon `GET /api/track` -> `creative_event_counters`
- [x] UI on the **Midnight** design system ([design-system.md](design-system.md),
      [ADR-0022](decisions/0022-midnight-design-system.md), which superseded the
      light-themed Instrument of ADR-0007), bilingual RU/EN with a top-bar switcher
      (locale in a cookie; a `profiles.locale` column is the follow-up)
- [x] Information architecture — first three sections, Каталог / Мои креативы / Подписки
      ([ADR-0008](decisions/0008-catalog-first-information-architecture.md)); since the
      redesign the signed-in navigation is Creatives · Tools · Account, and a creative is a
      workspace of its own ([ADR-0037](decisions/0037-reduced-navigation-and-copy.md),
      [ADR-0038](decisions/0038-creative-workspace.md)); public catalog with live demos
      replaces `/preview`; per-creative delivery counts from `get_creative_overview()`.
      **Needs `supabase/schema.sql` re-applied** before the counts and the serving state
      work against a live database

Remaining before a true end-to-end demo (needs external setup / assets):

- [x] **Interactive runtime assets** — Shop Now overlay authored for both standards
      ([`runtime/shoppable/simid/index.html`](../runtime/shoppable/simid/index.html),
      [`runtime/templates/shoppable/vpaid.js`](../runtime/templates/shoppable/vpaid.js) built
      via `npm run build:runtime` into `runtime/dist/shoppable/vpaid/unit.js` — see
      [runtime/README.md](../runtime/README.md)); reference impl, still needs player validation.
- [x] **Seed data** — published Shoppable Video template
      ([`supabase/seed.sql`](../supabase/seed.sql)).
- [ ] **Upload assets** to the private `creatives` bucket (see runtime/README.md).
- [ ] **Live credentials** — Supabase project (apply `schema.sql` + `seed.sql`),
      `ADMIN_EMAILS`, env vars.
- [ ] **Verification** — render the tag in Google IMA (VPAID) + a SIMID player;
      confirm the kill-switch flips on cancel. The dashboard configurator's
      "Launch Ad" panel (any signed-in user, any template, current unsaved
      config) now gives a fast in-product way to do this ad hoc — Sandbox,
      Google IMA SDK, and Fluid Player tabs — but the checked-off
      state here still refers to validating the real, published Shoppable
      Video assets end-to-end at least once. Pick & Message adds the first
      creative sound ([ADR-0024](decisions/0024-pick-message-template.md)):
      confirm the chime plays inside IMA's cross-origin iframe after a tap,
      stays silent when the player mutes the ad, and what iOS does with it
      under the hardware silent switch.
      Duel ([ADR-0030](decisions/0030-duel-template.md)) needs the same check for an
      unmuted winner clip: it plays with sound after a tap inside IMA, falls back to
      muted when refused, and goes silent when the player mutes the ad mid-clip.
      Step Builder ([ADR-0031](decisions/0031-step-builder-and-forwarded-picks.md)) was
      checked only in a local VPAID host, with no database behind `/dev/harness`. It
      still needs the harness sweep, and IMA and Fluid opening the `AdClickThru` URL
      with the picks on it.
      HTML5 Banner ([ADR-0039](decisions/0039-html5-banner-template.md)) passed the
      harness sweep and a real browser's clicks through its sandboxed frame (every exit
      path, the gesture gate); it still needs IMA and Fluid, where the srcdoc frame
      inherits the host document's CSP, and a real Google Web Designer export.
- [ ] **`/security-review`** on payments, auth, and the public endpoints before push.

## Out of scope (post-MVP)

- Additional templates (Branching Story, Lead-Gen) and additional formats.
- Rich analytics dashboard, exports, reporting. (The per-creative conversion report of
  ADR-0023 is the one exception: a fixed 30-day view, no filters, no export.)
- Postback relay to traffic sources, pixel postbacks, custom status mapping, and bot
  filtering on the click redirect ([ADR-0023](decisions/0023-conversion-postbacks.md)).
- The **free tools section** (`/tools/*`) was not in the MVP and is not part of the
  core loop above. It ships as an acquisition surface alongside it — see
  [ADR-0013](decisions/0013-public-free-tools-section.md). The VAST validator is
  built, and since [ADR-0035](decisions/0035-vast-video-creatives.md) so is the VAST
  generator: a linear video creative, VAST 2.0–4.3, saved to the account and served and
  gated like any other ([ADR-0036](decisions/0036-public-tool-that-saves.md) for how a
  public page saves). Wrapper and fallback third-party tags are still out.
- MRAID / in-app display product line.
- Becoming our own OMID verification vendor (IAB Tech Lab partner
  registration, running an OM SDK service, MRC accreditation). OMID
  *pass-through* for SIMID and a self-built, non-accredited viewability
  module for VPAID are implemented — see [ADR-0012](decisions/0012-viewability-measurement.md).
- Advanced protection hardening (rotating signed keys, granular domain allow-lists).
- Rate limiting/anti-abuse beyond basic caching. **Now overdue rather than
  merely deferred:** the free VAST validator is a public, unauthenticated
  endpoint that performs outbound HTTP on request, which is a materially
  different exposure from the cached read paths this line was written for. See
  `docs/security.md`, "Outbound fetches to untrusted URLs".
- Team/agency multi-seat, roles, white-label.
- Grace periods / dunning UX for `past_due`.

## Definition of done (MVP)

- [ ] A new user can sign up, be granted access on `/dashboard/admin`, configure the
      Shoppable Video creative, and copy a VAST tag.
- [ ] That tag renders the interactive ad in a reference player in **both** SIMID
      and VPAID.
- [ ] Revoking access flips the tag to empty/fallback within the publish + cache
      window.
- [ ] `/security-review` clean on payments, auth, and the VAST endpoint.
- [ ] Docs in `docs/` reflect the shipped behavior (`doc-sync` clean).

## Resolved decisions (locked 2026-06-29)

1. **Reference players:** validate against **Google IMA SDK** (primary, free) for
   VPAID, plus a **SIMID-capable player** for SIMID. "It works" = renders + is
   interactive in these.
2. **Creative hosting:** **Supabase Storage** (free tier, CDN-backed) with native
   signed URLs (`createSignedUrl`, short expiry). No paid CDN for MVP. See
   [ADR-0004](decisions/0004-mvp-on-free-tiers.md). *Since amended:* the runtime units
   moved to a public Vercel Blob store
   ([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md)) and advertiser media to
   Cloudflare R2 behind `media.smithcdn.net`
   ([ADR-0028](decisions/0028-creative-media-on-r2.md)); then the units joined the media
   on R2 and the ad path moved to a Cloudflare Worker
   ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)).
3. **Billing:** none during the closed beta — terms are agreed in person and access is
   granted by hand ([ADR-0034](decisions/0034-closed-beta-manual-entitlement.md)). The
   Stripe design that preceded it (recurring subscriptions, 7-day trial, $2/week,
   $5/month, $30/month) is in git history. See [billing.md](billing.md).
4. **VAST cache:** TTL **~60s** + **snapshot republished on every grant or revoke**.
   Access changes take effect within **~2 minutes worst case** — the 60s response
   cache plus up to 60s of snapshot propagation (Workers KV since ADR-0029)
   ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md); it was ~1 minute while the
   serving view was read live). Acceptable per product.

## Cost posture (MVP)

Building and testing the MVP runs on **free tiers ($0)**: GitHub, Next.js/Tailwind/
Lucide, Google IMA, Supabase Free (DB/Auth/Storage), Vercel Hobby.
**Going commercial** moved hosting to Cloudflare Workers Paid ($5/mo plus about $0.30
per million requests past ten million — [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md))
instead of Vercel Pro, whose per-invocation pricing sat on the impression path. Still to
add: ~$25/mo for Supabase Pro, to avoid project sleeping, plus a billing provider's
per-transaction fees once one returns. See [ADR-0004](decisions/0004-mvp-on-free-tiers.md).

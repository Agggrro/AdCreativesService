# 0008. Catalog-first information architecture

- Status: Accepted
- Date: 2026-07-27

## Context

The dashboard had two nav items, `Креативы` (`/dashboard`) and `Новый креатив`. The first
was named after an object but contained three unrelated things — subscriptions, the
template catalog, and the user's own creatives — so billing lived inside creatives. The
second was not a section at all; it was a button occupying a slot in the navigation.

A second problem sat on the public side. `/preview` renders the interactive mechanics with
sample config and is the most persuasive surface the product has, but it exists only for
signed-out visitors: after logging in there is no route back to it, and the dashboard's own
template list is a separate, DB-backed table with no demo. The two surfaces had also
drifted — `/preview`'s four hardcoded fixtures carry values that no longer match the
`config_schema` defaults in `supabase/seed.sql` (slider at 55 against a default of 50,
scratch threshold at 35 against 40).

Meanwhile the dashboard displayed a status column that could not be wrong because it could
not be anything: `creatives.status` is hardcoded to `'active'` on insert and has no update
path, so every row rendered the same `live` rail — the exact failure
[design-system.md](../design-system.md) §6 names as a decorative rail.

## Decision

- **Three sections: Каталог · Мои креативы · Подписки.** "Новый креатив" leaves the
  navigation; creation starts from a catalog tile. `/dashboard` redirects — to
  `/dashboard/creatives` for a user who has creatives, to `/catalog` for one who does not,
  because an empty table is a bad first screen.
- **`/catalog` and `/catalog/[slug]` are public and replace `/preview`**, which becomes a
  permanent redirect with a legacy `?t=` map. One implementation serves both the
  signed-out visitor and the signed-in buyer, which is what makes the demo reachable after
  login. The slug is `templates.type` hyphenated, guarded by a unique index on `type` —
  deliberately not the Storage runtime key, so renaming a build directory cannot break a
  marketing URL.
- **A tile is static; the live demo lives on the detail page, one per page.** This is a
  correctness constraint, not a performance preference: the VPAID host is the global
  `window.getVPAIDAd`, so a second unit on a page overwrites the first.
- **Demo config is derived from the template's own `config_schema` defaults** (plus
  committed placeholder assets and a two-entry override map), not from hand-written
  fixtures. The configurator already builds its initial values the same way, so the two can
  no longer drift.
- **Dashboard analytics are read through `public.get_creative_overview()`** — a
  parameterless `SECURITY DEFINER` aggregate scoped to `auth.uid()`, returning six counts
  and `is_entitled`. `creative_events` keeps zero RLS policies and stays unreadable from
  the client.
  > **Amended by [ADR-0016](0016-three-events-hourly-counters.md) (2026-08-16):** three
  > counts, not six, and the table behind it is now `creative_event_counters`. The shape
  > of the decision — one owner-scoped definer aggregate, zero RLS policies on the
  > underlying table — is unchanged.
- **The creatives list shows a serving state derived from entitlement**, not
  `creatives.status`. Two honest values: serving, or not serving with a link to Подписки.
- **Only ingested metrics are displayed:** impression, start, and the completion funnel.
  No clicks, no CTR, no request count, no fill rate.
  > **Reversed in part by [ADR-0016](0016-three-events-hourly-counters.md)
  > (2026-08-16):** the ingested set is now impression, viewable and **click** — the
  > last fired only from the call-to-action that opens the advertiser's URL. Start and
  > the quartiles are no longer ingested at all. CTR became derivable and is permitted,
  > though not yet displayed. Request count and fill rate remain unavailable, so those
  > two stay barred. The principle — display nothing we do not ingest — is untouched;
  > what changed is what we ingest.
- **`creatives.name` is added** so two creatives from one template are distinguishable by
  something other than a uuid.

## Consequences

- Billing gains its own surface, which means `success_url`/`cancel_url` in
  `app/api/checkout/route.ts` move to `/dashboard/subscriptions`, and single-template
  purchase — which lived only in the dashboard's template table — must reappear on the
  catalog detail page or that revenue becomes unreachable.
- The public catalog reads `templates` as `anon`. That already works:
  `templates_select_published` grants anon read of published rows, and
  `/api/preview-unit/*` is already public and outside the middleware matcher. No new
  exposure is created.
- Choosing an aggregate RPC over an owner-scoped RLS policy on `creative_events` keeps the
  table closed. A policy would have opened `meta` and per-row `occurred_at` to the client
  permanently in exchange for six integers, and PostgREST cannot aggregate, so it would
  also have cost one round trip per creative. Choosing it over a service-role read from a
  server component keeps the tenant boundary a database guarantee instead of one `.eq()`
  in application code.
- The RPC reads `creative_events` only because its owner is exempt from RLS. If anyone
  ever runs `alter table public.creative_events force row level security`, it silently
  returns zeros — the reason is recorded next to the function in `schema.sql`.
- Deriving the slug from `type` requires `type` to be unique, which it was not. If two
  templates of one type ever become a real product need, the fix is a dedicated
  `slug text unique` column, not dropping the index.
- `preview_url` is now provably dead: NULL in every row, rendered nowhere, and this design
  guarantees no thumbnail will ever need it. It is documented as reserved pending removal.
- Statuses `draft`, `paused` and `archived` remain unreachable in the shipped product. The
  backend for a per-creative kill switch already exists — the enum value, the
  `creatives_update_own` policy, and the `status = 'active'` term in the serving gate — and
  only a server action is missing. Deferred, and named here so it is not rediscovered as a
  surprise.

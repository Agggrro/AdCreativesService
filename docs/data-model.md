# Data Model

> Status: **implemented** in [`supabase/schema.sql`](../supabase/schema.sql). This doc
> is the conceptual companion (entities, intent, RLS rationale); keep it in sync with
> the SQL on every change.

## Entities

### `users`
Backed by Supabase Auth (`auth.users`). App-level profile data lives in a `profiles`
table keyed by the auth user id, holding `stripe_customer_id` and preferences.

### `templates`
Catalog of available interactive ad templates (admin-curated, read-only to users).

| Field | Notes |
| --- | --- |
| `id` | uuid PK |
| `name`, `description` | display |
| `type` | e.g. `shoppable_video`, `branching_story`, `lead_gen`. **Unique** — the public catalog URL is `/catalog/<type hyphenated>` ([ADR-0008](decisions/0008-catalog-first-information-architecture.md)) |
| `category` | grouping for the catalog; populated (`commerce`, `interactive`) but not yet used as a filter |
| `supported_standards` | array, e.g. `{simid, vpaid}` — drives the format picker |
| `runtime_keys` | per-standard pointer to the runtime build. Its first path segment is also the demo unit key used by `/api/preview-unit/<key>` |
| `preview_url` | **Reserved, unused.** NULL in every row and rendered nowhere: the catalog shows a live demo rather than a thumbnail. Remove it or fill it — do not read it |
| `config_schema` | JSON schema describing the fields a user must fill. Since [ADR-0011](decisions/0011-conditional-grouped-config-schemas.md) a field may also carry `group` / `block` (presentation) and `showWhen` (conditional visibility), and a `groups` root key declares how each section renders. Field **order is significant**: visibility resolves top-down, so a field's controllers must be declared before it. Since [ADR-0012](decisions/0012-viewability-measurement.md), `showWhen` may also gate on the synthetic `"selected_format"` controller — the creative's chosen delivery format, not a schema field — used e.g. to show OMID vendor fields only when SIMID is selected |
| `pricing_tier` | links to a Stripe price / plan |
| `created_at`, `updated_at` | |

### `creatives`
A user's configured instance of a template.

| Field | Notes |
| --- | --- |
| `id` | uuid PK (this is the `creative_id` in the VAST URL) |
| `user_id` | FK → auth user |
| `template_id` | FK → templates |
| `name` | optional user label; the UI falls back to the template name. Without it two creatives from one template differ only by uuid |
| `selected_format` | `simid` \| `vpaid` \| … — user's choice; must be in template's `supported_standards` |
| `config_json` | jsonb — validated against the template's `config_schema`. Holds only the fields that were **active** at save time, so two creatives built from the same template can legitimately have different key sets, and a conditional field's absence is meaningful rather than a gap ([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)). Nothing reading it may assume a fixed shape |
| `status` | `draft` \| `active` \| `paused` \| `archived`. **Only `active` is reachable today** — it is hardcoded on insert and nothing updates it. The dashboard therefore shows a serving state derived from entitlement, not this column ([ADR-0008](decisions/0008-catalog-first-information-architecture.md)). A per-creative kill switch still has no server action: what shipped instead is a **hard delete** (`deleteCreative`), which takes the row, its delivery counters, and its uploaded media with it. Both `should_serve` expressions already gate on `status = 'active'`, so setting `archived` would silence a tag identically while keeping its history — the non-destructive option remains one `UPDATE` away and is worth revisiting |
| `created_at`, `updated_at` | |

### `subscriptions`
Source-of-truth mirror of Stripe state. See [billing.md](billing.md).

| Field | Notes |
| --- | --- |
| `id` | uuid PK |
| `user_id` | FK → auth user |
| `plan_type` | `single` \| `all_access` |
| `template_id` | FK → templates, **null for all-access** |
| `status` | `active` \| `trialing` \| `past_due` \| `canceled` \| `incomplete` |
| `stripe_subscription_id`, `stripe_customer_id` | |
| `current_period_end` | ts; the effective expiry used by the gate |
| `cancel_at_period_end` | bool |
| `created_at`, `updated_at` | |

### `creative_event_counters` (analytics)
Ingested ad delivery — the core value for media buyers. **Counts, not events**
([ADR-0016](decisions/0016-three-events-hourly-counters.md)): one row per
(creative, event, hour), not one row per beacon. Not permanent: the FK to
`creatives` is `on delete cascade`, so deleting a creative destroys its entire
delivery history with it. There is no export and no soft delete, which is why the
confirmation dialog names the loss explicitly rather than saying only that the
action cannot be undone.

| Field | Notes |
| --- | --- |
| `creative_id` | FK, `on delete cascade` — see above. Part of the PK |
| `event_type` | Only three are ever written: `impression`, `viewable`, `click`. The enum still carries the retired video-progress values and `interaction`, none of which anything produces. **`viewable` is VPAID-only** — self-reported, non-OMID-accredited (ADR-0012); a SIMID creative never writes it, since its viewability is measured by the advertiser's own OMID vendor, which we don't ingest. **`click` fires only from the creative's final call-to-action**, the one that opens the advertiser's URL — never from an intermediate interaction such as a quiz answer, so it reads lower than a DSP's click count |
| `bucket` | `date_trunc('hour', now())` at ingest. Collapsed to one bucket per day for data older than 30 days by `rollup_creative_events()`, called from the daily cron |
| `count` | bigint, incremented in place |

> Volume note: size is now a function of creatives × events × time, not of
> traffic. Roughly 1000 creatives × 3 events × 24 h ≈ 26M rows/year before the
> 30-day rollup, which is what the rollup exists to bound.

Ingested by [`app/api/track/route.ts`](../app/api/track/route.ts) — a public,
fire-and-forget beacon that maps the three VAST/runtime event names to the enum and
calls `public.increment_creative_event()` via the service role. The upsert lives in
SQL because PostgREST cannot express `on conflict do update set count = count + 1`,
and a read-then-write in app code would lose updates under the concurrency this
path is built for. Each beacon URL is HMAC-signed at VAST-build time with a 1-hour
expiry ([`lib/track-token.ts`](../lib/track-token.ts)) — a `creative_id` is visible
in the VAST tag itself, so without a signature anyone holding a tag could forge hits
for it, and these counts feed a customer-facing dashboard. See
[security.md](security.md).

**What is not collected**, so no screen may imply it: `start`, the quartiles and `complete` are no
longer emitted into the VAST at all, so the completion funnel is gone; `error` beacons
arrive but are dropped at ingest because the name is absent from the event map; and
`/api/vast` writes nothing, so ad *requests* are uncounted and fill rate cannot be
derived. **CTR is now computable** (impressions and clicks are both ingested) but is
not displayed — see design-system.md §6 for why the denominator has to be stated.

There is also no per-impression detail any more, by construction. Frequency, unique
reach and session paths need a different store, not a different query.

**Read path.** The table has RLS enabled with **no policies**, so the session client reads
zero rows by design. The dashboard reads aggregates through
`public.get_creative_overview()` — a parameterless `SECURITY DEFINER` function scoped to
`auth.uid()` that returns three counts plus `is_entitled` and `should_serve` per
creative, granted to `authenticated` only. Those last two are not analytics: the serving
badge and the state rail depend on them. It works because the function owner is exempt
from RLS; running `alter table public.creative_event_counters force row level security`
would make it silently return zeros.

### `stripe_events` (webhook idempotency)
Ledger of processed Stripe event ids. Service-role only; no client access.

| Field | Notes |
| --- | --- |
| `id` | text PK — the Stripe event id |
| `type` | event type |
| `received_at` | ts |

## Relationships

```
auth.users 1──* creatives *──1 templates
auth.users 1──* subscriptions *──0..1 templates   (null template_id = all-access)
creatives  1──* creative_event_counters
```

## The serving read (hot path)

The VAST endpoint must answer "is this creative currently entitled to serve?" with a
single fast lookup. Implemented as the view **`private.creative_serving`** (in a
dedicated `private` schema that is **not exposed to the API**), keyed by `creative_id`,
exposing `template_id`, `selected_format`, `config_json`, `creative_status`,
`template_type`, `runtime_keys`, `supported_standards`, plus resolved `is_entitled`
and `should_serve` flags.

Entitlement is resolved **live** via an indexed `EXISTS` against `subscriptions`
(active/trialing, non-expired, covering the template via all-access or matching
single) — backed by the partial index `subscriptions_active_lookup_idx`. A live view
(rather than a trigger-maintained table) keeps it always-correct with no refresh
plumbing; the ~60s edge cache (ADR-0004 / mvp-scope) absorbs the read cost. Promote to
a materialized record only if profiling demands it.

Read via the **service role**, which **bypasses RLS by design** (no user session
exists on this path); access to the `private` schema is granted to `service_role`
only. Because PostgREST does not expose `private`, the endpoint reads through the
**`public.get_creative_serving(uuid)` RPC** — a SECURITY DEFINER function whose
EXECUTE is granted to `service_role` only and which returns an explicit TABLE
(self-contained for introspection). See [security.md](security.md).

## Storage buckets

Two Supabase Storage buckets, deliberately different trust models:

| Bucket | Access | Holds | Notes |
| --- | --- | --- | --- |
| `creatives` | **Private** — fallback only | Runtime SIMID/VPAID units (code) | No longer the primary home: the runtime lives in a public, content-addressed Vercel Blob store ([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md)), and this bucket is read only by `lib/runtime-bytes.ts` for a logical key not yet in `runtime/manifest.ts`. Removable once every template has been pushed |
| `creative-media` | **Public-read** | Advertiser-uploaded images/gifs/video for `"image"`-typed config fields | Public because the URL is baked into `<AdParameters>` and must keep resolving for the creative's lifetime. Created declaratively in `supabase/schema.sql`. Uploads go straight from the browser, RLS-gated to the uploader's own `{auth.uid()}/...` path prefix. See [ADR-0010](decisions/0010-advertiser-media-uploads.md) |

## Serving snapshots (outside Postgres)

The ad-serving path does not read any of the above at request time. It reads two JSON
documents in a **private** Vercel Blob store, republished by the writers that change
the underlying rows ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md)):

| Key | Projection of | Republished by |
| --- | --- | --- |
| `serving/creative/<creative_id>.json` | `private.creative_serving`, minus the two computed columns | `createCreative` / `updateCreative`; removed by `deleteCreative` **before** the row |
| `serving/entitlement/<user_id>.json` | that user's `subscriptions` rows, as facts (`status`, `plan_type`, `template_id`, `current_period_end`) | the Stripe webhook's `upsertSubscription` |

Postgres remains the source of truth; these are a projection of it, and
`npm run snapshot:backfill` rebuilds them from it idempotently. Note that a creative
snapshot copies `template_type`, `runtime_keys` and `supported_standards` from
`templates` — so **`npm run db:seed` must be followed by a backfill**.

`is_entitled` / `should_serve` are deliberately *not* stored. They depend on `now()`,
and freezing them would keep a lapsed subscription serving whenever a Stripe webhook
was missed or delayed.

## RLS intent

| Table | Policy intent |
| --- | --- |
| `profiles` | owner can read/update own row |
| `templates` | **published** templates readable by anon + authenticated (public showcase); drafts hidden; writes admin-only (service role) |
| `creatives` | owner can CRUD own rows only |
| `subscriptions` | owner can **read** own rows; **no client writes** (only webhook via service role) |
| `creative_event_counters` | **no direct client access** (RLS on, zero policies); writes via the ingest beacon with the service role, reads only through the owner-scoped aggregate `public.get_creative_overview()` |
| `stripe_events` | **no direct client access**; written only by the webhook (service role) |
| `storage.objects` (`creative-media`) | authenticated users can insert/update/delete only under their own `auth.uid()` path prefix; select is public (any role) — the bucket's own public-read already bypasses RLS for plain GETs, this policy just keeps `.list()`/`.download()` consistent |

RLS protects the **dashboard** path. It is intentionally not relied upon for the
public VAST path, which uses a narrowly scoped service-role read.

`schema.sql` also issues explicit table **grants** to the API roles (`anon`,
`authenticated`, `service_role`). Supabase usually auto-grants these, but not
reliably across projects/key formats — without them every role hits
`permission denied`. The grant is the table-level privilege; **RLS is still the
row-level gate** (a grant without a matching policy yields zero rows).

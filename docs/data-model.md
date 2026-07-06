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
| `type` | e.g. `shoppable_video`, `branching_story`, `lead_gen` |
| `category` | grouping for the showcase |
| `supported_standards` | array, e.g. `{simid, vpaid}` — drives the format picker |
| `runtime_keys` | per-standard pointer to the runtime build (e.g. simid/vpaid asset ids) |
| `preview_url` | showcase preview |
| `config_schema` | JSON schema describing the fields a user must fill |
| `pricing_tier` | links to a Stripe price / plan |
| `created_at`, `updated_at` | |

### `creatives`
A user's configured instance of a template.

| Field | Notes |
| --- | --- |
| `id` | uuid PK (this is the `creative_id` in the VAST URL) |
| `user_id` | FK → auth user |
| `template_id` | FK → templates |
| `selected_format` | `simid` \| `vpaid` \| … — user's choice; must be in template's `supported_standards` |
| `config_json` | jsonb — validated against the template's `config_schema` |
| `status` | `draft` \| `active` \| `paused` \| `archived` |
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

### `creative_events` (analytics)
Ingested ad events — the core value for media buyers. Append-only.

| Field | Notes |
| --- | --- |
| `id` | bigint PK |
| `creative_id` | FK |
| `event_type` | `impression` \| `start` \| `q25` \| `q50` \| `q75` \| `complete` \| `interaction` \| `click` |
| `meta` | jsonb (device, geo bucket, interaction detail) |
| `occurred_at` | ts |

> Volume note: this table can grow fast. MVP may use plain Postgres; revisit
> partitioning / a dedicated analytics store post-MVP.

Ingested by [`app/api/track/route.ts`](../app/api/track/route.ts) — a public,
fire-and-forget beacon that maps VAST event names (start/firstQuartile/… plus
impression/click) to the enum and inserts via the service role.

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
creatives  1──* creative_events
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

## RLS intent

| Table | Policy intent |
| --- | --- |
| `profiles` | owner can read/update own row |
| `templates` | **published** templates readable by anon + authenticated (public showcase); drafts hidden; writes admin-only (service role) |
| `creatives` | owner can CRUD own rows only |
| `subscriptions` | owner can **read** own rows; **no client writes** (only webhook via service role) |
| `creative_events` | **no direct client access**; writes via serving/ingest layer, reads via aggregated/owner-scoped views |
| `stripe_events` | **no direct client access**; written only by the webhook (service role) |

RLS protects the **dashboard** path. It is intentionally not relied upon for the
public VAST path, which uses a narrowly scoped service-role read.

`schema.sql` also issues explicit table **grants** to the API roles (`anon`,
`authenticated`, `service_role`). Supabase usually auto-grants these, but not
reliably across projects/key formats — without them every role hits
`permission denied`. The grant is the table-level privilege; **RLS is still the
row-level gate** (a grant without a matching policy yields zero rows).

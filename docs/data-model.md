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
| `status` | `active` \| `trialing` \| `past_due` \| `canceled` \| `incomplete`. **`canceled` is final**: the trigger `subscriptions_keep_canceled` skips any update that would move a row out of it — Stripe never revives a canceled subscription, so such a write is an older view landing late (see [billing.md](billing.md)) |
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
derived. **CTR is displayed** on the creative page, over impressions — see
design-system.md §6 for why the denominator has to be stated.

There is also no per-impression detail any more, by construction. Frequency, unique
reach and session paths need a different store, not a different query. Clicks that go
through the `/r` redirect are the one exception, and they live in their own table below
— this counter's `click` is the `<ClickTracking>` beacon and is unchanged.

**Read path.** The table has RLS enabled with **no policies**, so the session client reads
zero rows by design. The dashboard reads aggregates through
`public.get_creative_overview()` — a parameterless `SECURITY DEFINER` function scoped to
`auth.uid()` that returns three counts plus `is_entitled` and `should_serve` per
creative, granted to `authenticated` only. Those last two are not analytics: the serving
badge and the state rail depend on them. It works because the function owner is exempt
from RLS; running `alter table public.creative_event_counters force row level security`
would make it silently return zeros.

### Conversion tracking ([ADR-0023](decisions/0023-conversion-postbacks.md))

Four tables behind the click redirect (`/r`) and the S2S postback (`/pb`). All four
have RLS on with **zero policies** and no table privileges for `anon`/`authenticated`;
the owner reaches them only through the functions named below.

#### `creative_clicks`
One row per click through `/r` with a live signature — the only per-event store in the
schema, because a conversion is attributed to a click id and a counter cannot hold one.

| Field | Notes |
| --- | --- |
| `click_id` | text PK, 24 lower-case hex (12 random bytes), minted by `/r` |
| `creative_id` | FK → creatives, `on delete cascade` |
| `field` | the config field the viewer left through: `clickThroughUrl`, or a quiz exit such as `resultABUrl` |
| `country` | ISO 3166-1 alpha-2 from the platform's geo header, or null. **No IP address is stored** |
| `created_at` | ts; the 30-day attribution window is measured from it |

Written only by `record_click()`, called from `app/api/click/route.ts` with the service
role in `waitUntil`, for a fresh signed link fetched by something that is not a known
crawler. It declines past 600 rows per creative per minute — `/v` is public, so a tag's
links can be replayed, and each replay here would otherwise be a row. Purged after
**90 days** by `purge_tracking_data()` from the daily cron.

#### `conversions`
What partner networks reported. Kept for good — they are the record.

| Field | Notes |
| --- | --- |
| `id` | bigint identity PK |
| `click_id` | the click it credits. **Not a foreign key**, on purpose: clicks are purged at 90 days and a conversion must outlive its click |
| `creative_id` | FK → creatives, `on delete cascade`; copied off the click at insert, as is `field` |
| `field` | the exit, as on the click |
| `goal` | the goal the network reported — its goal id or name, kept as sent — or `''` when it sends none; CHECK ≤ 64 characters ([ADR-0027](decisions/0027-conversion-goals.md)) |
| `txid` | the network's transaction id, `''` when it sends none. `unique (click_id, goal, txid)` — one conversion per goal per click unless the network distinguishes several with a txid, and a repeat postback updates rather than duplicates. Was `(click_id, txid)` before ADR-0027; every older row has goal `''` |
| `status` | `approved` \| `pending` \| `rejected` (text + CHECK, not an enum), normalized from what the network sent by `lib/postback.ts`. A late `pending` never overwrites `approved` or `rejected` |
| `payout` | numeric(14,4), 0 when not sent |
| `currency` | ISO 4217 code, `USD` when not sent. No FX: reports sum per currency |
| `created_at`, `updated_at` | `created_at` is when the first postback arrived — reports bucket by it, so a conversion stays on that day while a later status change moves it between approved, pending and rejected there |

Written only by `record_postback()`. Read through `get_creative_conversions()` and
`get_creative_conversion_goals()`.

#### `postback_keys`
| Field | Notes |
| --- | --- |
| `user_id` | PK, FK → auth user |
| `key` | 32 lower-case hex, unique. The whole of the postback's authentication. Stored in the clear so the owner can copy the URL again; rotation is the remedy for a leak |
| `created_at` | when this key was made (reset on rotation) |

Made on first visit to the settings page by `ensure_postback_key()`, replaced by
`rotate_postback_key()`. `has_postback_key()` asks without making one — the creative page
warns about a destination missing `{click_id}` only for an account that has set a
postback up.

#### `postback_log`
Every postback that named a valid key, successful or not — a network's own log shows
only an HTTP status. A wrong key writes nothing.

| Field | Notes |
| --- | --- |
| `id` | bigint identity PK |
| `user_id` | FK → auth user |
| `received_at` | ts |
| `params` | jsonb: the six parameters `/pb` reads, as received, each truncated to 128 characters (never inside a surrogate pair), NUL removed. CHECK ≤ 4 KB. Nothing else from the request |
| `result` | `created`, `updated`, `unchanged` (a retry, or a late `pending` after a final status), or a rejection code (`unknown_click`, `expired_click`, `bad_click_id`, `unexpanded_macro`, …) |

Read through `get_postback_log()`; purged after **7 days**. At most 3,600 rows per account
per hour, written best-effort: past the cap, or on a failed write, the postback is still
processed and only its log line is skipped.

#### Functions

| Function | Caller | Does |
| --- | --- | --- |
| `record_click(click_id, creative_id, field, country, per_minute)` | service role (`/r`) | Inserts the click unless the creative already has `per_minute` clicks in the last minute. Returns whether it wrote |
| `record_postback(key, click_id, status, payout, currency, txid, error, params, goal = '')` | service role (`/pb`) | Resolves the key to its owner; updates the owner's conversion for `(click_id, goal, txid)` if there is one (no window; `unchanged` when nothing would change), else inserts if the click is the owner's and under 30 days old; logs the hit. Returns the result code. `goal` is last and defaulted, so a caller passing the eight earlier arguments still resolves (ADR-0027) |
| `purge_tracking_data(click_days, log_days)` | service role (daily cron) | Retention for clicks and the log. Floors of 31 and 1 days, whatever is passed — a click must outlive the attribution window |
| `get_creative_conversions(creative_id, days)` | authenticated | Clicks and approved/pending/rejected counts plus approved revenue per currency, per (UTC day, exit), for **one creative the caller owns** — the ownership check is inside |
| `get_creative_conversion_goals(creative_id, days)` | authenticated | The same window, bucketing and ownership check, per goal: approved/pending/rejected counts and approved revenue per currency. No clicks — a click has no goal (ADR-0027) |
| `ensure_postback_key()` / `rotate_postback_key()` / `has_postback_key()` / `get_postback_log(limit)` | authenticated | The caller's own key and log, scoped to `auth.uid()` |

### `stripe_events` (webhook idempotency)
Ledger of claimed and processed Stripe event ids. Service-role only; no client access.

| Field | Notes |
| --- | --- |
| `id` | text PK — the Stripe event id |
| `type` | event type |
| `received_at` | ts — when the event was last claimed: first delivery, or a takeover of an abandoned claim |
| `processed_at` | ts, nullable — when the handler finished; null while in flight or abandoned. Only a processed event is a duplicate (see [billing.md](billing.md), "Idempotent") |

## Relationships

```
auth.users 1──* creatives *──1 templates
auth.users 1──* subscriptions *──0..1 templates   (null template_id = all-access)
creatives  1──* creative_event_counters
creatives  1──* creative_clicks
creatives  1──* conversions            (click_id is a soft reference — clicks expire)
auth.users 1──0..1 postback_keys
auth.users 1──* postback_log
```

## The serving read (hot path)

The VAST endpoint must answer "is this creative currently entitled to serve?" with a
single fast lookup. Implemented as the view **`private.creative_serving`** (in a
dedicated `private` schema that is **not exposed to the API**), keyed by `creative_id`,
exposing `template_id`, `selected_format`, `config_json`, `creative_status`,
`template_type`, `runtime_keys`, `supported_standards`, plus resolved `is_entitled`
and `should_serve` flags, and `click_fields` — the `config_schema` fields of type `url`
except the OMID `verificationScriptUrl`, i.e. the click destinations the VAST builder
routes through `/r` and the only fields `/r` will redirect to
([ADR-0023](decisions/0023-conversion-postbacks.md)).

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

Two Supabase Storage buckets with deliberately different trust models, and one R2
bucket that took over the advertiser media:

| Bucket | Access | Holds | Notes |
| --- | --- | --- | --- |
| `creatives` | **Private** — fallback only | Runtime SIMID/VPAID units (code) | No longer the primary home: the runtime lives content-addressed under `runtime/` in the R2 `creative-media` bucket ([ADR-0017](decisions/0017-runtime-assets-on-public-cdn.md), [ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)), and this bucket is read only by `lib/runtime-bytes.ts` for a logical key not yet in `runtime/manifest.ts`. Removable once every template has been pushed |
| R2 `creative-media` (Cloudflare) | **Public-read**, served at `media.smithcdn.net` | Advertiser-uploaded images/gifs/video for `"image"`-typed config fields — every upload since [ADR-0028](decisions/0028-creative-media-on-r2.md) — and, under `runtime/`, the content-addressed creative units ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)), which no media key can name | Public because the URL is baked into `<AdParameters>` and must keep resolving for the creative's lifetime. Not in `schema.sql`: there is no RLS in R2. The browser uploads with a presigned PUT that signs type and size; deletes go through `deleteCreative` with the server's bucket-scoped key, guarded in `lib/r2.ts` by the owner's `{userId}/` prefix and the exact key shape (`MEDIA_KEY_RE`). Cached for a day at the edge and in browsers, so a deleted creative's files stop being served within a day |
| Supabase `creative-media` | **Public-read** | The same media, uploaded before ADR-0028 or on a deployment without the R2 variables | Created declaratively in `supabase/schema.sql`. Uploads go straight from the browser, RLS-gated to the uploader's own `{auth.uid()}/...` path prefix ([ADR-0010](decisions/0010-advertiser-media-uploads.md)). `npm run media:migrate` copies what a creative references to R2 and repoints its config; the objects stay here as the rollback |

A media URL in `config_json` is ours when `parseOwnMediaUrl()` (`lib/creative-media.ts`)
recognizes either store's prefix *and* the key is exactly `{uuid}/{uuid}.{ext}` — the
shape `buildMediaObjectPath()` mints. `deleteCreative` removes each of its own keys from
**both** stores (a migrated file's Supabase original shares the key), except a key another
of the user's creatives still references. Replacing a file in the configurator does not
delete the old object: until the form is saved the live tag still points at it, so a
replaced file stays behind as an orphan.

## Serving snapshots (outside Postgres)

The ad-serving path does not read any of the above at request time. It reads two JSON
documents in the Workers KV namespace `creosmith-snapshots` — which has no public URL —
republished by the writers that change the underlying rows
([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md),
[ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)). The app's Worker
writes it through its binding, the Node scripts (`npm run snapshot:backfill`) over the
REST API. The private Vercel Blob store the documents lived in before went with Vercel:

| Key | Projection of | Republished by |
| --- | --- | --- |
| `serving/creative/<creative_id>.json` | `private.creative_serving`, minus the two computed columns | `createCreative` / `updateCreative`; removed by `deleteCreative` **before** the row, and once more after it; the reconciler |
| `serving/entitlement/<user_id>.json` | that user's `subscriptions` rows, as facts (`status`, `plan_type`, `template_id`, `current_period_end`) | the Stripe webhook's `upsertSubscription`; the reconciler |

The **reconciler** (`lib/serving/reconcile.ts`, `/api/cron/reconcile`, every ten minutes
on the app's Worker) compares every snapshot whose row changed in the last four days with
what a publish would write now, and republishes the ones that drifted — a store that could
neither take a write nor clear it, a webhook whose retries ran out. A publish re-reads the
row after writing and removes the snapshot if the creative was deleted meanwhile.

Postgres remains the source of truth; these are a projection of it, and
`npm run snapshot:backfill` rebuilds them from it idempotently. Note that a creative
snapshot copies `template_type`, `runtime_keys`, `supported_standards` and (derived
from `config_schema`) `click_fields` from `templates` — so **`npm run db:seed` must be
followed by a backfill**.

`click_fields` is **optional** in the snapshot and did not bump `schema_version`: a
reader that predates it ignores it, and a snapshot without it routes no click through
`/r` — the behaviour before ADR-0023, not an error.

`is_entitled` / `should_serve` are deliberately *not* stored. They depend on `now()`,
and freezing them would keep a lapsed subscription serving whenever a Stripe webhook
was missed or delayed.

## RLS intent

| Table | Policy intent |
| --- | --- |
| `profiles` | owner can read/update own row |
| `templates` | **published** templates readable by anon + authenticated (public showcase); drafts hidden; writes admin-only (service role). A new template is seeded as a draft and only the local-only `/dev/harness` reads drafts, with the service role ([ADR-0024](decisions/0024-pick-message-template.md)) |
| `creatives` | owner can CRUD own rows only |
| `subscriptions` | owner can **read** own rows; **no client writes** (only webhook via service role) |
| `creative_event_counters` | **no direct client access** (RLS on, zero policies); writes via the ingest beacon with the service role, reads only through the owner-scoped aggregate `public.get_creative_overview()` |
| `creative_clicks`, `conversions`, `postback_keys`, `postback_log` | **no direct client access** (RLS on, zero policies, table and identity-sequence privileges revoked from `anon`/`authenticated`); clicks written by `record_click()` and conversions + log by `record_postback()`, both service role only; the owner reads through `get_creative_conversions()`, `ensure_postback_key()`, `has_postback_key()` and `get_postback_log()`, each scoped to `auth.uid()` ([ADR-0023](decisions/0023-conversion-postbacks.md)) |
| `stripe_events` | **no direct client access**; written only by the webhook (service role) |
| `storage.objects` (`creative-media`) | authenticated users can insert/update/delete only under their own `auth.uid()` path prefix; select is public (any role) — the bucket's own public-read already bypasses RLS for plain GETs, this policy just keeps `.list()`/`.download()` consistent. Since [ADR-0028](decisions/0028-creative-media-on-r2.md) new uploads go to R2, which has no RLS: there the same prefix rule is enforced in code (`requestMediaUpload` mints the key; `deleteCreative` deletes only keys under the caller's prefix) |

RLS protects the **dashboard** path. It is intentionally not relied upon for the
public VAST path, which uses a narrowly scoped service-role read.

`schema.sql` also issues explicit table **grants** to the API roles (`anon`,
`authenticated`, `service_role`). Supabase usually auto-grants these, but not
reliably across projects/key formats — without them every role hits
`permission denied`. The grant is the table-level privilege; **RLS is still the
row-level gate** (a grant without a matching policy yields zero rows).

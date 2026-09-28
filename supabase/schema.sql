-- ============================================================================
-- CreoSmith — database schema
-- ----------------------------------------------------------------------------
-- Mirrors docs/data-model.md. Two access patterns coexist:
--   * Dashboard path: RLS-enforced, per-user (anon/authenticated roles).
--   * Serving path:   public VAST endpoint reads the denormalized view in the
--                     `private` schema via the service role only (RLS bypassed
--                     by design — there is no user session). See docs/security.md.
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor or via CLI.
--
-- Apply it ATOMICALLY — the whole file is wrapped in one transaction below. A
-- partial apply is a security event, not an inconvenience: functions are created
-- with PUBLIC EXECUTE and revoked a few statements later, and RLS is enabled
-- after the tables exist, so an abort in the middle can leave a definer function
-- callable by `anon` or a table readable with no policy.
-- ============================================================================

begin;

-- Default-closed for anything created later in this file (and by anyone after
-- it): `create function` otherwise grants EXECUTE to PUBLIC, which briefly
-- exposes every SECURITY DEFINER function to anon before its explicit revoke.
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type plan_type as enum ('single', 'all_access');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum
    ('active', 'trialing', 'past_due', 'canceled', 'incomplete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type creative_status as enum ('draft', 'active', 'paused', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type creative_event_type as enum
    ('impression', 'start', 'q25', 'q50', 'q75', 'complete', 'interaction', 'click', 'viewable');
exception when duplicate_object then null; end $$;

-- The `create type` above only takes effect on a fresh database: once the
-- type exists, `exception when duplicate_object` makes the whole statement a
-- no-op, so editing its literal list does nothing against a live install.
-- Growing an existing enum needs this separately-idempotent statement.
-- `viewable` is VPAID-only (ADR-0012) — self-reported, non-OMID-accredited
-- viewability. SIMID creatives never produce it; their viewability is
-- measured by the advertiser's own OMID vendor, which we don't ingest.
alter type creative_event_type add value if not exists 'viewable';

-- Delivery format is intentionally TEXT (not an enum): per ADR-0002 we must be
-- able to add new interactive standards without a migration. Validated against
-- the template's supported_standards via trigger below.

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (app-level data for an auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  display_name       text,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.profiles is 'App profile per auth user; holds Stripe customer id.';

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- templates  (admin-curated catalog; read-only to users)
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  description          text,
  type                 text not null,                 -- shoppable_video | branching_story | lead_gen ...
  category             text,
  supported_standards  text[] not null default '{}',  -- e.g. {simid,vpaid}
  runtime_keys         jsonb  not null default '{}',   -- per-standard asset pointers
  preview_url          text,                           -- RESERVED, unused: the catalog shows a live demo, not a thumbnail (ADR-0008)
  config_schema        jsonb  not null default '{}',   -- JSON schema for the user config form
  pricing_tier         text,                           -- links to a Stripe price family
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.templates is 'Interactive ad templates; optimized into one variant per supported standard.';

-- The public catalog URL is `/catalog/<type hyphenated>` (ADR-0008), so `type`
-- must identify exactly one template. If two templates of one type ever become a
-- real need, add a dedicated `slug text unique` column — do not drop this index.
--
-- `if not exists` suppresses "already exists", NOT a uniqueness violation, so on
-- a database that already holds duplicates this statement aborts the apply. Fail
-- with a sentence someone can act on instead of a constraint name.
do $$ begin
  if exists (select 1 from public.templates group by type having count(*) > 1) then
    raise exception
      'ADR-0008: duplicate templates.type values block templates_type_key. Resolve them, or add a dedicated slug column first.';
  end if;
end $$;

create unique index if not exists templates_type_key on public.templates (type);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- creatives  (a user's configured instance of a template)
-- ---------------------------------------------------------------------------
create table if not exists public.creatives (
  id               uuid primary key default gen_random_uuid(),  -- = creative_id in the VAST URL
  user_id          uuid not null references auth.users(id)   on delete cascade,
  template_id      uuid not null references public.templates(id) on delete restrict,
  name             text check (char_length(name) <= 200),      -- user's label; falls back to the template name in the UI
  selected_format  text not null,                              -- must be in template.supported_standards
  config_json      jsonb not null default '{}',
  status           creative_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.creatives is 'User-configured ad; its id is the public creative_id used by the VAST endpoint.';

-- For databases created before ADR-0008 (this file is re-runnable, not migrated).
alter table public.creatives add column if not exists name text;

create index if not exists creatives_user_id_idx     on public.creatives (user_id);
create index if not exists creatives_template_id_idx on public.creatives (template_id);

drop trigger if exists creatives_set_updated_at on public.creatives;
create trigger creatives_set_updated_at
  before update on public.creatives
  for each row execute function public.set_updated_at();

-- Enforce: selected_format must be one of the template's supported_standards.
create or replace function public.validate_creative_format()
returns trigger
language plpgsql
as $$
declare
  allowed text[];
begin
  select supported_standards into allowed
  from public.templates where id = new.template_id;

  if allowed is null then
    raise exception 'template % not found', new.template_id;
  end if;

  if not (new.selected_format = any(allowed)) then
    raise exception 'format "%" not supported by template % (allowed: %)',
      new.selected_format, new.template_id, allowed;
  end if;

  return new;
end;
$$;

drop trigger if exists creatives_validate_format on public.creatives;
create trigger creatives_validate_format
  before insert or update of selected_format, template_id on public.creatives
  for each row execute function public.validate_creative_format();

-- ---------------------------------------------------------------------------
-- subscriptions  (mirror of Stripe state; written only by the webhook)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan_type              plan_type not null,
  template_id            uuid references public.templates(id) on delete cascade, -- null for all_access
  status                 subscription_status not null,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- single => a template is required; all_access => no template.
  constraint subscriptions_scope_chk check (
    (plan_type = 'all_access' and template_id is null) or
    (plan_type = 'single'     and template_id is not null)
  )
);
comment on table public.subscriptions is 'Stripe subscription mirror. Source of truth is Stripe; updated via webhook (service role).';

create index if not exists subscriptions_user_id_idx     on public.subscriptions (user_id);
create index if not exists subscriptions_template_id_idx on public.subscriptions (template_id);
-- Fast entitlement lookup: only currently-serving subscriptions.
create index if not exists subscriptions_active_lookup_idx
  on public.subscriptions (user_id, plan_type, template_id, current_period_end)
  where status in ('active', 'trialing');

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- creative_event_counters  (aggregated analytics ingest — ADR-0016)
-- ---------------------------------------------------------------------------
-- Replaces the append-only `creative_events`, which stored one row per beacon.
-- Two problems, both structural rather than tuning:
--   * up to seven rows written per impression, into the same database that
--     serves login and the Stripe webhook;
--   * `get_creative_overview()` scanned every event a creative had ever
--     produced, so the dashboard got slower forever rather than with a window.
-- Counting into (creative, event, hour) buckets makes the write one upsert and
-- the table's size a function of time, not of traffic.
create table if not exists public.creative_event_counters (
  creative_id uuid not null references public.creatives(id) on delete cascade,
  event_type  creative_event_type not null,
  -- date_trunc('hour', …). Hourly rather than daily so intraday pacing stays
  -- visible; the daily cron rolls buckets older than 30 days into midnight.
  bucket      timestamptz not null,
  count       bigint not null default 0,
  primary key (creative_id, event_type, bucket)
);
comment on table public.creative_event_counters is 'Aggregated ad telemetry (ADR-0016). Written by the ingest layer via increment_creative_event(); read only through get_creative_overview().';

-- No secondary index on purpose: the primary key is (creative_id, …), which is
-- exactly the prefix every read scans by. The old table carried an index on
-- (creative_id, occurred_at) that the only real query never used.

-- ---------------------------------------------------------------------------
-- Ingest: one upsert per beacon
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can be the single writer, with EXECUTE restricted to
-- the service role. PostgREST cannot express `on conflict do update set count =
-- count + 1`, and doing it as read-then-write in app code would lose events
-- under concurrency — which, on this path, is the normal case.
create or replace function public.increment_creative_event(
  p_creative_id uuid,
  p_event_type  creative_event_type
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.creative_event_counters (creative_id, event_type, bucket, count)
  values (p_creative_id, p_event_type, date_trunc('hour', now()), 1)
  on conflict (creative_id, event_type, bucket)
  do update set count = public.creative_event_counters.count + 1;
$$;

revoke all on function public.increment_creative_event(uuid, creative_event_type) from public;
grant execute on function public.increment_creative_event(uuid, creative_event_type) to service_role;

-- ---------------------------------------------------------------------------
-- Roll hourly buckets older than the window into one midnight bucket per day.
-- Called by the daily cron (app/api/cron/health). Idempotent: a second run over
-- the same range finds only already-collapsed rows and changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.rollup_creative_events(p_older_than_days int default 30)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := date_trunc('day', now()) - make_interval(days => p_older_than_days);
  v_rolled bigint;
begin
  with collapsed as (
    delete from public.creative_event_counters
     where bucket < v_cutoff
       and bucket <> date_trunc('day', bucket)
    returning creative_id, event_type, date_trunc('day', bucket) as day, count
  ), summed as (
    select creative_id, event_type, day, sum(count) as count
      from collapsed
     group by creative_id, event_type, day
  ), merged as (
    insert into public.creative_event_counters (creative_id, event_type, bucket, count)
    select creative_id, event_type, day, count from summed
    on conflict (creative_id, event_type, bucket)
    do update set count = public.creative_event_counters.count + excluded.count
    returning 1
  )
  select count(*) into v_rolled from merged;
  return coalesce(v_rolled, 0);
end;
$$;

revoke all on function public.rollup_creative_events(int) from public;
grant execute on function public.rollup_creative_events(int) to service_role;

-- ---------------------------------------------------------------------------
-- Migration from the old append-only table, if it is still there.
-- ---------------------------------------------------------------------------
-- Only the three events ADR-0016 keeps are carried over; the rest are dropped
-- with the table. This block is a no-op on a database that has already applied
-- it, which is what keeps schema.sql a re-runnable full apply.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'creative_events'
  ) then
    -- Compared as text, not as enum literals, and that is load-bearing: on a
    -- database whose enum predates `viewable`, the `alter type ... add value`
    -- near the top of this file ran in *this* transaction, and Postgres refuses
    -- to read a value added by an uncommitted ALTER TYPE. Writing 'viewable' as
    -- an enum literal here would abort the whole atomic apply on exactly the
    -- installs this migration exists for. Same hazard the
    -- `check_function_bodies` bracket handles for get_creative_overview.
    insert into public.creative_event_counters (creative_id, event_type, bucket, count)
    select creative_id, event_type, date_trunc('hour', occurred_at), count(*)
      from public.creative_events
     where event_type::text in ('impression', 'viewable', 'click')
     group by creative_id, event_type, date_trunc('hour', occurred_at)
    on conflict (creative_id, event_type, bucket)
    do update set count = public.creative_event_counters.count + excluded.count;

    drop table public.creative_events;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Conversion tracking  (click ids and S2S postbacks — ADR-0023)
-- ---------------------------------------------------------------------------
-- The one per-event store in this schema, and deliberately so. ADR-0016 took
-- per-beacon rows out because impressions arrive at ad-serving rates. A click
-- that goes through `/r` is a person leaving the ad for the advertiser's page —
-- orders of magnitude rarer — and a conversion cannot be attributed to an
-- aggregate: the partner network posts back one click id, and something has to
-- remember which creative and which exit that id came from.
create table if not exists public.creative_clicks (
  -- Minted by `/r` (app/api/click/route.ts): 12 random bytes as lower-case hex.
  -- Hex rather than base64url because a partner network stores it in a sub-id
  -- field, and some of those case-fold or reject `-` and `_`.
  click_id    text primary key check (click_id ~ '^[0-9a-f]{24}$'),
  creative_id uuid not null references public.creatives(id) on delete cascade,
  -- The config field the viewer left through: `clickThroughUrl`, or a quiz exit
  -- such as `resultABUrl`. It is what lets a report say which answer path
  -- converts.
  field       text not null check (field ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  -- ISO 3166-1 alpha-2 from the platform's geo header. The visitor's IP address
  -- is not stored (docs/security.md).
  country     text check (country ~ '^[A-Z]{2}$'),
  created_at  timestamptz not null default now()
);
comment on table public.creative_clicks is 'One row per click through /r (ADR-0023). Written only by record_click(), from the click redirect; purged after 90 days by purge_tracking_data().';

create index if not exists creative_clicks_creative_created_idx
  on public.creative_clicks (creative_id, created_at);
-- The retention sweep deletes by age across every creative.
create index if not exists creative_clicks_created_idx
  on public.creative_clicks (created_at);

create table if not exists public.conversions (
  id          bigint generated always as identity primary key,
  -- Not a foreign key, on purpose: clicks are purged after 90 days and
  -- conversions are kept, so a conversion has to outlive its click. That is why
  -- creative_id and field are copied off the click when the conversion is made.
  click_id    text not null check (click_id ~ '^[0-9a-f]{24}$'),
  creative_id uuid not null references public.creatives(id) on delete cascade,
  field       text not null,
  -- The goal the network reported (ADR-0027) — its goal id or name, `reg`,
  -- `deposit` — or '' when it sends none. One click converts once per goal: a
  -- registration and then a deposit on the same click are two rows, and each
  -- one's later status change finds its own. Its length bound is the named
  -- conversions_goal_length below, not an inline CHECK, so a changed bound
  -- reaches a table that already exists.
  goal        text not null default '',
  -- The network's own transaction id, or '' when it sends none. With '' a click
  -- carries at most one conversion per goal and a repeated postback is a status
  -- update; distinct txids let one goal convert several times (repeat deposits).
  txid        text not null default '' check (char_length(txid) <= 128),
  status      text not null check (status in ('approved', 'pending', 'rejected')),
  payout      numeric(14, 4) not null default 0,
  currency    text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint conversions_click_goal_txid_key unique (click_id, goal, txid)
);
comment on table public.conversions is 'Conversions reported by partner-network postbacks (ADR-0023, goals ADR-0027). Written only by record_postback().';

-- ADR-0027 on a table made before it: the goal column, then the identity
-- widened from (click, txid) to (click, goal, txid). Every existing row has
-- goal '', so the wider key cannot collide where the narrower one did not. A
-- no-op on a fresh database, which the create above made whole. The narrower
-- key is dropped further down, once record_postback() no longer upserts on it.
alter table public.conversions
  add column if not exists goal text not null default '';

-- The bound in force is always the one written here, like
-- postback_log_params_size — but replaced only when it differs, because adding
-- a CHECK re-reads the whole table under an exclusive lock, and conversions,
-- unlike the log, are never purged: a drop-and-re-add on every apply would
-- stall postbacks for longer each month. Must match GOAL_MAX_LENGTH in
-- lib/postback.ts and the check in record_postback().
do $$
begin
  if coalesce((select pg_get_constraintdef(k.oid) from pg_constraint k
                where k.conrelid = 'public.conversions'::regclass
                  and k.conname = 'conversions_goal_length'), '')
     <> 'CHECK ((char_length(goal) <= 64))' then
    alter table public.conversions drop constraint if exists conversions_goal_length;
    alter table public.conversions
      add constraint conversions_goal_length check (char_length(goal) <= 64);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.conversions'::regclass
       and conname = 'conversions_click_goal_txid_key'
  ) then
    alter table public.conversions
      add constraint conversions_click_goal_txid_key unique (click_id, goal, txid);
  end if;
end
$$;

create index if not exists conversions_creative_created_idx
  on public.conversions (creative_id, created_at);

drop trigger if exists conversions_set_updated_at on public.conversions;
create trigger conversions_set_updated_at
  before update on public.conversions
  for each row execute function public.set_updated_at();

-- One postback key per account. It is the whole of the postback's
-- authentication: a partner network cannot hold a session, so the key in the
-- URL is what says whose clicks a conversion may attach to. Stored in the clear
-- because the owner has to be able to copy the URL again later; rotating it is
-- the remedy for a leak (rotate_postback_key).
create table if not exists public.postback_keys (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  key        text not null unique check (key ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now()
);
comment on table public.postback_keys is 'Per-account secret for the /pb postback URL (ADR-0023). Read and rotated only through the owner-scoped functions below.';

-- Every postback that named a valid key, including the ones that failed. A
-- partner network's own postback log says only "HTTP 400"; this is what tells
-- the owner that the network sent `{sub1}` unexpanded, or a status we do not
-- read. Kept for 7 days (purge_tracking_data).
create table if not exists public.postback_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  received_at timestamptz not null default now(),
  -- The parameters /pb reads, as received and truncated by the route. Nothing
  -- else from the request is kept.
  params      jsonb not null default '{}',
  result      text not null check (char_length(result) <= 32)
);
comment on table public.postback_log is 'Recent postback hits per account, for debugging a network''s setup (ADR-0023). 7-day retention.';

create index if not exists postback_log_user_received_idx
  on public.postback_log (user_id, received_at desc);

-- The route truncates each parameter to 128 characters; this is the table
-- refusing to trust that. 4096 bytes clears the worst honest case — six values
-- of 128 four-byte characters plus the JSON around them is about 3.2 KB — with
-- room to spare. Dropped and re-added rather than `add ... if not exists`
-- (which Postgres does not have for constraints), so a changed bound applies
-- on the next run of this file.
alter table public.postback_log drop constraint if exists postback_log_params_size;
alter table public.postback_log
  add constraint postback_log_params_size check (pg_column_size(params) <= 4096);

-- ---------------------------------------------------------------------------
-- Click ingest: one call per signed click through `/r`
-- ---------------------------------------------------------------------------
-- A function rather than a plain insert for the cap. `/r` is public and its
-- signed links are handed out by the public `/v`, so anyone can fetch a tag and
-- replay its links for an hour — and unlike the beacons' counters, every replay
-- here would be a new row. Past `p_per_minute` clicks on one creative in the
-- last minute a click is still redirected (the route does that first) but not
-- recorded. Genuine traffic above the cap loses attribution for the rest of that
-- minute, which is the price of a table that cannot be filled from outside.
-- Returns whether the row was written.
create or replace function public.record_click(
  p_click_id    text,
  p_creative_id uuid,
  p_field       text,
  p_country     text,
  p_per_minute  int
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with recent as (
    select count(*) as n
      from public.creative_clicks k
     where k.creative_id = p_creative_id
       and k.created_at > now() - interval '1 minute'
  ), ins as (
    insert into public.creative_clicks (click_id, creative_id, field, country)
    select p_click_id, p_creative_id, p_field, p_country
     where (select n from recent) < greatest(coalesce(p_per_minute, 1), 1)
    on conflict (click_id) do nothing
    returning 1
  )
  select exists (select 1 from ins);
$$;

revoke all on function public.record_click(text, uuid, text, text, int) from public;
grant execute on function public.record_click(text, uuid, text, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Postback ingest: one call per S2S hit from a partner network
-- ---------------------------------------------------------------------------
-- In SQL rather than as reads and writes from the route for the same reason as
-- increment_creative_event: find-or-update-or-insert across two tables is a
-- race when a network retries, and networks retry. The route parses and
-- validates; a parse failure still comes here as `p_error`, so it lands in the
-- owner's log instead of disappearing into the network's.
--
-- Returns a result code the route maps to an HTTP status: 'created', 'updated'
-- and 'unchanged' succeed, everything else is a rejection the owner can read.
--
-- `p_goal` (ADR-0027) is last and defaulted so that a deployment still calling
-- with the eight earlier arguments resolves to this function unchanged: the
-- schema lands before the code that sends a goal, and a postback in between
-- records exactly what it did before, with goal ''. The eight-argument
-- signature is dropped rather than kept beside it, because two candidates for
-- the same eight named arguments would make every call ambiguous.
drop function if exists public.record_postback(text, text, text, numeric, text, text, text, jsonb);

create or replace function public.record_postback(
  p_key       text,
  p_click_id  text,
  p_status    text,
  p_payout    numeric,
  p_currency  text,
  p_txid      text,
  p_error     text,
  p_params    jsonb,
  p_goal      text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal     text := coalesce(p_goal, '');
  v_id       bigint;
  v_user     uuid;
  v_creative uuid;
  v_field    text;
  v_clicked  timestamptz;
  v_inserted boolean;
  v_status   text;
  v_payout   numeric;
  v_currency text;
  v_result   text;
begin
  select k.user_id into v_user from public.postback_keys k where k.key = p_key;
  -- No owner means nobody to show a log line to. Answer without writing
  -- anything, so a wrong key cannot be used to fill this database.
  if v_user is null then
    return 'unknown_key';
  end if;

  if p_error is not null then
    v_result := p_error;
  elsif char_length(v_goal) > 64 then
    -- The route refuses this first (lib/postback.ts). Here as well so that a
    -- caller who skipped the route gets the code the owner can read, not the
    -- CHECK's exception — which the route would answer 503, and a network
    -- would retry for ever.
    v_result := 'bad_goal';
  else
    -- A change to a conversion already recorded: hold -> approved, or a
    -- reversal. Matched on (click, goal, txid) — a deposit's approval must not
    -- land on the same click's registration (ADR-0027) — and never held to the
    -- click window: networks settle long after the click, and by then the click
    -- row itself may have been purged.
    --
    -- A late `pending` never overwrites a settled status. Networks retry, and a
    -- retried hold that lands after its own approval would otherwise un-approve
    -- the conversion and take its revenue with it. Approved -> rejected (a
    -- chargeback) and rejected -> approved still go through. Either way the
    -- owner's log has to say what happened, so a report that changed nothing is
    -- `unchanged`, not `updated`.
    select v.id, v.status, v.payout, v.currency
      into v_id, v_status, v_payout, v_currency
      from public.conversions v
      join public.creatives c on c.id = v.creative_id
     where v.click_id = p_click_id
       and v.goal = v_goal
       and v.txid = p_txid
       and c.user_id = v_user
       for update of v;
    if found then
      if (p_status = 'pending' and v_status <> 'pending')
         or (p_status = v_status
             and coalesce(p_payout, v_payout) = v_payout
             and coalesce(p_currency, v_currency) = v_currency) then
        v_result := 'unchanged';
      else
        -- By the id of the row just locked and owner-checked, so the update
        -- cannot reach any other row whatever the table's keys become.
        update public.conversions v
           set status   = p_status,
               payout   = coalesce(p_payout, v.payout),
               currency = coalesce(p_currency, v.currency)
         where v.id = v_id;
        v_result := 'updated';
      end if;
    else
      select k.creative_id, k.field, k.created_at
        into v_creative, v_field, v_clicked
        from public.creative_clicks k
        join public.creatives c on c.id = k.creative_id
       where k.click_id = p_click_id
         and c.user_id = v_user;
      if v_creative is null then
        -- Another account's click reads exactly like one that never existed.
        v_result := 'unknown_click';
      elsif v_clicked < now() - interval '30 days' then
        -- The attribution window. A first report this late is not credible
        -- evidence that this ad caused it.
        v_result := 'expired_click';
      else
        -- `on conflict` covers the network that fires the same postback twice
        -- at once: both miss the update above, and the second insert becomes
        -- the update instead of a duplicate — under the same no-downgrade rule.
        -- The `where` is the one ownership check this write would otherwise
        -- lack; a click belongs to one creative, so it always holds today.
        -- `xmax = 0` is how Postgres tells a fresh row from an updated one.
        insert into public.conversions as v
          (click_id, creative_id, field, goal, txid, status, payout, currency)
        values
          (p_click_id, v_creative, v_field, v_goal, p_txid, p_status,
           coalesce(p_payout, 0), coalesce(p_currency, 'USD'))
        on conflict (click_id, goal, txid) do update
          set status   = case when excluded.status = 'pending' and v.status <> 'pending'
                              then v.status else excluded.status end,
              payout   = case when excluded.status = 'pending' and v.status <> 'pending'
                              then v.payout else coalesce(p_payout, v.payout) end,
              currency = case when excluded.status = 'pending' and v.status <> 'pending'
                              then v.currency else coalesce(p_currency, v.currency) end
          where v.creative_id = v_creative
        returning (xmax = 0) into v_inserted;
        v_result := case
          when v_inserted is null then 'unknown_click'
          when v_inserted then 'created'
          else 'updated'
        end;
      end if;
    end if;
  end if;

  -- Bounded, because the key sits in every network's configuration and a leaked
  -- one could otherwise write log rows without limit. Past the cap the postback
  -- is still processed; only the debugging trail pauses.
  --
  -- Best-effort, in its own sub-block: the log is a debugging aid, and a row it
  -- cannot take must not roll back the conversion above it — the route would
  -- answer 503 and the network would retry a postback that had in fact landed.
  begin
    if (select count(*) from public.postback_log l
         where l.user_id = v_user
           and l.received_at > now() - interval '1 hour') < 3600 then
      insert into public.postback_log (user_id, params, result)
      values (v_user, coalesce(p_params, '{}'::jsonb), v_result);
    end if;
  exception when others then
    null;
  end;
  return v_result;
end;
$$;

revoke all on function public.record_postback(text, text, text, numeric, text, text, text, jsonb, text) from public;
grant execute on function public.record_postback(text, text, text, numeric, text, text, text, jsonb, text) to service_role;

-- The pre-ADR-0027 identity, dropped only after record_postback() stops
-- upserting on it, so a statement-by-statement apply never leaves the current
-- function naming a key that is gone. One case remains: a call to the old
-- function already waiting on this file's locks re-plans after the commit,
-- finds its conflict key dropped, and fails once — a 503 that the network's
-- retry answers on the new function.
alter table public.conversions drop constraint if exists conversions_click_txid_key;

-- record_postback()'s `on conflict` names (click_id, goal, txid) and nothing
-- else. Any other unique key — the old one under a name this file did not
-- give it, say — would turn a registration and a deposit on one click into a
-- unique violation the upsert cannot absorb: a 503 retried for ever. Fail the
-- apply instead, loudly, before it commits.
do $$
begin
  if exists (
    select 1 from pg_index i
     where i.indrelid = 'public.conversions'::regclass
       and i.indisunique
       and not i.indisprimary
       and i.indexrelid <> 'public.conversions_click_goal_txid_key'::regclass
  ) then
    raise exception 'public.conversions has a unique key other than (click_id, goal, txid)';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Retention for the tracking tables. Called by the daily cron beside
-- rollup_creative_events. Conversions are not purged: they are the record.
-- ---------------------------------------------------------------------------
create or replace function public.purge_tracking_data(
  p_click_days int default 90,
  p_log_days   int default 7
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clicks bigint;
begin
  -- Floors, not trust: this is the one function here that deletes across every
  -- account, and a click must outlive the 30-day attribution window whatever a
  -- caller passes.
  delete from public.creative_clicks
   where created_at < now() - make_interval(days => greatest(coalesce(p_click_days, 90), 31));
  get diagnostics v_clicks = row_count;

  delete from public.postback_log
   where received_at < now() - make_interval(days => greatest(coalesce(p_log_days, 7), 1));

  return v_clicks;
end;
$$;

revoke all on function public.purge_tracking_data(int, int) from public;
grant execute on function public.purge_tracking_data(int, int) to service_role;

-- ---------------------------------------------------------------------------
-- stripe_events  (webhook idempotency ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id          text primary key,        -- Stripe event id
  type        text not null,
  received_at timestamptz not null default now()
);
comment on table public.stripe_events is 'Processed Stripe event ids for webhook idempotency. Service-role only.';

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- RLS protects the authenticated dashboard path. The serving path bypasses it
-- via the service role (which ignores RLS). Tables with no policy for a role
-- deny that role by default once RLS is enabled.
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.templates       enable row level security;
alter table public.creatives       enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.creative_event_counters enable row level security;
alter table public.stripe_events   enable row level security;
alter table public.creative_clicks enable row level security;
alter table public.conversions     enable row level security;
alter table public.postback_keys   enable row level security;
alter table public.postback_log    enable row level security;
-- stripe_events: no policy => no client access; only the service role (webhook) touches it.

-- profiles: owner reads/updates own row (insert handled by trigger).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- templates: published templates are public marketing content — readable by
-- anonymous visitors (landing showcase) and authenticated users. Unpublished
-- (draft) templates stay hidden. No client writes (admin curation via service role).
drop policy if exists templates_select_published on public.templates;
create policy templates_select_published on public.templates
  for select to anon, authenticated using (is_published = true);

-- creatives: full CRUD restricted to the owner.
drop policy if exists creatives_select_own on public.creatives;
create policy creatives_select_own on public.creatives
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists creatives_insert_own on public.creatives;
create policy creatives_insert_own on public.creatives
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists creatives_update_own on public.creatives;
create policy creatives_update_own on public.creatives
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists creatives_delete_own on public.creatives;
create policy creatives_delete_own on public.creatives
  for delete to authenticated using (user_id = (select auth.uid()));

-- subscriptions: owner may READ own rows only. No client writes — the Stripe
-- webhook (service role) is the only writer.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- creative_event_counters: no direct client access. RLS enabled with no policy =>
-- the anon/authenticated roles are denied. Writes go through the service role
-- (increment_creative_event); reads go through get_creative_overview().

-- creative_clicks, conversions, postback_keys, postback_log: the same shape
-- (ADR-0023). No policy, so no direct client access. Clicks are written only by
-- record_click() (from `/r`), conversions and the log only by record_postback(),
-- both with the service role. The owner reads through
-- get_creative_conversions(), get_creative_conversion_goals() (ADR-0027),
-- ensure_postback_key(), has_postback_key() and get_postback_log(), and rotates
-- the key with rotate_postback_key() — each scoped to auth.uid() inside.

-- ---------------------------------------------------------------------------
-- Storage: creative-media (advertiser-uploaded creative assets)
-- ----------------------------------------------------------------------------
-- Distinct from the `creatives` bucket (private, signed URLs, runtime VPAID/SIMID
-- units — see runtime/README.md): this one holds advertiser-uploaded pictures/
-- gifs/video for "image"-typed config fields (ADR-0010). Public-read, because the
-- URL is baked into <AdParameters> and must keep resolving for the creative's
-- lifetime — a short-TTL signed URL is the wrong shape here. Uploads go straight
-- from the browser (anon key, the user's own session) to Storage, gated by the
-- policies below; the app server never sees the file.
--
-- `storage.objects` already has RLS enabled by default in every Supabase
-- project; only the bucket + policies need declaring here.
-- No SVG: it's XML and can carry a <script>/onload payload that executes on
-- direct navigation to the object's public URL, unlike every raster format
-- here, none of which can execute script (/security-review finding).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-media', 'creative-media', true, 26214400, array[
  'image/jpeg','image/png','image/webp','image/gif','image/avif',
  'video/webm','video/mp4','video/x-m4v','video/quicktime','video/ogg'
])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {auth.uid()}/{filename} — the first path segment is the
-- owner, mirroring the creatives_*_own policies above. Not {creative_id}/...:
-- upload can happen before a creative row exists (mid-configuration on
-- /dashboard/creatives/new).
drop policy if exists creative_media_insert_own on storage.objects;
create policy creative_media_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'creative-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists creative_media_update_own on storage.objects;
create policy creative_media_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'creative-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'creative-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists creative_media_delete_own on storage.objects;
create policy creative_media_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'creative-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Belt-and-suspenders: a public bucket already serves GET via the public object
-- URL without going through RLS, but this keeps .list()/.download() working and
-- the read intent explicit and auditable (same class as templates_select_published).
drop policy if exists creative_media_select_public on storage.objects;
create policy creative_media_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'creative-media');

-- ---------------------------------------------------------------------------
-- Table grants for the API roles
-- ---------------------------------------------------------------------------
-- Supabase normally auto-grants these; we set them explicitly so the schema is
-- portable and the service role always has table access. RLS (above) remains
-- the row-level gate for anon/authenticated — a GRANT without a matching policy
-- still yields zero rows for those roles.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Two tables have no client contract at all: `creative_event_counters` is written by the
-- ingest beacon with the service role and read only through
-- public.get_creative_overview(), and `stripe_events` is webhook-only. Take the
-- table-level privileges away rather than relying on RLS alone — TRUNCATE is a
-- table privilege that **no policy can gate**, and "RLS on, zero policies" does
-- not stop it. SECURITY DEFINER functions are unaffected: they are checked
-- against their owner, not the caller.
revoke all on public.creative_event_counters, public.stripe_events from anon, authenticated;
-- The same for the conversion-tracking tables (ADR-0023): no client contract,
-- so no table privilege for a missing policy to be the only thing guarding.
revoke all on public.creative_clicks, public.conversions,
              public.postback_keys, public.postback_log
  from anon, authenticated;
-- Their identity sequences too, which the blanket sequence grant above handed out.
revoke all on sequence public.conversions_id_seq, public.postback_log_id_seq
  from anon, authenticated;

-- Default-closed for future tables. The previous `grant all on tables` default
-- meant any table created later was born readable AND writable by anon until
-- someone remembered to enable RLS on it — a standing version of exactly the
-- "RLS off for a moment" window that docs/security.md forbids.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ============================================================================
-- Serving view (hot path) — private schema, service role only
-- ----------------------------------------------------------------------------
-- Not exposed to PostgREST (only `public`/`graphql_public` are). The VAST
-- endpoint reads this by creative_id with the service role. Resolves effective
-- entitlement so the serving path needs no Stripe call and no live join logic
-- in app code. See docs/architecture.md.
-- ============================================================================
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Entitlement, defined once
-- ---------------------------------------------------------------------------
-- This predicate decides whether a tag serves. It is read by the serving view
-- (hot path) and by the dashboard's overview RPC, and those two must never
-- disagree: a drift would either dark a live tag or tell a buyer their dead tag
-- is fine. One definition, three call sites.
create or replace function private.is_entitled(p_user_id uuid, p_template_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (s.plan_type = 'all_access'
           or (s.plan_type = 'single' and s.template_id = p_template_id))
  );
$$;

comment on function private.is_entitled(uuid, uuid) is
  'The single definition of subscription entitlement. Callers are private.creative_serving and public.get_creative_overview.';

revoke all on function private.is_entitled(uuid, uuid) from public;

-- The two RPCs reach it as their owner, but a plain view checks function EXECUTE
-- against the *invoking* role — so a direct service-role read of
-- private.creative_serving needs this grant. Never grant it to `authenticated`:
-- the (user_id, template_id) signature is a ready-made cross-tenant
-- entitlement oracle.
grant execute on function private.is_entitled(uuid, uuid) to service_role;

create or replace view private.creative_serving as
select
  c.id                       as creative_id,
  c.user_id,
  c.template_id,
  c.selected_format,
  c.config_json,
  c.status                   as creative_status,
  t.type                     as template_type,
  t.runtime_keys,
  t.supported_standards,
  -- Effective entitlement: an active/trialing, non-expired subscription that
  -- covers this creative's template (all-access, or single matching template).
  private.is_entitled(c.user_id, c.template_id)                as is_entitled,
  -- Convenience: only serve the payload for an active creative that is entitled.
  (c.status = 'active' and private.is_entitled(c.user_id, c.template_id))
                                                               as should_serve,
  -- The config fields whose value is a place to send the viewer, in schema
  -- order (ADR-0023). The VAST builder routes each one through `/r` so the
  -- click gets a click id, and `/r` refuses any field not on this list — which
  -- is what keeps it from being an open redirect.
  --
  -- Every `url`-typed field except the OMID script: the adapter emits that into
  -- <AdVerifications> as a resource for the player to load (ADR-0012), and
  -- routing it through `/r` would count every verification load as a click.
  -- Appended last because `create or replace view` can only add columns at the
  -- end.
  coalesce(
    (select array_agg(f.value->>'name' order by f.ordinality)
       from jsonb_array_elements(
              case when jsonb_typeof(t.config_schema->'fields') = 'array'
                   then t.config_schema->'fields'
                   else '[]'::jsonb end
            ) with ordinality as f(value, ordinality)
      where f.value->>'type' = 'url'
        and f.value->>'name' ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
        and f.value->>'name' <> 'verificationScriptUrl'),
    '{}'::text[]
  )                                                            as click_fields
from public.creatives c
join public.templates  t on t.id = c.template_id;

comment on view private.creative_serving is
  'Denormalized read for the public VAST endpoint. Service role only; not exposed via the API.';

-- Lock down: only the service role may touch the private serving surface.
-- `from public` as well as the named roles — revoking from a role does not
-- remove a privilege it holds via PUBLIC.
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke all on private.creative_serving from anon, authenticated;
grant select on private.creative_serving to service_role;

-- ---------------------------------------------------------------------------
-- RPC access to the serving record (the VAST endpoint's read path)
-- ---------------------------------------------------------------------------
-- PostgREST only exposes the `public`/`graphql_public` schemas, so the private
-- view cannot be read via .from(). This SECURITY DEFINER function in `public`
-- is the single read path: it runs as its owner (reads private), returns an
-- explicit TABLE (self-contained for PostgREST introspection — no dependency on
-- a private composite type), and EXECUTE is restricted to the service role.
--
-- Drop-then-create because `click_fields` (ADR-0023) changed the RETURNS TABLE,
-- which `create or replace` refuses. Nothing depends on this function, and the
-- grants below re-apply unconditionally; inside this file's single transaction
-- a caller never observes it missing.
drop function if exists public.get_creative_serving(uuid);
create function public.get_creative_serving(p_creative_id uuid)
returns table (
  creative_id         uuid,
  user_id             uuid,
  template_id         uuid,
  selected_format     text,
  config_json         jsonb,
  creative_status     creative_status,
  template_type       text,
  runtime_keys        jsonb,
  supported_standards text[],
  is_entitled         boolean,
  should_serve        boolean,
  click_fields        text[]
)
language sql
security definer
-- Empty, like every other definer function here: the body names
-- `private.creative_serving` in full, so nothing needs resolving by path.
set search_path = ''
stable
as $$
  select creative_id, user_id, template_id, selected_format, config_json,
         creative_status, template_type, runtime_keys, supported_standards,
         is_entitled, should_serve, click_fields
  from private.creative_serving
  where creative_id = p_creative_id;
$$;

-- Only the service role may call it (revoking from PUBLIC also covers anon/authenticated).
revoke all on function public.get_creative_serving(uuid) from public;
grant execute on function public.get_creative_serving(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Dashboard analytics read (the "Мои креативы" section)
-- ---------------------------------------------------------------------------
-- `creative_event_counters` has RLS enabled with no policies, so the session
-- client reads zero rows and must stay that way: opening it with an owner policy
-- would expose per-hour buckets forever in exchange for three integers, and
-- PostgREST cannot aggregate, so counting would cost a round trip per creative.
-- This function is the whole dashboard analytics surface.
--
-- It takes NO parameter on purpose: the only rows it can ever return are the
-- caller's own. A p_creative_id argument is the shape that eventually ships
-- without an ownership check.
--
-- It can read the counters only because its owner is exempt from RLS. Two ways
-- that silently degrades to zeros rather than failing loudly, both worth knowing
-- before debugging an empty dashboard: running `alter table
-- public.creative_event_counters force row level security`, or applying this
-- file as a role that neither owns the table nor has BYPASSRLS.
--
-- This function's body references the literal 'viewable', added to
-- creative_event_type by `alter type ... add value` above, in the SAME
-- transaction as this CREATE FUNCTION. Postgres constant-folds a literal
-- enum comparison at parse time (calling the type's input function), and a
-- value added by ALTER TYPE ... ADD VALUE is not "safe" to read until the
-- adding transaction commits — so validating that reference here would
-- raise "unsafe use of new value of enum type". `check_function_bodies` is
-- what triggers that parse-time validation for `language sql` function
-- bodies at CREATE FUNCTION time; scoped off for just this one statement
-- (not the whole transaction, so every other function here still gets its
-- normal apply-time validation) and back on immediately after, this defers
-- the check to first call — well after commit — without splitting the
-- file's required atomic transaction (see the file header: a partial apply
-- here is a security event).
set local check_function_bodies = off;
-- `create or replace function` cannot change an existing function's return
-- type, and adding the `viewable` column to this RETURNS TABLE(...) is
-- exactly that. Drop-then-create is safe here: nothing else in this schema
-- (no view, no other function) depends on get_creative_overview(), and the
-- privilege/comment statements below re-apply unconditionally regardless of
-- whether the function was just created or replaced.
drop function if exists public.get_creative_overview();
create function public.get_creative_overview()
returns table (
  creative_id  uuid,
  -- ADR-0016 cut the funnel to three ingested events. `starts`, the three
  -- quartiles and `completes` are gone — five trackers, one player-fired beacon
  -- each, for numbers a buyer's own DSP already reports.
  impressions  bigint,
  -- VPAID-only (ADR-0012): a SIMID creative never produces this event, since
  -- its viewability is measured by the advertiser's own OMID vendor, which we
  -- don't ingest. Always 0 for SIMID rows — the dashboard must render that as
  -- "not applicable to this format", never as a confident zero.
  viewable     bigint,
  -- Fired only from the creative's final call-to-action, the one that opens the
  -- advertiser's URL — never from an intermediate interaction such as a quiz
  -- answer. See runtime/lib/vpaid-base.js's clickThrough().
  clicks       bigint,
  is_entitled  boolean,
  should_serve boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    c.id,
    coalesce(sum(e.count) filter (where e.event_type = 'impression'), 0),
    coalesce(sum(e.count) filter (where e.event_type = 'viewable'), 0),
    coalesce(sum(e.count) filter (where e.event_type = 'click'), 0),
    -- Both flags, from the one shared definition. `should_serve` matches the
    -- serving gate exactly; the dashboard renders entitlement today only because
    -- creatives.status has no update path, and the day a kill switch ships this
    -- column is already here to tell the truth (ADR-0008).
    private.is_entitled(c.user_id, c.template_id),
    (c.status = 'active' and private.is_entitled(c.user_id, c.template_id))
  from public.creatives c
  left join public.creative_event_counters e on e.creative_id = c.id
  where c.user_id = (select auth.uid())
  group by c.id;
$$;
set local check_function_bodies = on;

comment on function public.get_creative_overview() is
  'Per-creative delivery counts + entitlement for the signed-in owner. The only read path into creative_event_counters.';

revoke all on function public.get_creative_overview() from public;
grant execute on function public.get_creative_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Conversion report for one creative (ADR-0023)
-- ---------------------------------------------------------------------------
-- Unlike get_creative_overview() this takes a creative id, which is exactly the
-- shape that note warns about: a parameter is how an ownership check gets lost.
-- The `owned` CTE is that check, and every other CTE reads through it — a
-- creative the caller does not own yields no rows, not somebody else's numbers.
--
-- One row per (UTC day, exit field) over the last `p_days` days, today
-- included. Clicks count by click time and conversions by the time the postback
-- arrived: a network reports days later, and bucketing by click time would
-- keep rewriting days the owner has already read. `revenue` is approved payout
-- per currency, since summing across currencies would be a number in none.
create or replace function public.get_creative_conversions(
  p_creative_id uuid,
  p_days        int default 30
)
returns table (
  day      date,
  field    text,
  clicks   bigint,
  approved bigint,
  pending  bigint,
  rejected bigint,
  revenue  jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  with owned as (
    select c.id from public.creatives c
     where c.id = p_creative_id
       and c.user_id = (select auth.uid())
  ), since as (
    select date_trunc('day', now(), 'UTC')
             - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90) - 1) as t
  ), k as (
    select (x.created_at at time zone 'UTC')::date as day, x.field, count(*) as clicks
      from public.creative_clicks x
     where x.creative_id = (select id from owned)
       and x.created_at >= (select t from since)
     group by 1, 2
  ), v as (
    select (x.created_at at time zone 'UTC')::date as day, x.field,
           count(*) filter (where x.status = 'approved') as approved,
           count(*) filter (where x.status = 'pending')  as pending,
           count(*) filter (where x.status = 'rejected') as rejected
      from public.conversions x
     where x.creative_id = (select id from owned)
       and x.created_at >= (select t from since)
     group by 1, 2
  ), r as (
    select y.day, y.field, jsonb_object_agg(y.currency, y.amount) as revenue
      from (
        select (x.created_at at time zone 'UTC')::date as day, x.field, x.currency,
               sum(x.payout) as amount
          from public.conversions x
         where x.creative_id = (select id from owned)
           and x.created_at >= (select t from since)
           and x.status = 'approved'
         group by 1, 2, 3
      ) y
     group by y.day, y.field
  )
  select coalesce(k.day, v.day),
         coalesce(k.field, v.field),
         coalesce(k.clicks, 0),
         coalesce(v.approved, 0),
         coalesce(v.pending, 0),
         coalesce(v.rejected, 0),
         coalesce(r.revenue, '{}'::jsonb)
    from k
    full join v on v.day = k.day and v.field = k.field
    left join r on r.day = coalesce(k.day, v.day)
               and r.field = coalesce(k.field, v.field)
   order by 1, 2;
$$;

comment on function public.get_creative_conversions(uuid, int) is
  'Clicks through /r and postback conversions per day and exit for one creative the caller owns (ADR-0023).';

revoke all on function public.get_creative_conversions(uuid, int) from public;
grant execute on function public.get_creative_conversions(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Conversions by goal for one creative (ADR-0027)
-- ---------------------------------------------------------------------------
-- The same window, the same bucketing by the first postback's time and the same
-- `owned` check as get_creative_conversions(): the report's by-goal table has
-- to add up to the strip above it. One row per goal, '' included when some
-- conversions came without one. No clicks: a click does not know which goal it
-- will reach, so every goal shares the creative's tracked clicks as its
-- denominator, and the page already has those.
create or replace function public.get_creative_conversion_goals(
  p_creative_id uuid,
  p_days        int default 30
)
returns table (
  goal     text,
  approved bigint,
  pending  bigint,
  rejected bigint,
  revenue  jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  with owned as (
    select c.id from public.creatives c
     where c.id = p_creative_id
       and c.user_id = (select auth.uid())
  ), since as (
    select date_trunc('day', now(), 'UTC')
             - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90) - 1) as t
  ), x as (
    select v.goal, v.status, v.payout, v.currency
      from public.conversions v
     where v.creative_id = (select id from owned)
       and v.created_at >= (select t from since)
  ), g as (
    select x.goal,
           count(*) filter (where x.status = 'approved') as approved,
           count(*) filter (where x.status = 'pending')  as pending,
           count(*) filter (where x.status = 'rejected') as rejected
      from x
     group by x.goal
  ), r as (
    select y.goal, jsonb_object_agg(y.currency, y.amount) as revenue
      from (
        select x.goal, x.currency, sum(x.payout) as amount
          from x
         where x.status = 'approved'
         group by 1, 2
      ) y
     group by y.goal
  )
  select g.goal, g.approved, g.pending, g.rejected, coalesce(r.revenue, '{}'::jsonb)
    from g
    left join r on r.goal = g.goal
   order by 1;
$$;

comment on function public.get_creative_conversion_goals(uuid, int) is
  'Postback conversions per goal for one creative the caller owns, over the same window as get_creative_conversions() (ADR-0027).';

revoke all on function public.get_creative_conversion_goals(uuid, int) from public;
grant execute on function public.get_creative_conversion_goals(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The owner's postback key and log (ADR-0023)
-- ---------------------------------------------------------------------------
-- The key is made on first sight rather than at sign-up: most accounts never
-- set up a postback, and a trigger on auth.users is one more thing a signup
-- can fail on. 32 hex characters from gen_random_uuid(), whose 122 random bits
-- come from the server's CSPRNG — no extension needed.
create or replace function public.ensure_postback_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_key  text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  insert into public.postback_keys (user_id, key)
  values (v_user, replace(gen_random_uuid()::text, '-', ''))
  on conflict (user_id) do nothing;

  select k.key into v_key from public.postback_keys k where k.user_id = v_user;
  return v_key;
end;
$$;

-- The remedy for a key that leaked. The old key stops working at once, so every
-- network holding the old URL has to be updated — the page says so beside the
-- button.
create or replace function public.rotate_postback_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_key  text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  insert into public.postback_keys (user_id, key)
  values (v_user, replace(gen_random_uuid()::text, '-', ''))
  on conflict (user_id) do update
    set key = excluded.key, created_at = now()
  returning key into v_key;
  return v_key;
end;
$$;

-- Read-only, unlike ensure_postback_key(): the creative page asks whether the
-- account has set a postback up at all before warning that a link lacks
-- {click_id}, and merely viewing that page must not make a key.
create or replace function public.has_postback_key()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.postback_keys k where k.user_id = (select auth.uid())
  );
$$;

create or replace function public.get_postback_log(p_limit int default 50)
returns table (
  received_at timestamptz,
  params      jsonb,
  result      text
)
language sql
security definer
set search_path = ''
stable
as $$
  select l.received_at, l.params, l.result
    from public.postback_log l
   where l.user_id = (select auth.uid())
   order by l.received_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.ensure_postback_key() from public;
revoke all on function public.rotate_postback_key() from public;
revoke all on function public.has_postback_key() from public;
revoke all on function public.get_postback_log(int) from public;
grant execute on function public.ensure_postback_key() to authenticated;
grant execute on function public.rotate_postback_key() to authenticated;
grant execute on function public.has_postback_key() to authenticated;
grant execute on function public.get_postback_log(int) to authenticated;

-- PostgREST caches the schema it exposes. Supabase reloads it on DDL by itself;
-- saying so here costs nothing and does not depend on that trigger, so a new
-- function or argument (ADR-0027's `p_goal`) is callable the moment this commits.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- End of schema
-- ============================================================================

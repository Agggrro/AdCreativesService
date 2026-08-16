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
                                                               as should_serve
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
create or replace function public.get_creative_serving(p_creative_id uuid)
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
  should_serve        boolean
)
language sql
security definer
set search_path = public, private
stable
as $$
  select creative_id, user_id, template_id, selected_format, config_json,
         creative_status, template_type, runtime_keys, supported_standards,
         is_entitled, should_serve
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

commit;

-- ============================================================================
-- End of schema
-- ============================================================================

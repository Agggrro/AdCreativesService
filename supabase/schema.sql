-- ============================================================================
-- AdInteract — database schema
-- ----------------------------------------------------------------------------
-- Mirrors docs/data-model.md. Two access patterns coexist:
--   * Dashboard path: RLS-enforced, per-user (anon/authenticated roles).
--   * Serving path:   public VAST endpoint reads the denormalized view in the
--                     `private` schema via the service role only (RLS bypassed
--                     by design — there is no user session). See docs/security.md.
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor or via CLI.
-- ============================================================================

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
    ('impression', 'start', 'q25', 'q50', 'q75', 'complete', 'interaction', 'click');
exception when duplicate_object then null; end $$;

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
  preview_url          text,
  config_schema        jsonb  not null default '{}',   -- JSON schema for the user config form
  pricing_tier         text,                           -- links to a Stripe price family
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.templates is 'Interactive ad templates; optimized into one variant per supported standard.';

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
  selected_format  text not null,                              -- must be in template.supported_standards
  config_json      jsonb not null default '{}',
  status           creative_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.creatives is 'User-configured ad; its id is the public creative_id used by the VAST endpoint.';

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
-- creative_events  (append-only analytics ingest)
-- ---------------------------------------------------------------------------
create table if not exists public.creative_events (
  id          bigint generated always as identity primary key,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  event_type  creative_event_type not null,
  meta        jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
comment on table public.creative_events is 'Append-only ad telemetry. Written by the serving/ingest layer (service role). Consider partitioning post-MVP.';

create index if not exists creative_events_creative_time_idx
  on public.creative_events (creative_id, occurred_at desc);

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
alter table public.creative_events enable row level security;
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

-- creative_events: no direct client access. RLS enabled with no policy => the
-- anon/authenticated roles are denied. Writes/reads go through the service role
-- (ingest) or future owner-scoped aggregate views.

-- ============================================================================
-- Serving view (hot path) — private schema, service role only
-- ----------------------------------------------------------------------------
-- Not exposed to PostgREST (only `public`/`graphql_public` are). The VAST
-- endpoint reads this by creative_id with the service role. Resolves effective
-- entitlement so the serving path needs no Stripe call and no live join logic
-- in app code. See docs/architecture.md.
-- ============================================================================
create schema if not exists private;

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
  exists (
    select 1 from public.subscriptions s
    where s.user_id = c.user_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (s.plan_type = 'all_access'
           or (s.plan_type = 'single' and s.template_id = c.template_id))
  )                          as is_entitled,
  -- Convenience: only serve the payload for an active creative that is entitled.
  (c.status = 'active' and exists (
    select 1 from public.subscriptions s
    where s.user_id = c.user_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (s.plan_type = 'all_access'
           or (s.plan_type = 'single' and s.template_id = c.template_id))
  ))                         as should_serve
from public.creatives c
join public.templates  t on t.id = c.template_id;

comment on view private.creative_serving is
  'Denormalized read for the public VAST endpoint. Service role only; not exposed via the API.';

-- Lock down: only the service role may touch the private serving surface.
revoke all on schema private from anon, authenticated;
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

-- ============================================================================
-- End of schema
-- ============================================================================

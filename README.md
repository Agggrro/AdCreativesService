# CreoSmith

Self-serve B2B SaaS for generating and managing **interactive video ad creatives**
(SIMID / VPAID / future standards) without writing code. Users configure a template,
get a dynamic **VAST tag URL** for their DSP, and access is gated by subscription — when
it lapses, the dynamic VAST stops serving the interactive payload.

> **Status: in production** at creosmith.com, serving ads from smithcdn.net. We are
> documentation-first: the architecture and rules are fixed in [`docs/`](docs/) before
> code is written. The GitHub repo holds production code only — we push after a case is
> built and verified locally.

## Tech stack

Next.js (App Router, TypeScript) · Tailwind CSS · Lucide React · Supabase (Postgres,
Auth, RLS) · Stripe · Cloudflare Workers (the ad domain, with the app moving off Vercel —
[ADR-0029](docs/decisions/0029-off-vercel-onto-cloudflare-workers.md)) · Workers KV
(serving snapshots) · Cloudflare R2 (advertiser media and creative units,
[ADR-0028](docs/decisions/0028-creative-media-on-r2.md)).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server, bound to `127.0.0.1` (see [docs/security.md](docs/security.md)) |
| `npm run lint` / `npm run typecheck` / `npm run build` | The pre-push gates |
| `npm run build:runtime` | Build the VPAID units into `runtime/dist/` (wipes it first) |
| `npm run runtime:push [prefix]` | Upload the built units to R2, content-addressed, and rewrite `runtime/manifest.ts` ([ADR-0017](docs/decisions/0017-runtime-assets-on-public-cdn.md), [ADR-0029](docs/decisions/0029-off-vercel-onto-cloudflare-workers.md)) |
| `npm run test:vast` / `test:ads` / `test:cors` / `test:snapshots` | Pin the ad path's bytes, the ad Worker's behaviour, its CORS, and the snapshot store's contract |
| `npx wrangler deploy -c workers/ads/wrangler.jsonc` | Deploy the ad Worker by hand — CI does it on every push to `main` |
| `npx opennextjs-cloudflare build` / `deploy` | The app's Worker through OpenNext — **CI only**: the build bundles any `.env*` file it finds, so it refuses to run beside one ([ADR-0029](docs/decisions/0029-off-vercel-onto-cloudflare-workers.md)) |
| `npm run db:schema` / `npm run db:seed` | Apply `supabase/schema.sql` / `supabase/seed.sql` |

The `runtime:` and `db:` commands read `.env.local`. See [runtime/README.md](runtime/README.md) for the
order to run them in when shipping a template change, and [.env.example](.env.example)
for the variables they need.

## Start here

- **[CLAUDE.md](CLAUDE.md)** — how we work, the non-negotiable AdTech rules, quality gates.
- **[docs/](docs/)** — the living design record:
  - [architecture.md](docs/architecture.md) · [adtech-standards.md](docs/adtech-standards.md)
    · [data-model.md](docs/data-model.md) · [billing.md](docs/billing.md)
    · [security.md](docs/security.md) · [mvp-scope.md](docs/mvp-scope.md)
  - [decisions/](docs/decisions/) — Architecture Decision Records.

## AI development setup

- **Skill `doc-sync`** — keeps `docs/` in sync with code on every change.
- **Subagents** — `vast-spec-reviewer`, `supabase-rls-auditor`, `billing-integrity-reviewer`.
- **`/security-review`** before pushing payments, auth, or the public VAST endpoint.

## Three core layers

1. **Dashboard** (authenticated, RLS) — showcase, configure creatives, manage billing.
2. **Database** (Supabase) — with a denormalized serving record for the hot path.
3. **Ad-serving** (public, edge, cached) — `GET /v` on the ad Worker, format-aware, subscription-gated,
   fails closed; Stripe webhook as source of truth.

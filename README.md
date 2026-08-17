# CreoSmith

Self-serve B2B SaaS for generating and managing **interactive video ad creatives**
(SIMID / VPAID / future standards) without writing code. Users configure a template,
get a dynamic **VAST tag URL** for their DSP, and access is gated by subscription — when
it lapses, the dynamic VAST stops serving the interactive payload.

> **Status: design phase.** No production code yet. We are documentation-first: the
> architecture and rules are fixed in [`docs/`](docs/) before code is written. The
> GitHub repo holds production code only — we push after a case is built and verified
> locally.

## Tech stack

Next.js (App Router, TypeScript) · Tailwind CSS · Lucide React · Supabase (Postgres,
Auth, RLS) · Stripe · Vercel.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server, bound to `127.0.0.1` (see [docs/security.md](docs/security.md)) |
| `npm run lint` / `npm run typecheck` / `npm run build` | The pre-push gates |
| `npm run build:runtime` | Build the VPAID units into `runtime/dist/` (wipes it first) |
| `npm run runtime:push [prefix]` | Upload the built units to the `creatives` Storage bucket |
| `npm run db:schema` / `npm run db:seed` | Apply `supabase/schema.sql` / `supabase/seed.sql` |

The last three read `.env.local`. See [runtime/README.md](runtime/README.md) for the
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
3. **Ad-serving** (public, edge, cached) — `GET /api/vast`, format-aware, subscription-gated,
   fails closed; Stripe webhook as source of truth.

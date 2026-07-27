# AdInteract — Project Context (CLAUDE.md)

> This file is loaded into every Claude Code session. It is the **single source of
> truth for how we work**. Keep it short and current. Detailed knowledge lives in
> `docs/` — link to it, don't duplicate it here.

## What we're building

**AdInteract** is a B2B self-serve SaaS where media buyers and creative agencies
generate and manage **interactive video ad creatives** (SIMID / VPAID / future
standards) without writing code. Users configure a template, get a dynamic **VAST
tag URL**, and paste it into their DSP. Access is gated by subscription: when a
subscription lapses, the dynamic VAST stops serving the interactive payload.

GitHub repo: https://github.com/Agggrro/AdCreativesService (production code only —
we push after a case is built and verified locally).

## Tech stack

- **App (FE+BE):** Next.js (App Router, TypeScript)
- **Styling/UI:** Tailwind CSS, Lucide React
- **DB + Auth:** Supabase (PostgreSQL, RLS)
- **Billing:** Stripe (webhooks are the source of truth)
- **Hosting:** Vercel

## Non-negotiable AdTech rules

These are the things that quietly break products in this domain. Violating them is a
bug even if the code "works". Details in [docs/adtech-standards.md](docs/adtech-standards.md).

1. **Multi-format by design.** Never hardcode a single interactive standard. A
   template is optimized into multiple variants (SIMID, VPAID, …) and the user
   picks the format in the UI. All VAST generation goes through a **format adapter**
   layer. See [ADR-0002](docs/decisions/0002-multi-format-creative-delivery.md).
2. **We do access control, not code hiding.** Client-executed creative JS is always
   inspectable. We never claim the code is "impossible to access". Our real levers:
   dynamic VAST kill-switch, short-TTL signed URLs, domain/referer allow-lists,
   server-side config injection, obfuscation. See [ADR-0003](docs/decisions/0003-access-control-over-code-hiding.md).
3. **The VAST endpoint is a public, high-QPS, latency-sensitive ad-serving path.**
   - No user session → **RLS does not apply**; use a scoped service-role read.
   - **Never call Stripe on this path.** Subscription state is denormalized and
     refreshed via Stripe webhooks.
   - Prefer edge runtime + short-TTL cache with explicit invalidation.
   See [docs/architecture.md](docs/architecture.md) and [docs/security.md](docs/security.md).

## Non-negotiable design rules

The UI is governed by **Instrument** — the design system in
[docs/design-system.md](docs/design-system.md), decided in
[ADR-0007](docs/decisions/0007-design-system-instrument.md). It is binding on every
page, component, state, and user-visible string. The short version:

1. **One light theme.** No dark theme, no toggle, no `prefers-color-scheme`. The single
   dark surface is the player well.
2. **Warm is action, cold is alarm.** The Sienna accent (`#A24B2E`) means action or
   current selection only, at most twice per screen. Errors are cold red, informational
   states are blue. Never the reverse.
3. **Tokens only.** No literal hex and no Tailwind palette colours (`gray-*`, `blue-*`,
   …) in components. Need a value the system lacks? Amend the doc first.
4. **Human writes sans, machine writes mono.** VAST tags, ids, formats, timecodes,
   metrics, status words, labels, and all text inputs are IBM Plex Mono with
   `tabular-nums`; prose is IBM Plex Sans.
5. **Hairlines, not shadows.** Radius 3px, 8pt grid, 44px table rows, lists are tables
   with a semantic state rail — not card grids.
6. **Every user-visible string is RU + EN** through the i18n layer, at the moment it is
   written. No locale logic on the public VAST path.

**Before building any new interface and after finishing it, invoke the
[`design-check`](.claude/skills/design-check/SKILL.md) skill.**

## Documentation discipline (read before committing)

Docs are part of the change, not an afterthought. **Every change that affects
behavior, schema, billing, security posture, or an AdTech standard MUST update the
relevant `docs/` file in the same change.** This is enforced by the
[`doc-sync`](.claude/skills/doc-sync/SKILL.md) skill — invoke it whenever you
finish a unit of work. Architectural decisions get a new ADR in `docs/decisions/`.

If code and docs disagree, that is a defect to fix, not a discrepancy to ignore.

## Quality gates (when to call which agent/skill)

- After writing/changing VAST/SIMID/VPAID output → **`vast-spec-reviewer`** subagent.
- After any Supabase migration, query, or RLS change → **`supabase-rls-auditor`** subagent.
- After any Stripe/subscription/webhook change → **`billing-integrity-reviewer`** subagent.
- Before **and** after any UI/UX work — new page, component, state, or user-visible
  string → run the **`design-check`** skill, then the **`design-system-reviewer`** subagent.
- Before pushing anything touching payments, auth, or the public VAST endpoint →
  run **`/security-review`**.
- After a unit of work → run **`/code-review`** and **`doc-sync`**.

## Conventions

- TypeScript strict. No `any` on data crossing trust boundaries (VAST input, webhooks).
- Secrets only in env vars; never commit `.env*`. `SUPABASE_SERVICE_ROLE_KEY` is
  server-only and must never reach the client bundle.
- Validate all external input (VAST query params, Stripe webhook signatures).
- Conventional Commits. Push to GitHub only after a case is built **and verified locally**.

## Project docs map

- [docs/architecture.md](docs/architecture.md) — system design, the three layers, ad-serving path
- [docs/adtech-standards.md](docs/adtech-standards.md) — VAST/SIMID/VPAID/MRAID, multi-format strategy, protection reality
- [docs/data-model.md](docs/data-model.md) — entities, relationships, RLS intent
- [docs/billing.md](docs/billing.md) — Stripe model, webhooks, subscription lifecycle
- [docs/security.md](docs/security.md) — trust boundaries, public endpoint, secrets
- [docs/design-system.md](docs/design-system.md) — Instrument: tokens, typography, components, RU/EN
- [docs/mvp-scope.md](docs/mvp-scope.md) — what's in/out of MVP
- [docs/decisions/](docs/decisions/) — Architecture Decision Records (ADRs)

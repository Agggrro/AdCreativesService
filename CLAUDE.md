# CreoSmith — Project Context (CLAUDE.md)

> This file is loaded into every Claude Code session. It is the **single source of
> truth for how we work**. Keep it short and current. Detailed knowledge lives in
> `docs/` — link to it, don't duplicate it here.

## What we're building

**CreoSmith** is a B2B self-serve SaaS where media buyers and creative agencies
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
   dynamic VAST kill-switch, short-TTL signed URLs, server-side config injection,
   obfuscation. See [ADR-0003](docs/decisions/0003-access-control-over-code-hiding.md).
3. **The VAST endpoint is a public, high-QPS, latency-sensitive ad-serving path.**
   - No user session → **RLS does not apply**; use a scoped service-role read.
   - **Never call Stripe on this path.** Subscription state is denormalized and
     refreshed via Stripe webhooks.
   - Prefer edge runtime + short-TTL cache with explicit invalidation.
   See [docs/architecture.md](docs/architecture.md) and [docs/security.md](docs/security.md).

## Non-negotiable design rules

The UI is governed by **Midnight** — the design system in
[docs/design-system.md](docs/design-system.md), decided in
[ADR-0022](docs/decisions/0022-midnight-design-system.md) (superseding ADR-0007). It is
binding on every page, component, state, and user-visible string. The short version:

1. **One dark theme.** No light theme, no toggle, no `prefers-color-scheme`, no `dark:`
   variants. The theme is not conditional.
2. **Warm is action, cold is alarm.** The apricot accent (`#E9A57B`) means action or
   current selection only — twice per product screen, three times on `/` and `/catalog`.
   Errors are cold red, informational states are blue. Never the reverse.
3. **Tokens only, and contrast is computed.** No literal hex and no Tailwind palette
   colours in `app/` or `components/`. Every new pair gets its WCAG ratio measured and
   written down — text ≥ 4.5:1, non-text ≥ 3:1. Need a value the system lacks? Amend the
   doc first.
4. **Human writes sans, machine writes mono.** VAST tags, ids, formats, timecodes,
   metrics, status words, labels, and all text inputs are IBM Plex Mono with
   `tabular-nums`; prose is Onest; display headings are Prata at 32px and up.
5. **Elevation, not shadows.** Radius scale 8/12/16/20, 8pt grid, 44px table rows, lists
   are tables with a semantic state rail — not card grids.
6. **Every surface is responsive**, checked at 390 / 768 / 1280 / 1920 / 2560. Page
   shells go through `ui/Container.tsx` inside `ui/Section.tsx` — a hand-typed
   `max-w-[…]` is a defect. Full-bleed colour with contained prose is what owns a wide
   monitor.
7. **Every user-visible string is RU + EN** through the i18n layer, at the moment it is
   written. No locale logic on the public VAST path.

**Creative templates are the one exemption.** `runtime/templates/**` and
`runtime/lib/vpaid-base.js` sit outside the palette, type scale, radius scale and depth
rules — a creative wears the advertiser's brand, not ours. They are still bound by the
close control ([ADR-0009](docs/decisions/0009-mandatory-close-control.md)), the VPAID
lifecycle plus `api.debug`, the `creative-check` gate, and legibility. Nothing there is a
precedent for anything in `app/`.

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

- Before **and** after any creative-template work — a new or changed render module in
  `runtime/templates/`, the shared base in `runtime/lib/vpaid-base.js`, a template's
  `config_schema`, or the runtime build — run the **`creative-check`** skill. It is
  mandatory: a template is verified by running it in `/dev/harness`, never by reasoning
  that it should work.
- After writing/changing VAST/SIMID/VPAID output → **`vast-spec-reviewer`** subagent.
- After changing the VAST **inspection** rules (`lib/vast-inspect/`) → `npm run check:vast`
  against a running dev server. It pins the fixture corpus and the dry-run guarantee;
  a false positive on a conformant tag is as much a defect as a missed violation.
- After any Supabase migration, query, or RLS change → **`supabase-rls-auditor`** subagent.
- After any Stripe/subscription/webhook change → **`billing-integrity-reviewer`** subagent.
- After changing **either** copy of the entitlement predicate — `private.is_entitled` in
  `supabase/schema.sql` or `lib/serving/entitlement.ts` — change the other in the same
  commit and run `npm run check:entitlement` (compares Postgres's own verdict against the
  TypeScript port) plus `npm run test:entitlement`. See [ADR-0015](docs/decisions/0015-serving-snapshots-on-cdn.md).
- After changing anything a serving snapshot projects (creative writers, the Stripe
  webhook, `templates` via `npm run db:seed`) → run `npm run snapshot:backfill`.
- Before **and** after any UI/UX work — new page, component, state, or user-visible
  string → run the **`design-check`** skill, then the **`design-system-reviewer`** subagent.
- Before pushing anything touching payments, auth, or the public VAST endpoint →
  run **`/security-review`**.
- After a unit of work → run **`/code-review`** and **`doc-sync`**.

## Local creative debugging

Building and fixing templates should not require a human in devtools. Three things make
the loop self-contained; all three are local-only and return **404** in production and on
every Vercel deployment (`lib/dev-only.ts`). What actually keeps them off the network is
that `npm run dev` binds `127.0.0.1` — the header check beside it is a second lock, not
the control, because request headers are spoofable. See [docs/security.md](docs/security.md).

- **`GET /api/dev/session`** — signs in the account named by `DEV_LOGIN_EMAIL` /
  `DEV_LOGIN_PASSWORD` in `.env.local` and redirects to the dashboard, so authenticated
  surfaces are reachable without typing into the login form. It calls the same
  `signInWithPassword` a real visitor does — an ordinary session, same cookie, same RLS,
  not a bypass. Create that account yourself; nothing here creates one.
- **`/dev/harness`** — runs a built VPAID unit against config derived from its template
  schema, at four slot sizes, and judges it against the mandatory lifecycle plus the
  ADR-0009 close control. `Run all` sweeps every template **sequentially**, which is
  forced rather than stylistic: VPAID units share the `window.getVPAIDAd` global, so two
  live units on a page render as one. It serves the unit from `runtime/dist/` off disk,
  so **run `npm run build:runtime` before looking** — `/api/preview-unit/*` deliberately
  serves the *published* unit instead and would hide a local edit.
- **The telemetry channel ([ADR-0019](docs/decisions/0019-creative-telemetry-channel.md))**
  — every VPAID lifecycle event, plus whatever a template declares through
  `api.debug(name, data)`, posted to our own origin and readable on any of our pages as
  `window.__creosmith` (and through `onEvent` in all three preview players). This is the
  only thing that sees inside IMA's cross-origin iframe. Two rules bind it: **never widen
  `targetOrigin`** — that one argument is the whole reason a creative cannot leak state to
  a publisher's page — and **nothing is collected server-side**.

When adding a template, give it an `api.debug("mount", { w, h, … })` and a record for each
state transition that has no VPAID event of its own. That is what makes it debuggable
without a human reading it out — and the mandatory
[`creative-check`](.claude/skills/creative-check/SKILL.md) skill checks that it did.

**The configurator's own preview does not show your local build.** It resolves the unit
through `runtime/manifest.ts` — the *published* object — so an edit appears there only
after `npm run runtime:push`. `/dev/harness` reads `runtime/dist/` off disk and is the one
surface that shows the working copy.

Bugs that reproduce **only** with an ad blocker, or only inside the user's own signed-in
session, are the exception this cannot cover — the in-app browser has neither. Use **Claude
in Chrome** for those, which drives the user's real browser with its real extensions.

## Conventions

- TypeScript strict. No `any` on data crossing trust boundaries (VAST input, webhooks).
- Secrets only in env vars; never commit `.env*`. `SUPABASE_SERVICE_ROLE_KEY` is
  server-only and must never reach the client bundle.
- Validate all external input (VAST query params, Stripe webhook signatures).
- Conventional Commits. Push to GitHub only after a case is built **and verified locally**.
- **Trunk-based: commit straight to `main`.** There are no feature branches and no PR
  review step in this pipeline — a push to `main` is what Vercel deploys to production, so
  "ship it" means commit to `main` and push. Local verification is the gate that replaces
  the review, which is why the quality gates above are not optional. Do not create a
  branch unless explicitly asked for one.

## Project docs map

- [docs/architecture.md](docs/architecture.md) — system design, the three layers, ad-serving path
- [docs/adtech-standards.md](docs/adtech-standards.md) — VAST/SIMID/VPAID/MRAID, multi-format strategy, protection reality
- [docs/data-model.md](docs/data-model.md) — entities, relationships, RLS intent
- [docs/billing.md](docs/billing.md) — Stripe model, webhooks, subscription lifecycle
- [docs/security.md](docs/security.md) — trust boundaries, public endpoint, secrets
- [docs/design-system.md](docs/design-system.md) — Midnight: tokens, typography, components, motion, RU/EN
- [docs/mvp-scope.md](docs/mvp-scope.md) — what's in/out of MVP
- [docs/decisions/](docs/decisions/) — Architecture Decision Records (ADRs)

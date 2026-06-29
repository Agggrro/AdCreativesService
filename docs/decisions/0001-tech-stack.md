# 0001. Tech stack: Next.js + Supabase + Stripe + Vercel

- Status: Accepted
- Date: 2026-06-29

## Context

AdInteract is a self-serve B2B SaaS that must reach market quickly with a small team.
It needs: marketing/landing pages, an authenticated dashboard, server endpoints
(including a public ad-serving endpoint), a relational DB with row-level access
control, subscription billing, and global low-latency serving.

## Decision

Use **Next.js (App Router, TypeScript)** for both frontend and backend, **Supabase
(PostgreSQL)** for database + auth + RLS, **Stripe** for billing, **Tailwind CSS +
Lucide React** for UI, deployed on **Vercel**.

## Consequences

- One codebase/language end-to-end; fast iteration; strong hosting/DX integration.
- Supabase RLS gives per-user data isolation for the dashboard without bespoke authz.
- **Caveat (load-bearing):** the public VAST endpoint is high-QPS and latency
  sensitive. Vercel serverless/edge works, but it forces discipline:
  - edge runtime + caching for `GET /api/vast`,
  - denormalized subscription status (no Stripe on the hot path),
  - scoped service-role DB reads (RLS can't apply without a session).
  These constraints are captured in [architecture.md](../architecture.md) and
  [security.md](../security.md).
- If ad-serving volume later outgrows the platform's edge/caching economics, the
  serving layer is isolated enough to move (own service/CDN) without touching the
  dashboard. We accept the current stack for speed-to-market and revisit only on
  evidence.

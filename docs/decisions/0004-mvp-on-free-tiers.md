# 0004. Run the MVP entirely on free tiers

- Status: Accepted
- Date: 2026-06-29

## Context

The owner is not ready to pay for infrastructure (notably a CDN) during the build/test
phase. We need the MVP — including hosting the interactive creative assets with signed,
expiring URLs — to cost $0 until there's a validated, revenue-generating case.

## Decision

Build and validate the MVP entirely on free tiers, reusing the existing stack:

- **Creative asset hosting → Supabase Storage** (free tier, CDN-backed) with native
  `createSignedUrl` short-TTL signed URLs. No separate paid CDN. This satisfies the
  access-control model from [ADR-0003](0003-access-control-over-code-hiding.md) without
  new cost or a new vendor.
- **Reference players → Google IMA SDK** (free) + a SIMID-capable player.
- **Billing → Stripe test mode** (free) during development.
- **DB/Auth → Supabase Free**; **App/host → Vercel Hobby** during development.

## Consequences

- Whole "code → test → demo" phase is free.
- **Going commercial is not free** and is a known, deferred cost:
  - **Vercel Hobby is non-commercial only** → must move to **Pro (~$20/mo)** when the
    app starts earning.
  - **Supabase Free projects sleep** after inactivity and have small quotas → **Pro
    (~$25/mo)** for production.
  - Stripe charges per-transaction fees (~2.9% + $0.30); at low price points like $2
    this is a meaningful ~18% margin hit.
- The storage choice is behind an adapter boundary: if serving volume later justifies
  it, swap Supabase Storage for a dedicated CDN (e.g. Cloudflare R2) without changing
  serving logic.
- This is the trigger point that aligns with the owner's workflow: pay for infra and
  push the production case to GitHub only after a successful, monetizable case.

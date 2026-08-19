# Architecture Decision Records (ADRs)

Each significant or hard-to-reverse decision gets a short, numbered, immutable record.
We don't delete ADRs; we supersede them with a newer one.

## How to add an ADR

1. Copy the template below into `NNNN-short-title.md` (next number, zero-padded).
2. Fill it in. Keep it short — context, decision, consequences.
3. Set status. If it replaces an older ADR, mark the old one `Superseded by NNNN`.
4. Link it from the relevant `docs/` file and from [CLAUDE.md](../../CLAUDE.md) if it
   introduces a project-wide rule.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-tech-stack.md) | Tech stack: Next.js + Supabase + Stripe + Vercel | Accepted |
| [0002](0002-multi-format-creative-delivery.md) | Multi-format creative delivery via adapter layer | Accepted |
| [0003](0003-access-control-over-code-hiding.md) | Access control over creative-code secrecy | Accepted |
| [0004](0004-mvp-on-free-tiers.md) | Run the MVP entirely on free tiers | Accepted |
| [0005](0005-interactive-image-creatives.md) | Interactive-image creatives via VPAID/SIMID (not display) | Accepted |
| [0006](0006-live-preview-token.md) | Stateless signed tokens for the live "Launch Ad" preview | Accepted |
| [0007](0007-design-system-instrument.md) | "Instrument" design system: single light theme, Sienna accent, cold semantics | Accepted |
| [0008](0008-catalog-first-information-architecture.md) | Catalog-first information architecture: three sections, public catalog, honest metrics | Accepted |
| [0009](0009-mandatory-close-control.md) | Mandatory close control, no fixed watch duration | Accepted |
| [0010](0010-advertiser-media-uploads.md) | Advertiser media uploads via a public Storage bucket | Accepted |
| [0011](0011-conditional-grouped-config-schemas.md) | Conditional, grouped config schemas — and per-path click-through | Accepted |
| [0012](0012-viewability-measurement.md) | Viewability measurement — OMID pass-through for SIMID, a custom module for VPAID | Accepted |
| [0013](0013-public-free-tools-section.md) | A public free-tools section, and a nav for signed-out visitors | Accepted |
| [0014](0014-vast-inspection-engine.md) | The VAST inspection engine — prose-derived rules, and dry-run by substitution | Accepted |
| [0015](0015-serving-snapshots-on-cdn.md) | Serving snapshots on the CDN, not a live database read | Accepted |
| [0016](0016-three-events-hourly-counters.md) | Three ingested events, counted into hourly buckets | Accepted |
| [0017](0017-runtime-assets-on-public-cdn.md) | Creative runtime assets on a public, content-addressed CDN | Accepted |
| [0018](0018-dedicated-ad-serving-domain.md) | A dedicated ad-serving domain, with neutral paths | Accepted |
| [0019](0019-creative-telemetry-channel.md) | Creative telemetry over an origin-locked postMessage channel | Accepted |
| [0020](0020-validator-reports-faults-not-opinions.md) | The validator reports faults, not opinions | Accepted |
| [0021](0021-validator-player-on-an-isolated-origin.md) | The validator's player runs on an isolated origin | Accepted |

## Template

```markdown
# NNNN. <Title>

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
<the forces at play, the problem>

## Decision
<what we decided>

## Consequences
<trade-offs, what becomes easier/harder, follow-ups>
```

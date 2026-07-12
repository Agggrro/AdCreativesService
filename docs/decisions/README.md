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

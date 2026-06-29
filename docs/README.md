# AdInteract Documentation

This folder is the **living design record** for AdInteract. It is documentation-first:
we fix decisions here *before* writing code, and we keep these files in sync with the
code on every change (see the [`doc-sync`](../.claude/skills/doc-sync/SKILL.md) skill).

## Index

| Doc | Purpose |
| --- | --- |
| [architecture.md](architecture.md) | System design: the three layers, the ad-serving path, data flow |
| [adtech-standards.md](adtech-standards.md) | VAST / SIMID / VPAID / MRAID, the multi-format strategy, the protection reality |
| [data-model.md](data-model.md) | Entities, relationships, and RLS intent (conceptual schema) |
| [billing.md](billing.md) | Stripe model, plans, webhooks, subscription lifecycle |
| [security.md](security.md) | Trust boundaries, public endpoint, secrets, RLS scope |
| [mvp-scope.md](mvp-scope.md) | What is in and out of the first shippable version |
| [decisions/](decisions/) | Architecture Decision Records (ADRs) — one file per significant decision |

## How we keep docs current

1. **Decide here first.** Significant or hard-to-reverse choices get an ADR.
2. **Change docs in the same unit of work as the code.** A behavioral, schema,
   billing, security, or standards change is incomplete until its doc is updated.
3. **Run `doc-sync`** at the end of a unit of work to catch drift.
4. **Code is the truth for *what*; docs are the truth for *why* and *intent*.**
   When they conflict, fix it — don't leave it.

## Status

This is **design-phase** documentation. No production code exists yet. The schema,
API contracts, and types described here are the agreed target; implementation follows
once the MVP scope is locked.

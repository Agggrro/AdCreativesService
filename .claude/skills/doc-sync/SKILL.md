---
name: doc-sync
description: Keep AdInteract's docs/ in sync with code on every change. Invoke at the end of a unit of work, or whenever behavior, DB schema, billing, security posture, API contracts, or AdTech-standard handling changes. Checks that the relevant docs/ files and ADRs were updated, and flags drift between code and documentation.
---

# doc-sync

AdInteract is **documentation-first**. Docs in `docs/` are the agreed design record and
must never silently drift from the code. This skill is the discipline that keeps them
honest. Run it at the end of a unit of work (and it is referenced as a quality gate in
`CLAUDE.md`).

## When this matters

A change requires a doc update when it touches any of:

| Change area | Update |
| --- | --- |
| System design / data flow / runtime placement | `docs/architecture.md` |
| VAST/SIMID/VPAID handling, format adapters, standards | `docs/adtech-standards.md` |
| DB tables, columns, relationships, RLS | `docs/data-model.md` |
| Stripe, plans, webhooks, subscription lifecycle | `docs/billing.md` |
| Trust boundaries, secrets, public endpoint, RLS scope | `docs/security.md` |
| What's in/out of the first release | `docs/mvp-scope.md` |
| A significant or hard-to-reverse decision | **new ADR** in `docs/decisions/` (+ index) |

Pure refactors with no behavioral/contract change don't need doc edits — but say so
explicitly rather than skipping silently.

## Procedure

1. **Determine the change surface.** Inspect what changed in this unit of work (git
   diff if available, otherwise the files just edited). Map it to the table above.
2. **Check each implicated doc.** For every area touched, confirm the doc reflects
   reality. Look specifically for:
   - new/renamed/removed DB fields not in `data-model.md`,
   - new env vars / secrets not in `security.md`,
   - new API params or endpoints not in `architecture.md`,
   - new or changed subscription/webhook behavior not in `billing.md`,
   - a new format adapter / standard not in `adtech-standards.md`,
   - any "code never accessible"-style overclaim (forbidden — see ADR-0003).
3. **ADR check.** Did this introduce or reverse a significant decision? If yes and no
   ADR exists, create one from the template in `docs/decisions/README.md`, add it to
   the index, and supersede any ADR it replaces.
4. **CLAUDE.md check.** Did a project-wide rule, gate, or stack fact change? If yes,
   update `CLAUDE.md` (keep it short — link to docs, don't duplicate).
5. **Apply the missing updates** (or, if invoked read-only, produce a precise list of
   exactly which files/sections need editing and why).
6. **Report.** Summarize: what changed, which docs were updated, and an explicit
   "no doc change needed because …" for any area you deliberately skipped.

## Rules

- **Docs ship with the code, in the same unit of work.** Never defer "I'll document it
  later."
- **Code is truth for *what*; docs are truth for *why/intent*.** When they conflict,
  that's a defect to fix now, not a discrepancy to note.
- **Keep the `docs/README.md` index and `docs/decisions/README.md` index current** when
  files are added.
- **Never invent status.** If something is designed but not built, label it design-phase.

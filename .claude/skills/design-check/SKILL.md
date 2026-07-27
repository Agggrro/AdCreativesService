---
name: design-check
description: Hold AdInteract's UI to the "Instrument" design system. Invoke BEFORE building any new interface — page, component, modal, state, empty/error view — and again at the end of the UI unit of work. Covers tokens, the human/machine typography split, state-rail tables, the accent budget, focus states, and RU/EN string coverage.
---

# design-check

AdInteract's UI is governed by **Instrument** — a single light theme, a Sienna accent
that only ever means *action*, cold semantics, hairlines instead of shadows, and mono
type for everything the machine owns. The full contract is
[`docs/design-system.md`](../../../docs/design-system.md); the rationale is
[ADR-0007](../../../docs/decisions/0007-design-system-instrument.md).

A design system does not erode in one big rewrite — it erodes one convenient exception at
a time. This skill is the discipline that prevents that.

## When this matters

Invoke it whenever work adds or changes anything a user sees:

| Work | Why it triggers |
| --- | --- |
| A new page or route with UI | Whole new surface to keep on-system |
| A new component, or a new variant/state of one | Shapes, tokens, and states must match |
| Empty, loading, and error states | The states most often left un-designed |
| A new user-visible string | Needs both RU and EN |
| A new colour, radius, size, or spacing value | Must become a token in the doc *first* |
| Any Tailwind class touching colour, radius, shadow, spacing | The usual drift vector |

Pure logic changes with no visual or copy surface don't need it — but say so explicitly
rather than skipping silently.

## Procedure

### Before building

1. **Read [`docs/design-system.md`](../../../docs/design-system.md).** Do not design from
   memory of it, and do not design from what neighbouring code happens to do — existing
   code may predate the system.
2. **Find the precedent.** Is this list a table with a state rail? Is this panel a
   hairline panel? Reuse the established pattern instead of inventing a sibling of it.
3. **Check the budget before you spend it.** One primary button per screen; at most two
   accent appearances; one dark surface in the whole product (the player well).
4. **If the system lacks what you need, amend the system first.** Add the token or
   pattern to `docs/design-system.md` (and ADR-0007 if the rule itself changes) in the
   same unit of work — never inline an ad-hoc hex "for now".

### After building

5. **Self-check against the boundaries table** in §9 of the design system: no raw
   Tailwind palette colours, no shadows, no `rounded-lg`, no card grid where a table
   belongs, no warm red, no flags, no second theme.
6. **Verify both locales** are supplied for every new string, and that no locale logic
   reached `app/api/vast/**`.
7. **Verify focus states** exist and are visible on every interactive element.
8. **Run the [`design-system-reviewer`](../../agents/design-system-reviewer.md)
   subagent** on the changed files and act on its findings.
9. **Run [`doc-sync`](../doc-sync/SKILL.md)** if the change also affects behaviour,
   schema, billing, security, or an AdTech standard.

## Rules

- **The document is the authority.** Existing code is not proof of correctness — most of
  the app predates Instrument and is being migrated.
- **Tokens only.** A literal hex or a Tailwind palette colour in a component is a defect,
  not a style preference.
- **Warm is action, cold is alarm.** Never use the accent for a status, and never use a
  status colour for decoration.
- **Every new string is bilingual** at the moment it is written, not later.
- **Report honestly.** List what you checked, what you fixed, and anything you knowingly
  left off-system with the reason.

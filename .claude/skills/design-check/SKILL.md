---
name: design-check
description: Hold CreoSmith's UI to the "Midnight" design system. Invoke BEFORE building any new interface — page, component, modal, state, empty/error view — and again at the end of the UI unit of work. Covers tokens, the human/machine typography split, state-rail tables, the accent budget, responsive coverage, motion, focus states, and RU/EN string coverage.
---

# design-check

CreoSmith's UI is governed by **Midnight** — one dark theme, a warm pastel apricot accent
that only ever means *action*, cold semantics, elevation-plus-hairline instead of shadows,
and mono type for everything the machine owns. The full contract is
[`docs/design-system.md`](../../../docs/design-system.md); the rationale is
[ADR-0022](../../../docs/decisions/0022-midnight-design-system.md), which supersedes
ADR-0007.

A design system does not erode in one big rewrite — it erodes one convenient exception at
a time. This skill is the discipline that prevents that.

## The one real exception, before anything else

**Creative templates are outside the system.** Everything under `runtime/templates/**` and
`runtime/lib/vpaid-base.js` is exempt from the palette, the type scale, the radius scale,
the spacing scale, and the depth rules — a creative wears the *advertiser's* brand, not
ours (§8 of the design system, ADR-0022).

If the work is only in those files, say so and **do not run the rest of this check** —
run [`creative-check`](../creative-check/SKILL.md) instead. What still binds a template:
the mandatory close control, the VPAID lifecycle plus `api.debug`, the harness gate at
four slot sizes, and legibility (4.5:1 text, 44px targets).

The exemption is scoped to those files, not to arguments. A literal hex in a template is
never a precedent for one in `app/` or `components/`.

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
| Anything animated | §9 — timing, named properties, reduced-motion |

Pure logic changes with no visual or copy surface don't need it — but say so explicitly
rather than skipping silently.

## Procedure

### Before building

1. **Read [`docs/design-system.md`](../../../docs/design-system.md).** Do not design from
   memory of it, and do not design from what neighbouring code happens to do — existing
   code may predate the system. Much of the app was written under Instrument (light
   theme, Sienna, 3px radius) and is being migrated.
2. **Find the precedent.** Is this list a table with a state rail? Is this shell a
   `Container` inside a `Section`? Reuse the established pattern instead of inventing a
   sibling of it.
3. **Check the budget before you spend it.** One primary button per screen; at most two
   accent appearances in the content area (three on `/` and `/catalog`, and the third is
   the repeated CTA, not decoration); one well per page.
4. **If the system lacks what you need, amend the system first.** Add the token or
   pattern to `docs/design-system.md` (and a new ADR if the rule itself changes) in the
   same unit of work — never inline an ad-hoc hex "for now".

### After building

5. **Self-check against the boundaries table** in §11: no literal hex or Tailwind palette
   colours, no arbitrary `text-[Npx]`, no shadow used as depth, no pills, no card grid
   where a table belongs, no warm red, no icon-only actions, no flags, no second theme,
   no hard `<br>` in a heading.
6. **Compute every new contrast pair — do not judge it.** Text ≥ 4.5:1, large text and
   non-text ≥ 3:1, against the background it actually sits on. Write the number next to
   the token. This is not optional on a dark theme: the previous palette's five state
   colours all measured between 2.30 and 3.57 here, and the alarm colour failed even the
   non-text floor.
7. **Check every width.** 390 / 768 / 1280 / 1920 / 2560. No page scrolls sideways, and
   navigation exists at every width.
8. **Verify both locales** are supplied for every new string, and that no locale logic
   reached `app/api/vast/**`. Russian runs longer than English — check the longer one.
9. **Verify focus states** exist and are visible on every interactive element, and that
   no focus ring sits inside an `overflow-hidden` box. This is the single most repeated
   defect in this codebase.
10. **Check motion** under `prefers-reduced-motion: reduce`: everything but colour is
    disabled, and a reveal renders in its final state rather than staying invisible.
11. **Run the [`design-system-reviewer`](../../agents/design-system-reviewer.md)
    subagent** on the changed files and act on its findings.
12. **Run [`doc-sync`](../doc-sync/SKILL.md)** if the change also affects behaviour,
    schema, billing, security, or an AdTech standard.

## Rules

- **The document is the authority.** Existing code is not proof of correctness — much of
  the app predates Midnight and is being migrated.
- **Tokens only.** A literal hex or a Tailwind palette colour in `app/` or `components/`
  is a defect, not a style preference. `runtime/templates/**` is the one exemption.
- **Warm is action, cold is alarm.** Never use the accent for a status, and never use a
  status colour for decoration.
- **Contrast is computed, not eyeballed.**
- **Every new string is bilingual** at the moment it is written, not later.
- **Report honestly.** List what you checked, what you fixed, and anything you knowingly
  left off-system with the reason.

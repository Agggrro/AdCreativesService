# 0007. "Instrument" design system: single light theme, Sienna accent, cold semantics

- Status: Accepted
- Date: 2026-07-26

## Context

The UI was the untouched Next.js starter: white ground, `border-gray-200` hairlines,
black pill buttons, `rounded-lg` everywhere, and a `body { font-family: Arial }` rule in
`app/globals.css` that silently overrode the Geist font the layout was loading. Two
theme tokens were declared under `prefers-color-scheme: dark` and no component consumed
them, so the dark theme was half-broken by construction. There was no spacing scale, no
semantic colour, and the landing page and the dashboard carried identical visual weight
even though one sells and the other is operated all day.

Without a fixed system, every new screen re-invents its own spacing, colour, and
component shapes, and the drift compounds.

Three directions were considered:

- **Broadcast console** — dark-first, video-suite feel. Strong for the dashboard and the
  player, but a dark landing page is harder to make sell, and it commits the product to
  a second theme we would then have to maintain.
- **Press / advertising heritage** — light, editorial, oversized condensed display type.
  Good for the landing page; forces the dashboard to be deliberately muted so dense data
  does not fight the loud typography.
- **Instrument (chosen)** — light, technical, Swiss-adjacent grid; character from
  precision rather than from boldness.

Instrument was chosen because the dashboard, the configurator, and the preview — not the
landing page — are where users spend their time, and because a restrained system is
cheaper to hold to across many small future screens.

Its known risk is that "restrained technical B2B" is exactly where generic SaaS design
lives. That risk is answered by the specific rules in
[design-system.md](../design-system.md), not by decoration.

## Decision

- **One light theme.** No dark theme, no toggle. The only dark surface is the player
  well (`#17150F`), which is a function — a creative is judged against black — not a
  second theme.
- **Accent: Sienna `#A24B2E`**, a restrained warm terracotta, chosen by the product
  owner over the originally proposed ultramarine. It means action or current selection
  only, at most twice per screen. White on it is 5.9:1 (AA).
- **Semantics are pushed cold** as a direct consequence of the warm accent: error
  `#B02537` (cold red, so it cannot blend into the accent), and blue — freed by dropping
  ultramarine as the accent — becomes the informational/trial state `#2C5FA8`. Live is
  `#1B7A52`, idle `#C4BFB7`.
- **Neutrals are warm-biased** to sit with the accent; raw Tailwind palette greys are
  banned.
- **Typography splits by ownership:** IBM Plex Sans for anything a human wrote, IBM Plex
  Mono with `tabular-nums` for anything the machine owns — tags, ids, formats,
  timecodes, metrics, status words, labels, and all text inputs.
- **Lists are tables with a 3px semantic state rail**, not card grids. No shadows
  anywhere except floating overlays. Radius 3px. 8pt grid. 44px rows.
- **The UI is bilingual (RU/EN)** with a segmented `RU | EN` control in the top bar;
  language codes, not flags. The choice persists in a **cookie**, written server-side —
  not on `profiles`, because storing it there is a schema migration and a display
  preference is not a good reason to put one inside a styling release. The public VAST
  endpoint stays locale-free — it has no session and no UI.
- **Enforcement is structural, not aspirational:** a [`design-check`](../../.claude/skills/design-check/SKILL.md)
  skill runs at the end of any UI unit of work, a
  [`design-system-reviewer`](../../.claude/agents/design-system-reviewer.md) subagent
  audits changed UI against this document, and `CLAUDE.md` names both as gates.

## Consequences

- Every new colour, radius, shadow, or type size is a documentation change first. That
  is intentional friction: it is what keeps the system from eroding one screen at a time.
- Dropping the dark theme removes a whole maintenance axis, and removes the
  half-implemented `prefers-color-scheme` block from `globals.css`. Users who expect a
  dark dashboard will not get one; the player well is the concession.
- The warm accent constrains the status palette permanently — a future "warning amber"
  would sit between the accent and the alarm and is therefore disallowed; informational
  states use blue instead.
- Bilingual UI means every new user-visible string needs both locales, and it introduces
  an i18n layer the app did not have. The gate is explicit: a hardcoded human-readable
  string is a defect — and it is enforced by the type system, since the English
  dictionary is typed against the Russian one, so a missing translation fails the build.
- Cookie-only locale has one visible consequence: a user on a second browser starts at
  the default locale. Accepted for now; the follow-up is a `locale` column on `profiles`
  seeded into the cookie on sign-in, which travels with the next migration rather than
  with a styling change.
- The first `design-system-reviewer` run against this migration found the system document
  contradicting itself — the accent budget counted the brand mark, which is present on
  every screen and therefore spent one of two slots before a page rendered anything. The
  budget now scopes to the content area, with the persistent top-bar chrome exempt. The
  gate paid for itself on its first use.
- A later `design-system-reviewer` run (creatives-table copy/edit/delete fix, 2026-08-15)
  caught the same class of self-contradiction again: §9's "no icon-only actions" rule was
  left standing while a new §6 section quietly described an icon-only delete trigger. The
  fix is a narrow, explicit carve-out in §9 itself — a data table's per-row action cell,
  where a repeated text label would force the table into horizontal scroll, may go
  icon-only *if* `aria-label` and `title` both carry the verb — rather than a second
  section asserting an exception the boundaries table didn't know about. Anywhere outside
  a table's action cell, icon-only is still off-limits.
- The first shipped version of that carve-out used the standard 14px icon size — correct
  next to a label, unreadable without one. A user screenshot of the live table showed
  three indistinguishable specks instead of a copy/pencil/trash silhouette, so it went to
  18px with `absoluteStrokeWidth`. A second screenshot, after that fix, showed the same
  specks — and a DevTools inspection this time, which found the SVG rendering exactly as
  specified (18×18, correct path data, a 2px effective stroke): the markup was never
  wrong, the icons genuinely are that hard to place without a word next to them. The
  carve-out was narrowed a second time, to copy alone, on the theory that the tag text
  beside it already carried the meaning. It didn't survive contact with the user either —
  asked directly why copy still wasn't fixed, because from the row it looks exactly as
  unlabelled as edit and delete did. The carve-out is retracted entirely: all three actions
  are visible-label buttons, §9 is back to its original unqualified rule, and the column
  budget that icon-only was solving for is handled by narrower number/status columns and a
  dropped tag-text preview (§6) instead. Four iterations, three of them because the
  exception kept getting *narrowed* instead of *questioned* — "technically renders
  correctly" and "reads as a button" are different claims, but so are "this one specific
  case is justified" and "icon-only is ever the right call in a product this dense."
- The same unit of work produced the overlay-portalling rule in §6, and it is worth
  recording *how* it was found, because the process failed twice before it worked. The
  delete dialog's body copy overflowed its card on the live site. Two fixes were shipped
  from reasoning alone (`min-w-0` for a flex `min-width: auto` that was never the cause;
  `break-words`, which `nowrap` overrides), and when a local reproduction rendered the
  dialog *outside a table* and computed `white-space: normal`, the clean result was
  reported as proof the code was fine — and the cause pinned on a browser extension. The
  user disproved that with a screenshot showing the extension paused and the bug present.
  The actual cause was `white-space: nowrap` inherited from the row's `<td>` through a
  `position: fixed` element that was still a DOM descendant of it, and it was found in
  minutes once the reproduction included the `<td>`. Two lessons, both now in §6: overlays
  are portalled, and a component is reproduced in the context it ships in. A third, for
  this file: a local test that does not reproduce the reported symptom has not exonerated
  the code, it has only failed to reproduce — and "works on my machine, must be your
  browser" is that mistake wearing a conclusion's clothes.
- The mono-for-machine-data rule makes VAST tags, ids, and timecodes noticeably easier to
  read and diff, at the cost of a slightly denser, more technical feel on marketing
  surfaces. That trade is accepted: the dashboard is the product.
- Fixing the token layer also fixes the pre-existing font bug — the `Arial` override in
  `app/globals.css` meant no page has ever rendered in its intended typeface.

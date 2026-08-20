# Midnight — the CreoSmith design system

> The visual and interaction contract for every CreoSmith surface. Binding on all UI
> work: new pages, new components, new states, and edits to existing ones. Enforced by
> the [`design-check`](../.claude/skills/design-check/SKILL.md) skill and the
> [`design-system-reviewer`](../.claude/agents/design-system-reviewer.md) subagent.
> Rationale and rejected alternatives live in
> [ADR-0022](decisions/0022-midnight-design-system.md), which supersedes
> [ADR-0007](decisions/0007-design-system-instrument.md).
>
> **One exception exists and it is a large one:** creative templates are outside this
> document. See §8 before touching anything under `runtime/`.

## 1. Thesis

We sell interactive video creative. A prospect judges the product by how it looks before
they configure anything, and a media buyer then lives inside it all day. **Midnight** is
designed for both: a dark room where the creative is the light source.

Three consequences follow, and they override any local styling preference:

1. **The page is the room, the creative is the light.** Nothing on a screen competes with
   the ad running on it.
2. **Restraint is still the aesthetic.** Dark is not permission to decorate. If a screen
   looks busy, the fix is removal.
3. **Warm is action, cold is alarm.** See §3 — this is the load-bearing rule of the whole
   palette, and it survives from Instrument unchanged.

## 2. Foundations

- **Single dark theme.** There is no light theme and no theme toggle. `color-scheme` is
  `dark`. A user who needs a light UI is a cost this system accepts; see ADR-0022.
- **8pt grid.** Layout spacing is a multiple of 4px; the rhythm is 8/12/16/24/32/48/64,
  extended to 80/96/112/128 for marketing-scale section padding. Two carve-outs, both
  stopping at the control's edge: *padding inside a control* may use 2px steps where that
  is what lands it on its height, and the *gap between the parts of one control* — status
  dot to word, brand mark to wordmark, icon to label — may do the same, because those
  parts read as a single object. The gap between a label and its field is layout.
- **Radius is a scale, not a value.**

  | Token | Value | Use |
  | --- | --- | --- |
  | `--radius-ctl` | `8px` | Buttons, inputs, chips, segments |
  | `--radius-panel` | `12px` | Panels, notices, dropdowns, tag bars |
  | `--radius-card` | `16px` | Cards, template tiles, feature blocks |
  | `--radius-well` | `20px` | The player well |

  `50%` for the status dot, and for two shapes that are circles by nature rather than
  by styling: the brand stage’s ambient halo (§6) and a drag handle drawn as a knob.
  Nothing else is rounded, and there are no pills.
- **Depth is elevation plus a hairline**, and the hairline does most of the work.
  Surfaces step `ground` → `surface` → `surface-2` at **1.06:1** and **1.07:1**; the
  hairline sits at **1.31:1** against ground and **1.24:1** against surface. Those tone
  steps are deliberately in the same band the previous light system used (1.11 and 1.04),
  so elevation reads about as strongly as it did — but on either theme a surface change
  alone is a whisper, and the rule that draws the edge is what makes it legible. **A
  raised block with no border is not elevated, it is invisible.**

  On a dark ground a drop shadow does almost nothing, so shadow is not a depth tool here
  — the one `--shadow-overlay` token exists solely to detach a floating overlay
  (dropdown, popover, modal) from the page beneath it. A modal's backdrop is
  `bg-ground/70`, not a new colour.
- **Row height 44px** in data tables (12px vertical padding on 13px/20px text). One
  narrower density exists, and only for machine readouts — see §6, "Readout density".
- **A focus outline is drawn at 2px offset, so it must never sit inside an
  `overflow-hidden` box.** This applies to every grouped control — segments, tiles,
  anything using a `gap-px` hairline container: round the first and last child instead of
  clipping the parent. It is the single most repeated way focus disappears in this
  codebase.

## 3. Colour

Every ratio in this document was **computed with the WCAG formula against the stated
background**, not estimated. Re-compute rather than eyeball when changing any of them.

### Neutrals — warm, chosen, not inherited

The ramp is warm-biased so it sits with the accent; a cold grey next to apricot reads
dirty. Never use a raw Tailwind palette grey (`gray-*`, `slate-*`, `zinc-*`).

Tailwind v4 emits utilities from the `--color-*` namespace, so the token name and the
class name are one lookup apart — `--color-hairline` → `border-hairline`, `bg-hairline`.

| Token | Utility stem | Hex | On `ground` | Use |
| --- | --- | --- | --- | --- |
| `--color-ground` | `ground` | `#0D0B0A` | — | Page ground, and the well's own tone |
| `--color-surface` | `surface` | `#161311` | — | Panel, card, raised section |
| `--color-surface-2` | `surface-2` | `#1E1A17` | — | Panel header, inset, hover fill |
| `--color-hairline` | `hairline` | `#2C2621` | — | The default border, panel edges, table head |
| `--color-line` | `line` | `#342D27` | — | Strong hairline, control border |
| `--color-fg` | `fg` | `#F2EDE6` | 16.86:1 | Primary text |
| `--color-fg-secondary` | `fg-secondary` | `#A79E92` | 7.43:1 | Secondary text, body copy on dark |
| `--color-fg-muted` | `fg-muted` | `#928879` | 5.63:1 | Muted text, labels, placeholders |
| `--color-fg-disabled` | `fg-disabled` | `#6E665C` | 3.48:1 | **Non-text only** — disabled marks, inactive glyphs |

`fg-disabled` is under the 4.5:1 text threshold on purpose and may **not** carry a word.
Disabled *text* uses `fg-muted` on a `surface-2` fill; `fg-disabled` draws shapes.

Lines come in two weights on purpose: `hairline` draws the outside of a panel and the
rule under a table head, `line` draws a control's own border. Row separators inside a
table use `hairline` — the lighter inner rule is what keeps a 30-row table from reading
as a grid.

### Accent — Apricot

Warm pastel apricot. It means **action or current selection**, and nothing else.

| Token | Utility | Hex | Ratio | Use |
| --- | --- | --- | --- | --- |
| `--color-accent` | `bg-accent` / `text-accent` | `#E9A57B` | 9.48:1 on `ground` | Primary button, active nav underline, brand mark, focus ring |
| `--color-accent-hover` | `bg-accent-hover` | `#F2BF9C` | — | Hover/active state of the above |
| `--color-accent-ink` | `text-accent-ink` | `#14100D` | 9.13:1 on `accent` | The label *on* an accent fill |
| `--color-accent-tint` | `bg-accent-tint` | `#251A13` | — | Selected row, current-choice background |

**The accent is pastel because it has to be.** Instrument's Sienna `#A24B2E` measures
**3.11:1** on this ground — below the text threshold. A warm accent on black must be
lightened or it cannot carry a word. Do not darken it back toward the old terracotta
without re-measuring both ratios above.

**Accent budget.** At most **two** accent appearances in the content area of a product
screen — typically one primary button plus one current-state marker. A third means
something else must give it up.

**The marketing surfaces get three**, and the third is spent on the repeated call to
action rather than on decoration: a landing page that states its offer once at the top and
once at the bottom is answering a visitor's reading order, not decorating. `/` and
`/catalog` are the whole list. It is a budget of three, not a suspension of the rule —
an accent on a heading, an icon, or a rule is still a defect on every surface.

**Persistent chrome is exempt from the count** on every surface: it is on every screen by
definition, and counting it would spend a slot before a page renders anything. The
exemption covers exactly three things:

- the **whole brand lockup, wherever chrome puts it** — the monogram's `C` and the
  wordmark's `Creo`, one identity in two pieces, not two spends. That means the top bar
  **and the footer**: the same lockup at the bottom of the page is the same identity, not
  a second spend, and a footer that has to render its own brand in grey to stay under
  budget is the rule mis-applied;
- the **active-section marker** (the underline on desktop, the coloured row in the mobile
  panel — the same marker in two layouts);
- the **single sign-up action for a signed-out visitor**. There is one of it in the whole
  app, it is the product's only conversion action, and both reference sites this system
  was measured against fill theirs. A signed-in bar has no such button, so this costs
  nothing on the surfaces where the budget is tightest.

Nothing else. The language control is not a task action and must not be accent-filled,
and a second filled button in the bar is a defect rather than a second exemption.

Everything below the top bar counts, and the counts above are per *content area*: a
catalog index at budget zero still shows the bar's sign-up button, and that is not a
violation.

### Semantics — deliberately cold

Because the accent is warm, the status vocabulary is pushed cold. A warm red would blend
into the accent and stop reading as an alarm; blue, freed from accent duty, carries
informational states.

**This ramp was rebuilt for the dark ground, not ported.** Instrument's values all failed
here — `live-fg` 2.59, `info-fg` 2.41, `warn-fg` 2.30, `dead-fg` 2.33, `idle-fg` 3.57
against a 4.5:1 threshold, and the `dead` rail at 2.96 fell under even the 3:1 non-text
floor, which would have left the alarm colour invisible.

| State | Rail / dot / text (`--color-*`) | On `ground` | Tint (`-bg`) | Meaning |
| --- | --- | --- | --- | --- |
| live / active | `live` `#63C79A` | 9.51:1 | `#12251C` | Serving, entitled — and, in a configurator matrix, fully configured |
| trial / info | `info` `#89B0EA` | 8.85:1 | `#141D2B` | Trialing, renewing soon, informational |
| warn / at risk | `warn` `#A796EE` | 7.71:1 | `#1B172B` | Valid but fragile: deprecated, ambiguous, or broken in part of the market |
| dead / past due | `dead` `#EE8089` | 7.56:1 | `#2B1418` | Lapsed, failing, fail-closed |

`dead` has one extra token, `--color-dead-hover` `#F4979E`, for the destructive
button alone — `dead-bg` on it measures 8.03:1. It is the accent’s `-hover` twin and
exists for the same reason: a button needs a hover state, and a state colour is not
allowed to acquire one by opacity.
| idle / draft | `idle` `#A79E92` | 7.43:1 | `#1E1A17` | Not published, no activity, nothing filled in yet |

One token per state now carries the rail, the dot **and** the word — the light system
needed a separate darkened `-fg` because its rail tone was too light to read as text; on
dark the relationship inverts and the single tone clears AA in both roles. Tints are
*darkened* grounds built down from `surface`, not lightened washes.

Semantic colour is **not** the accent and never decorates. It only encodes state.

`warn` is violet rather than the amber a warning usually wears, and that is forced rather
than stylistic: amber is warm, warm means action, and a warning that reads as a button is
worse than no warning. Violet is cold, sits clearly apart from `info` blue and `dead` red,
and cannot be mistaken for the accent.

The three-step severity it exists for is the VAST validator's (§6): a violation of the
declared spec is `dead`, something legal but known to break in part of the market is
`warn`, and an opportunity is `info`. Collapsing the middle step would hide the difference
between "this will bite you" and "you could do better", which is what the report is read
for.

## 4. Typography

Three faces, one rule about two of them.

- **Prata** — the display face. Headline sizes only (≥32px), weight 400 — it ships in one
  weight and there is no other. Never for body copy, never below 32px.
- **Onest** — everything else a human wrote: section headings, body copy, button labels,
  help text, error messages.
- **IBM Plex Mono** with `font-variant-numeric: tabular-nums` — everything the machine
  owns or a human must read character by character: VAST tags and URLs, creative and
  template ids, format/standard names (`SIMID 1.1`, `VPAID 2.0`), timecodes, durations,
  counts and metrics, status words, field labels, **and all text inputs** (they hold URLs,
  macros, and timecodes).

The **human/machine split is the most recognisable feature of the interface**. It is a
rule, not a preference. All three faces cover Latin and Cyrillic, so both UI languages
(§9) share one grid with no font substitution.

| Role | Size / line | Weight | Face | Notes |
| --- | --- | --- | --- | --- |
| display | 76/1.08 | 400 | Prata | `-0.025em`, landing hero only |
| display-sm | 52/1.12 | 400 | Prata | `-0.022em`, closing CTA |
| h1 | 44/1.14 | 400 | Prata | `-0.02em`, section headings on marketing surfaces |
| h2 | 26/1.25 | 500 | Onest | `-0.015em`, page titles, sub-section headings |
| h3 | 19/1.35 | 500 | Onest | `-0.01em`, card and step titles |
| body-lg | 19/1.6 | 300 | Onest | Hero pitch, section lede |
| body | 15/1.65 | 300 | Onest | Running text; keep near 65 characters wide |
| small | 13/1.6 | 300 | Onest | Help text, table cells, card copy |
| caption | 12/16 | 400 | Onest | The smallest sans that exists: field help, a metric's qualifier |
| data | 13/20 | 400 | Mono | `tabular-nums` |
| label | 11/16 | 500 | Mono | Uppercase, `+0.12em` — instrument-panel legends (`label-instr`) |
| chip | 11/16 | 500 | Mono | Uppercase, `+0.07em` — format chips, segment buttons, state words |

Two rules the table encodes and that are easy to lose:

- **Tracking changes sign with size.** Negative above ~32px, positive below ~16px. This is
  optical compensation, not decoration, and it is the single most "designed" detail here.
- **Body weight is 300 and leading is at least 1.6.** Both matter more in Russian than in
  English: Cyrillic lowercase is largely descender-free with a tall x-height and a dense
  vertical rhythm, so tight leading makes lines collide. Never take body leading below
  1.45 in any language.

`text-sm` (14px) is not on this scale. **Sizes are consumed as utilities from
`app/globals.css`, never as arbitrary `text-[Npx]` values** — the absence of that scale is
what produced 123 hardcoded sizes in the previous system.

Headings use `text-wrap: balance`. Hard `<br>` in a heading is a defect: it is tuned to one
viewport width and wrong at every other.

## 5. Layout

- **Width is a scale**, consumed through `ui/Container.tsx` — never a hand-typed
  `max-w-[…]`. Copy-pasting a width literal is how the previous system ended up with the
  same value re-typed in eight files.

  | Variant | Max width | Use |
  | --- | --- | --- |
  | `narrow` | `416px` | A single-column panel: sign-in, sign-up, anything whose form is the whole page |
  | `prose` | `68ch` | Documentation-like pages, legal copy |
  | `default` | `1200px` | Dashboard, catalog, tool pages |
  | `wide` | `1440px` | Marketing sections with grids |
  | `full` | none (padding only) | A section that must reach both edges |

- **Colour owns the monitor, not text width.** Section backgrounds run **full-bleed**
  while the content inside them stays in a container and prose stays near 65 characters.
  This is measured practice: Stripe Atlas pins content to 1080px and owns a 1600px
  viewport through edge-to-edge alternating bands; tyver.io uses a wider 1440px container
  with no bands and reads as a single floating sheet. Widening paragraphs is not the
  answer to a wide display — banding is. `ui/Section.tsx` exists for exactly this and is
  the only place a full-bleed background is declared.
- **Every surface is responsive, and that includes the wide end.** Breakpoints
  `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536. A page must be checked at
  390 / 768 / 1280 / 1920 / 2560 before it ships. A layout that only exists at one width
  is unfinished.
- **Navigation must survive every width.** There is no width at which the nav simply
  disappears; below `sm` it becomes a disclosure panel, not nothing.
- The spec-sheet grid — a `168px` label gutter plus a fluid content column — is the
  default for **wide** settings and documentation-like screens. Two kinds of form stack the
  label above the field instead: panels narrower than ~520px (the auth panels), and the
  **creative configurator**, which renders fields from a template's `config_schema` —
  label lengths are authored per template, so a fixed gutter would clip a long one or
  strand a short one.
- Sections are separated by a hairline or by a change of surface, not by empty space alone.
- Lay out sibling groups with flex/grid `gap`, never per-element margins.
- Wide content (tables, tag URLs, code) scrolls inside its own `overflow-x: auto`
  container. **The page body never scrolls sideways.**

## 6. Components

### Brand lockup

The lockup is a **CS monogram** plus the wordmark, read as one object:

- **Monogram** (`ui/BrandMark.tsx`) — an open accent `C` whose counter holds a play
  triangle, then an `S`. One inline SVG, 28px tall in the bar. Only the `C` is warm; the
  triangle and the `S` are `fg`.
- **Wordmark** — `Creo` in `accent`, `Smith` in `fg`. The colour split is the same split
  as the glyph, which is the whole point: `C`↔`Creo`, `S`↔`Smith`. The two halves explain
  each other, so the word is not a caption under a logo.

Constraints that bind any future revision:

- **Flat, and this was tested.** The source reference is a bevelled 3D render. Depth was
  tried on the real bar at real size — a soft `drop-shadow` and a hard offset extrude —
  and both lost: at 28px a blur turns a two-colour glyph to mud, and an offset copy reads
  as a rendering fault. **Do not re-litigate this without a render at 28px.**
- **The `S` takes `fg`, not the reference's cold slate.** §3's warm ramp rules a cold grey
  out next to the accent. Every colour is a token.
- **The accent here is chrome, not action** — §3 exempts the lockup from the budget and
  stops there. The same shapes below the top bar would count.
- **28px is a floor, not a default.** Below it the play triangle silts up inside the
  counter; a smaller surface takes the `C` alone, never a shrunken lockup.

The `C`'s radial terminals and the `S`'s flat ones both fall out of butt-capped arcs
rather than hand-drawn outlines, and the `S`'s bowls are elliptical (rx 12.5, ry 9.5)
because circular ones read narrow beside the `C`. The geometry is derived in the
component's header comment; reuse it rather than redrawing.

The glyph is `aria-hidden` — the wordmark next to it is the accessible name, and labelling
both would announce the brand twice. The strings are split in the dictionary
(`brand.nameLead` / `brand.nameTail`), not sliced in the component: §9 admits no exception
for short literals.

### Brand stage — the large mark

`ui/BrandStage.tsx` is the landing page's opening object: the monogram on an ambient
halo, above the headline. It steps **128px → 176px at `sm` → 300px at `lg`** — three
sizes rather than two, because a 300px mark that drops straight to 128px leaves the
tablet range with either a cramped stage or a hero the headline never clears.

- **It is a stage, not a decoration.** Its geometry is fixed so that interactive mechanics
  can later replace its contents without moving anything around it. Do not re-tune its
  height to fill a gap elsewhere.
- Ambient motion only — a slow halo rotation and a soft pulse on the play triangle, both
  disabled under `prefers-reduced-motion` (§7).
- It reuses `BrandMark`'s geometry. A second drawing of the same glyph is a defect.
- **One per page, on `/` only.** The mark elsewhere is the 28px bar lockup.

### Data tables — the default for lists

Lists of creatives and subscriptions are **tables with a state rail**, not a grid of cards.
This covers every list inside the dashboard, including pickers over the user's own rows.
The catalog is the single exception, specified below.

- 3px left border on the first cell, coloured by the semantic state, with `padding-left`
  cut to 13px so rail plus padding still sum to the 16px cell inset. This is what makes a
  problem visible in peripheral vision at thirty rows.
- **A row without a real state gets no rail.** A decorative rail — one hardcoded tone on
  every row — teaches the reader that the rail means nothing.
- Header cells use the mono uppercase `label` style.
- The row is never filled with semantic colour — the rail plus the state word already
  carry the meaning, and a filled row turns the list into a traffic light.
- Status appears as `dot + mono uppercase word`. Reserve the pill/badge form for places
  where the word itself is the payload.
- Numeric columns are mono with `tabular-nums`.

### Catalog tiles — the one grid

The template catalog (`/catalog`) is the only grid in the product, and it earns the
exception honestly: its rows carry no state. A published template is not serving, lapsing,
or failing — it is a thing you pick.

- Hairline-separated grid: `gap-px` on a `bg-hairline` container with `bg-surface` cells,
  or a `gap`-separated card grid at `--radius-card` on marketing surfaces. One column at
  base, two at `sm`, three at `lg`.
- Tile contents, in order: preview → name (h3) → description (`small`, `fg-secondary`,
  clamped to three lines) → format chips. Nothing else, and nothing else interactive: the
  whole tile is one link.
- Hover is `bg-surface-2`. No lift, no shadow. Focus is the standard 2px accent outline at
  2px offset.
- **Accent budget on the catalog index is zero.** Tiles are links, not actions.
- **No live creative inside a tile.** This is not a performance preference: the VPAID host
  is the global `window.getVPAIDAd`, so a second unit on the same page overwrites the
  first. A grid of live tiles is incorrect, not merely heavy. A tile carries a **static**
  preview — a poster or a muted looping capture. Live demos live one per page (§7).

### Buttons

| Variant | Appearance | Rule |
| --- | --- | --- |
| primary | `accent` fill, `accent-ink` label | **One per screen** (see the accent budget, §3) |
| secondary | transparent, `line` border | The default action button |
| ghost | transparent, `surface-2` on hover | Tertiary/cancel |
| danger | `dead` fill, `#2B1418` label | The confirm action inside a destructive confirmation dialog only — never a default list action, and never the trigger that opens the dialog |
| disabled | `surface-2` background, `fg-muted` label | Avoid; prefer an enabled control that explains itself |

Three sizes, and the size is a property of the surface:

| Size | Height | Label | Use |
| --- | --- | --- | --- |
| `sm` | 32px | 13/500 | Inside tables, toolbars, panels |
| `md` | 44px | 14.5/500 | Forms, dialogs, top bar — the default |
| `lg` | 52px | 15.5/500 | Marketing calls to action |

Radius `--radius-ctl`, 120–200ms transitions on **named properties**, never `all`.

**One implementation per repeated element**, not just for buttons: `ui/Button.tsx`
(`buttonClass()` in client components), `ui/Chip.tsx` for the chip role, `ui/State.tsx`
for state words and rails, `ui/Container.tsx` and `ui/Section.tsx` for page structure. A
hand-rolled control that lands at 24px, or a fifth copy of the chip that quietly ships at
weight 400, is how a system starts drifting.

### Destructive confirmation

An action that cannot be undone (deleting a creative) never fires from a single click. The
trigger is a plain `secondary` button, labelled — never coloured, since §3 forbids a status
colour used as decoration. It opens a centred dialog: `bg-ground/70` backdrop,
`shadow-overlay` panel at `--radius-panel`, a sans h2 naming the action, the affected
item's own name (sans, not mono — it is a label the user wrote, not a machine value), a
one-line consequence in `fg-muted`, then `ghost` **Cancel** and `danger` **confirm**, in
that order so the safe choice sits nearest the reading direction's start. `Escape` and a
backdrop click both cancel. Confirming submits a server action — no client-side fetch/JSON
round trip for a plain delete.

**Every overlay is portalled to `<body>` (`createPortal`), with one documented exception**
(below, "Nav dropdown" — narrow on purpose; read it before citing it as precedent).
`position: fixed` removes an element from layout flow but leaves it in the DOM tree, so an
overlay opened from inside a table cell stays that cell's descendant and keeps inheriting
from it. The delete dialog shipped this way and inherited `white-space: nowrap` from its
row's `<td>`: the body copy rendered as one 880px line inside a 384px card and spilled
across the table. `break-words` cannot override `nowrap`, and no amount of width capping
helps, because the overflow is the text, not the box. Portalling is also what keeps `fixed`
anchored to the viewport should any ancestor ever gain a `transform`, `filter`, or
`contain` — each of which silently makes itself the containing block instead.

**Test an overlay in the context it actually opens from**, never in isolation: rendered
standalone this dialog computed `white-space: normal` and looked perfect, which is exactly
how the bug survived a round of "verified locally".

### Nav dropdown

The Tools entry in the top bar ([ADR-0013](decisions/0013-public-free-tools-section.md)) is
a disclosure button, not a link: it opens a panel listing the two free tools directly.
There is no `/tools` index page.

- `aria-expanded` + `aria-controls` on the trigger, a plain panel of real `Link`s under it
  — the two-item disclosure pattern, not a full ARIA `menu` role (which would promise
  arrow-key navigation this component does not implement).
- Panel: `border border-hairline`, `--radius-panel`, `bg-surface`, the `shadow-overlay`
  token, `divide-y divide-hairline` between items. Each item carries the tool's name, its
  `StateWord`, and its one-line description, read from `lib/tools.ts`'s `freeTools()` — the
  one place that list is assembled.
- Round the first and last item's own corners; the panel itself is never `overflow-hidden`,
  for the same reason a segmented control isn't (§2's 2px-offset focus ring).
- **Not portalled** — the system's one documented exception, and it is *not* a blanket
  carve-out for `position: absolute`. The portal rule guards two separate hazards and each
  has to be checked on its own terms:
  - **CSS inheritance** follows the DOM tree regardless of `position` — `absolute` inherits
    exactly as `fixed` does. The only honest defence is that the specific path from
    `<header>` down to this panel is verified free of anything inheritable that would leak
    in (no `overflow-hidden`, `white-space`, or `truncate` on any ancestor) — a claim about
    *this* DOM path today, not a property of `absolute`. Re-check it if this trigger is
    ever reused inside a different header.
  - **The viewport-anchor hazard** is specific to `position: fixed` and does not apply: the
    panel is `absolute` against a `relative` wrapper it owns one level up, so there is no
    viewport anchor to hijack. It also needs to scroll with the header, which `fixed` would
    get wrong regardless.

### Mobile navigation

Below `sm` the section links collapse into a disclosure panel behind a labelled trigger.
**They do not disappear.** The previous system hid them outright at 640px with no
replacement, which left a phone visitor with a brand mark and nothing to navigate with.

- The trigger is a 44px touch target carrying `aria-expanded` and `aria-controls`.
- The panel is a full-width sheet under the bar: `bg-surface`, hairline top and bottom,
  44px rows, the same links as the desktop nav plus the auth actions.
- `Escape` closes and returns focus to the trigger.
- An icon may accompany the trigger but never replaces its label (§10).

### Help tooltip

Explanation a fluent user does not need belongs *behind* a trigger, not in a paragraph
under the control. The VAST validator forced this: every setting carried two or three lines
of `fg-muted` prose, and the result was a form you had to read past rather than operate. An
expert tool earns the right to be terse — it does not earn the right to be unexplained.

`ui/Tooltip.tsx` exports `HelpLabel`, and it is the one implementation.

**The label is the trigger.** Not a `?` button beside the label — the label and the icon
are one `<button>`, rendering as `Tracking pixels ?`. This is settled, not open: a bare `?`
is an icon-only control, §10 forbids those without qualification, and
[ADR-0007](decisions/0007-design-system-instrument.md) records four iterations of carving
an exception out of that rule — three of them narrowing the exception instead of
questioning it — before retracting it entirely. Making the word the trigger needs no
exception: the word is visible, it *is* the accessible name, and it produces a touch target
the size of the label rather than of a 14px glyph.

It attaches to **any visible label that names something** — a field's `label-instr`, a table
column header, a section heading — and never floats free of one.

- **It opens on hover, on keyboard focus, and on click** — all three, never hover alone.
  Hover does not exist on a touch device, and once the inline paragraph is gone the panel
  holds the only copy of that sentence. A pointer leaving the trigger closes it after a
  short grace period; a click pins it open until clicked again.
- Panel: `bg-surface`, `border border-hairline`, `--radius-panel`, `shadow-overlay`,
  `small` sans, `max-w-[44ch]`. Portalled to `<body>` per the overlay rule — it opens from
  inside table headers and grid cells, which is precisely the inheritance hazard that rule
  exists for.
- Association is `role="tooltip"` plus `aria-describedby`. Not `aria-expanded`, which
  describes an expandable widget; a tooltip is not one.
- `Escape` closes and returns focus to the trigger; an outside click closes.
- It holds explanation only: never a control, never an error, never a value to copy.
  Nothing the user must act on may live behind a hover.

### Readout density

44px stays the default, and stays mandatory wherever a row represents **a thing the user
owns** — a creative, a template, a subscription. A second, narrower density exists for
**machine readouts**: tables whose rows the system emits rather than the user authors, and
which are read as a stream rather than acted on. The validator's run timeline, feature
matrix, wrapper chain and parser-versus-player comparison are the entire list today.

- Row height **32px** — `px-3 py-1.5` on `data` 13/20 type, which the cell class sets
  itself rather than leaving to each call site. The rail stays 3px, so the left padding
  drops to 9px exactly as the 44px cell's drops to 13px. Header row is 28px.
- **No row in this density carries a row-level action.** A row you can act on is not a
  readout and takes 44px. That is what stops the density becoming a way to cram, and it is
  why the validator's findings list — whose rows expand — is *not* in it.
- The density is a property of the table, not of a cell: a table is entirely one or
  entirely the other.
- 32px is the height of a single-line row, not a promise. A cell that stacks a value over a
  qualifier is taller, and that is correct.
- That list of four tables is illustrative, not exhaustive: the distinction — system-emitted
  and scanned, versus user-owned and acted on — decides every case.

The justification is legibility of the whole, not fitting more in. A sixty-row event
timeline at 44px is 2,640px of scrolling, and the reader loses the shape of the run — which
is the only thing a timeline is for.

### Segmented controls

Language, delivery format, player backend, and the landing hero's template switcher all use
the same shape: mono `chip` type, 1px `line` border, `surface-2` on the current segment,
hairline dividers between segments. The wrapper must **not** clip overflow — a focus outline
drawn at 2px offset inside an `overflow-hidden` box is invisible. Round the first and last
segment instead.

### Landing hero — one well, switched by tabs

The landing page (`/`) leads with the brand stage, then the headline and pitch, then a
segmented template switcher above a single **demo well** (§7), then the primary CTA.

- Exactly one VPAID unit is mounted at any moment: switching tabs unmounts the previous
  one before mounting the next. Two units would fight over the single `window.getVPAIDAd`
  global. A grid of simultaneously-live tiles is still forbidden.
- Every published template with a working demo unit gets a tab, derived the same way as
  `/catalog/[slug]` (`lib/template-demo.ts`) — the switcher is not a hand-maintained
  fixture list. A template with no resolvable demo unit is left out rather than shown broken.
- **Exception to the placeholder-imagery rule:** this is the highest-visibility surface in
  the product, so `image`-typed fields here render a photo (a seeded, deterministic
  third-party image service), not the `public/demo/` SVGs. The image source is out-of-repo
  and therefore a real, accepted dependency: if it is unreachable the affected background
  simply doesn't load; nothing else on the page depends on it.
- **Same exception on `/catalog/[slug]`**, which runs the identical demo unit built the
  same way. The catalog **grid** is unaffected: its tiles render static previews.

### Free tools — the public utility surface

`/tools/vast-validator` and `/tools/vast-generator` are public, unauthenticated pages that
exist to be found by someone with a broken ad tag
([ADR-0013](decisions/0013-public-free-tools-section.md)). They are held to the same system
as the dashboard, with two points worth stating because the temptation to relax them is
highest on a marketing-adjacent surface.

- **One well, same as anywhere.** The validator plays a real ad, so it gets the serving
  well (§7) and the page gets no second one.
- **Accent budget is one**, spent on the single primary that starts a run. A tool page is a
  workbench: everything else on it is secondary or a link.
- **One click starts a run.** The page has a single verb. Analysis and playback are two
  mechanisms, not two steps the visitor performs.

The validator's top row is two columns from `lg` up and one below it: the well on the left,
the settings and the verdict strip on the right. **Everything below that row is full width**,
stacked — the run timeline, then the recommendations. Two columns were tried there and
withdrawn: the timeline is a four-column table carrying URLs, and in half a page it could
not fit its own tracker column and grew a horizontal scrollbar. A run log you have to scroll
sideways to read is not a log.

Reference tables sit at the bottom as collapsed `<details>`, because they answer a follow-up
rather than the question the visitor arrived with. A report that runs as one 4,000px column
is not thorough, only tall.

Rows take a state rail where they carry state and none where they do not. The
recommendations list rails on severity (`dead` / `warn` / `info`) **and is grouped by it**,
so severity is legible from the shape of the page rather than only from a word. The
wrapper-chain table rails on HTTP outcome, dropping to transparent when the status is
unknown; the feature matrix does **not** rail, because "this tag does not use Mezzanine" is
an absence, not a state.

**There is exactly one findings list.** An earlier version shipped a per-rule "Findings"
table *and* a curated "Recommendations" list beneath it, saying the same things twice at two
altitudes; a reader who notices that once learns to skim both.

The run timeline carries the tracking URL each event would fire, in its own column. The join
is by event name, not by observation — no player reports which URL it actually requested —
and the column's tooltip says so. A tool that presents an inference as a measurement is
worse than one that omits it.

The pasted-XML input is the one place the mono rule is load-bearing rather than aesthetic:
it holds a VAST document, and a proportional face makes indentation unreadable.

### Configurator sections and the outcome matrix

A template's `config_schema` can group its fields
([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)), and a group renders one
of two ways.

**Section** (the default) — a `<fieldset>` whose legend is the `h3` role, separated by
`border-t border-hairline`. Deliberately not `label-instr`: that role belongs to the field
labels *inside* the section, and reusing it flattens the two levels into one. **Every
section takes the rule, including the first.** The legend needs `float-left w-full`, or the
fieldset's border-notch algorithm cuts a gap in the rule around the heading.

**Matrix** — for a group whose blocks are variants of one thing, such as the quiz's eight
answer-path exits. Rendering 24 inputs flat is the wall this exists to avoid.

- It carries the **data-table row treatment** — 44px rows, a 3px semantic rail — not a card
  grid and not an ad-hoc accordion. The markup is a disclosure list rather than a real
  `<table>`, which is the right choice for expandable rows; take the treatment, not the
  element.
- The rail carries a **real** state — configured (`live`) or empty (`idle`) — never a
  decorative one. Not `dead`: an unfinished row is incomplete, not an alarm.
- The row's label is machine text (the answer path, `A → A → B`) in mono, so it is identical
  in both locales and needs no dictionary entry (§9).
- **One block open at a time**, marked with `bg-surface-2` so the row merges into the panel
  it opens. **Accent budget spent: zero** — the page's single warm element stays the submit
  button.
- The container must not be `overflow-hidden`, or the 2px-offset focus ring on a row is
  clipped away. Round the first and last row instead.
- A chevron may accompany the row, `aria-hidden`, because the row's accessible name is the
  path itself — an icon is never the whole action (§10).
- A completion counter (`ЗАПОЛНЕНО N / 8`) sits below in `label-instr`, because closed rows
  submit through hidden inputs and so cannot use native `required`.

### Inputs

44px high (32px in a dense table context), 1px `line` border, `--radius-ctl`, **mono 13px**,
`bg-surface`. Placeholders are `fg-muted` (`fg-disabled` may not carry a word — §3). Help
text is `caption` in `fg-muted` below the field. Focus is a 2px accent outline with 2px
offset — every interactive element must have a visible focus state, including one whose real
`<input>` is `sr-only` behind a styled label.

### Metrics

Mono value at 26/1.2 weight 500 with `tabular-nums`, mono uppercase label above, `caption`
qualifier below. Grouped in a hairline-separated strip, not in cards. Inside a table cell a
metric drops to the `data` role; the strip form belongs to detail pages.

Counting rules, because a metric that lies costs more than a metric that is missing:

- Counts are integers, `tabular-nums`, thousand-grouped with
  `Intl.NumberFormat(LOCALE_TAG[locale])`. Grouping is the one concession a machine value
  makes to a human reader.
- **A zero is a real reading — print `0`.** An em dash means "not measurable", and the two
  must never be confused. Never hide a row because its counts are zero.
- **When the numbers are unmeasurable, the state rail has nothing to encode either.** Print
  the em dash *and* drop the rail to transparent — falling back to a neutral tone paints a
  claim ("idle") where there is only an absence.
- The delivery strip reads left to right in the order the events can occur:
  **impression → click**. It is a closed, sequential set — a metric conditional on something
  other than "did the aggregate load" does not belong in it, even if it is a count of the
  same shape. It used to be six; the five video-progress trackers were removed in
  [ADR-0016](decisions/0016-three-events-hourly-counters.md) because they cost a
  player-fired beacon each to reproduce numbers the buyer's own DSP already reports. The
  rule that survives is the shape, not the membership.
- **A metric that is structurally not applicable to this row is a third state, not the
  unmeasurable dash.** "Unmeasurable" is transient and page-wide — the aggregate failed to
  load, and every metric is affected identically. "Not applicable" is permanent and
  row-specific, by a property of the row itself (e.g. viewability for a SIMID creative:
  measured by the advertiser's OMID vendor, never ingested by us —
  [ADR-0012](decisions/0012-viewability-measurement.md)). Printing the same em dash in the
  same weight for both teaches the reader that a permanent absence and a temporary outage
  look identical. The "not applicable" reading prints the em dash in `text-fg-disabled` with
  a `caption` explanation beneath — the metric's own qualifier slot, not a page-level banner
  — naming what does measure it. A metric that can be N/A for some rows and a real reading
  for others does not belong inside the closed delivery-funnel strip: give it its own
  labelled strip.
- **No derived ratio without the counts it comes from**, and none at all where the underlying
  event is not ingested. Today the product records exactly three
  ([ADR-0016](decisions/0016-three-events-hourly-counters.md)): **impression**, **click**
  (fired only from the final call-to-action that opens the advertiser's URL — never from an
  intermediate interaction such as a quiz answer), and **viewable** (VPAID-only,
  self-reported). There is still no error event and no count of ad requests, so **error rate
  and fill rate may not appear on any screen**. CTR became derivable when click arrived and
  **is displayed, over impressions**. Two rules come with it:
  - **A derived ratio may close the delivery strip, never sit inside it.** The counts are a
    sequential set of things that happened; a ratio is a reading about them.
  - **Its qualifier names the denominator, always.** "of impressions", not a bare percentage.
    Impressions and viewable impressions give different numbers, and a buyer reading an
    unlabelled CTR will assume whichever is worse for us.

  With no impressions the ratio is genuinely not measurable, so it prints the em dash — the
  transient one, in `text-fg`. It is not `0%`, which would claim nobody clicked.

## 7. The player well

The creative preview is where a creative is judged, as in an editing suite. On a dark
product it is no longer "the one dark surface" — that phrase had meaning only against a
light page. **The well is now separated by elevation, not by darkness:** the section around
it lifts to `surface`, the well itself keeps `ground`, and a hairline draws the edge.

Darkening the well further is not an option and this was measured: pure black against
`ground` is **1.07:1**, and the previous system's well tone `#17150F` is **1.08:1**. Either
one simply disappears.

| Token | Hex | On `well` | Use |
| --- | --- | --- | --- |
| `--color-well` | `#0D0B0A` | — | The well itself |
| `--color-well-screen` | `#14100E` | — | The viewport rectangle inside it |
| `--color-well-line` | `#2C2621` | — | Hairlines and control edges inside the well |
| `--color-well-fg` | `#A79E92` | 7.43:1 | **All text in the well**, including secondary readouts |
| `--color-well-fg-dim` | `#6E665C` | 3.48:1 | **Non-text only** — hairlines, inactive glyphs, disabled marks |
| `--color-well-live` | `#63C79A` | 9.51:1 | Success indicators: "ad served", "click-through fired" |
| `--color-well-accent` | `#E9A57B` | 9.48:1 | The one warm marker inside the well — a progress indicator only |

`well-fg-dim` is below the 4.5:1 text threshold and below the 3:1 non-text threshold, so it
may not carry a word — least of all a countdown telling a buyer their preview tag is
expiring. Dim-looking text in the well is `well-fg`; `well-fg-dim` draws lines, not language.

There are two variants of the well, and the difference is whether an ad was actually
requested. **Exactly one well per page**; the catalog index has none.

**Serving well** — the configurator. A real VAST request happened, so an instrument strip
above the viewport carries what that request can prove: the delivery format (which *is* the
standard — `SIMID 1.1`, `VPAID 2.0` — one field, not two) on the left, and the server's
response time on the right once an ad has been served. Player status and the expiry
countdown sit below the viewport rather than in the strip, because they change during
playback while the strip states the fixed facts of the request.

A player may mark a status with a **tone**, which raises it out of that line into a
full-width `Notice` under the well; the line goes quiet meanwhile, so one sentence is never
in two places. The line is sized for three words, and a condition the viewer has to *act* on
is prose. The case this exists for is the IMA tab meeting an ad blocker: the SDK is a
third-party script from an ad-serving domain, and the notice has to say so plainly, name the
address to allow, and state that the creative is not the problem. It is `info`, not `dead` —
nothing about the account, the tag or the creative is failing, and red is the vocabulary a
buyer reads as "my ad is dead". The address rides along as the notice's mono `detail`: it is
a value to copy, not prose.

The validator raises the same notice under its own well, but reads the condition off its
**timeline** rather than from a status line, because that surface already records every stage
event and a second source for one fact could disagree with the first.

**Demo well** — the landing hero and the template detail page. The unit runs straight from
Storage with sample config; there is no ad request, no tag, and no latency, **so it gets no
instrument strip.** Fabricating a response time here is forbidden — it would be a number that
means nothing on the one screen a prospect trusts most.

The demo well has exactly **one caption slot** under the viewport, `well-fg` at the `caption`
size: it holds the placeholder disclosure until a click-through fires, and the click-through
readout afterwards (label in `well-live`, URL in mono `well-fg`). One slot, never two stacked
captions.

**A third-party player's chrome does not belong in the well.** The Fluid tab runs as an
ad-only outstream player — the `<video>` it wraps has no content — so its play button, scrub
bar and `00:00 / 00:00` readout drive a video that does not exist, and a timecode frozen at
zero under a running creative is a false readout, not merely clutter. The skin is ours rather
than the publisher's; no DSP ships it, so it is not part of what the tab proves. **The whole
control bar is hidden**, its gradient scrim along with it. Stated cost — the preview starts
muted and nothing in this tab can unmute it, so a template with a base video is judged
silently here. The rules live next to the component
(`components/players/fluid-preview.css`), not in the token file — vendor chrome is not a
design token. The creative's own close control
([ADR-0009](decisions/0009-mandatory-close-control.md)) is drawn inside the ad slot and is
untouched by any of this.

## 8. Creative templates are outside this system

**Everything under `runtime/templates/**` and `runtime/lib/vpaid-base.js` is exempt** from
this document's palette, type scale, radius scale, spacing scale, and depth rules. Decided in
[ADR-0022](decisions/0022-midnight-design-system.md).

A creative renders inside a publisher's page, in an advertiser's campaign, wearing the
**advertiser's** brand. Its colours come from the template's own `config_schema`
(`coverColor`, supplied imagery) and from whatever the campaign needs. Binding a creative to
CreoSmith's tokens would not merely be unnecessary — it would put our brand inside someone
else's ad.

This codifies existing practice rather than changing behaviour: the templates already carry
literal hex and reference no site token at all.

**What still binds a template:**

- the mandatory close control ([ADR-0009](decisions/0009-mandatory-close-control.md));
- the full VPAID lifecycle, and an `api.debug(name, data)` record for every state transition
  that has no VPAID event of its own;
- the [`creative-check`](../.claude/skills/creative-check/SKILL.md) gate — run in
  `/dev/harness` at four slot sizes, before and after the work;
- **legibility.** An advertiser may look like anything except unreadable: text keeps 4.5:1
  against what is actually behind it, and an interactive target stays at least 44px.

**The exemption is scoped to those files, not to arguments.** Nothing under `runtime/` is a
precedent for anything in `app/` or `components/`, and a literal hex there may never be cited
to justify one here.

## 9. Motion

Movement is slow and few. Nothing bounces, nothing springs.

- **Section reveal on scroll**: 16–24px upward translate plus a fade, 400–600ms,
  `cubic-bezier(.22, 1, .36, 1)`, staggered 60–80ms between siblings. Driven by
  `IntersectionObserver` through `ui/Reveal.tsx` — one implementation.
- **One well-orchestrated page load beats a scatter of micro-interactions.** This is the
  measured difference between the two reference sites: Stripe stages a hero and its
  transitions; tyver.io has no scroll motion at all and one `transition: 0.4s all` on
  everything.
- **Transitions name their properties.** `transition-colors`, `transition-opacity` —
  never `all`, and never longer than 200ms for a hover.
- **No animation library.** CSS plus `IntersectionObserver` covers the entire list; neither
  reference site ships GSAP or AOS either.
- **`prefers-reduced-motion: reduce` disables everything except colour changes.** A reveal
  under that setting renders in its final state — visible, not faded out.
- Motion never moves layout after first paint. A reveal animates `opacity` and `transform`
  only, so nothing reflows and nothing shifts under a reader's cursor.

## 10. Language and copy

- The UI ships in **Russian and English**. The switcher is a two-state segmented control in
  the top bar next to the account, mono 11px uppercase, labelled `RU` / `EN` — language
  codes, never flags (a flag denotes a country, not a language).
- The choice persists in a **cookie**, written server-side, so the landing page and the
  dashboard always agree within a browser. It is deliberately *not* on the user record yet:
  adding a `locale` column is a schema migration, and a display preference is not a good
  reason to put one inside a styling release. The consequence is small and stated: a
  different browser starts at the default locale.
- **Not everything visible is UI copy.** Template names and descriptions come from the
  `templates` table and stay as authored — and so do a template's **`config_schema` field
  labels, help text, and select-option labels**. They are the one place a Russian user sees
  English inside the dashboard chrome; a section *heading* is not, because groups are a closed
  set the product owns. So is the sample content inside a demo creative — stand-in advertiser
  material, not interface language. Technical status words the ad industry uses in English
  (`Live`, `SIMID 1.1`, `VPAID 2.0`) are left untranslated on purpose: translating them would
  make the dashboard harder to match against a DSP.
- **The public VAST endpoint is unaffected by language.** It has no session and no UI; no
  locale logic may be added to that path (see [architecture.md](architecture.md) and
  [security.md](security.md)).
- Every user-visible string goes through the i18n layer with both locales supplied. A
  hardcoded human-readable string in a component is a defect.
- **A developer-only surface is exempt from the bilingual requirement, and from nothing
  else.** The creative harness (`/dev/harness`) and the `/api/dev/*` routes under the same
  gate answer 404 unless the request came from the developer's own machine. The copy rules
  below still bind, and so does everything else in Midnight: tokens, the type split, the
  state-rail tables, one well, the accent budget. Scope is exactly "surfaces gated by
  `isLocalHeaders()`"; nothing reachable in production may cite it.
- **A domain dataset may carry its own bilingual payload instead**, provided a type makes both
  locales mandatory. The VAST validator's rule and feature catalogue (`lib/vast-inspect/`) is
  the case this exists for: roughly eighty rules, each keyed to an IAB spec clause. They are
  data about the specification, not interface language, and folding 240 strings into
  `dictionaries.ts` would bury the UI copy that file exists to police. The enforcement is the
  same one the dictionary relies on — `Msg` is `{ ru: string; en: string }`. UI chrome around
  such a dataset still goes through the dictionary.
- Copy rules: sentence case; a control names what happens ("Copy tag" → "Tag copied", never
  "Successfully copied!"); errors say what went wrong and what to do; no exclamation marks;
  no "please", "simply", "just".

## 11. Boundaries — what we do not do

| | |
| --- | --- |
| ✕ | The accent as a general brand colour on headings, icons, or rules. Warm = action; two appearances per product screen, three on `/` and `/catalog` (§3). |
| ✕ | A light theme, or any second theme. |
| ✕ | Shadows as a depth tool. Elevation plus a hairline; shadow is for detaching a floating overlay only. |
| ✕ | Warm red for errors. The alarm is cold `#EE8089`, or it stops being an alarm. |
| ✕ | Card grids where a table belongs. The catalog is the one grid, and only because a template has no state. |
| ✕ | A live creative running anywhere but a player well, or more than one live unit on a page. The VPAID host is a single global — the second unit overwrites the first. |
| ✕ | Derived-ratio metrics without the counts they come from. VTR and fill rate are barred outright — their events are not ingested. CTR is permitted since ADR-0016 made click a real count, but only with its denominator stated (§6). |
| ✕ | Raw Tailwind palette colours (`gray-200`, `green-100`, `blue-600`, …), or any literal hex, in `app/` or `components/`. Tokens only. §8 exempts `runtime/templates/**` and nothing else. |
| ✕ | Arbitrary type sizes (`text-[13px]`) on content. Roles from §4, as utilities. The one place a literal size is correct is **inside a shared primitive that defines a documented control size** — `ui/Button.tsx`'s three label sizes, the top bar's brand and nav sizes. A control's size is part of its specification (§6), not a call site's opinion; a page reaching for a literal size is the defect this bans. |
| ✕ | Rounded pills as a default shape. The radius scale in §2; `50%` only for the status dot. |
| ✕ | Hard `<br>` inside a heading. Use `text-wrap: balance`. |
| ✕ | Icon-only actions, no exceptions. Verbs label actions; an icon accompanies a word. Tried once as a data-table space-saving device and retracted: even a spec-correct 18px icon read as an indistinguishable speck once it had no word to lean on, confirmed twice from live screenshots and a DevTools inspection that ruled out a rendering bug — the icon was never the problem, having no label was. If a row's action cell is too narrow for labelled buttons, the fix is narrower *other* columns or a taller cell, not a smaller word. |
| ✕ | Flags for language. |
| ✕ | A layout that exists at one width. Every surface is checked at 390 / 768 / 1280 / 1920 / 2560. |
| ✕ | Motion that ignores `prefers-reduced-motion`, or a `transition` on `all`. |
| ✓ | Density as respect: 44px rows, spacing in multiples of 4 — and the 32px readout density (§6) for system-emitted tables that are read rather than acted on. |
| ✓ | State encoded in form as well as colour. |
| ✓ | Both locales supplied for every new string — except on a developer-only surface, which no user reaches in either language (§10, and that carve-out only). |
| ✓ | Full-bleed section colour with contained prose. That is what owns a wide monitor (§5). |

## 12. Implementation

- Tokens live as CSS custom properties in `app/globals.css` and are exposed to Tailwind
  through the `@theme` block. Components consume tokens, never literal hex.
- **One narrow carve-out, for images generated outside the browser.** `app/icon.tsx` and
  `app/opengraph-image.tsx` render through Satori, which has no CSSOM and therefore no
  custom properties — a token reference there resolves to nothing, silently. Those two
  routes read the palette from **`lib/brand-palette.ts`**, the single module the
  `@theme` block is kept in step with, and they may not hand-type a colour either. Scope
  is exactly "files whose default export returns an `ImageResponse`"; nothing rendered by
  a browser may cite it.
- Fonts are loaded with `next/font/google` (Prata, Onest, IBM Plex Mono) with Latin and
  Cyrillic subsets. Nothing may override `body`'s font stack.
- Page structure goes through `ui/Container.tsx` and `ui/Section.tsx`. A hand-typed
  `max-w-[…]` on a page shell is a defect — that is how the previous system ended up with
  one width literal re-typed in eight files.
- **Any new colour, radius, shadow, or type size is a change to this document first** — add
  the token here, then use it. That friction is what kept literal hex out of the components
  entirely, and it is the reason a whole-product repalette was a `@theme` edit rather than a
  sixty-file migration.
- **Contrast is computed, not judged.** Every ratio in §3 and §7 came from the WCAG formula
  against the stated background. When you add or change a colour, compute it — text ≥ 4.5:1,
  large text and non-text ≥ 3:1 — and write the number next to the token.

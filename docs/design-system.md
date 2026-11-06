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

We sell interactive ad creative. A prospect judges the product by how it looks before
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

  `50%` for the status dot, and for one shape that is a circle by nature rather than
  by styling: a drag handle drawn as a knob. Nothing else is rounded, and there are no pills.
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
  codebase. Two things follow. A strip of *static* cells may clip — the landing's steps and
  standards hold no link or button — and stops being allowed the moment a cell holds one.
  A row that runs edge to edge of its box has no outside to draw in, so it draws the ring
  **inside**, `outline-offset: -2px` — the `.focus-inset` class in `globals.css`, a plain
  class because a Tailwind utility sits in a layer and loses to the unlayered rule: the rows
  of the Tools and Account dropdowns and of the mobile sheet, whose box also scrolls (§6,
  "Mobile navigation").

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
`/catalog` are the whole list. The landing spends two of them today — the hero's action and
the closing one — and the third is headroom, not a target. It is a budget of three, not a suspension of the rule —
an accent on a heading, an icon, or a rule is still a defect on every surface.

**Persistent chrome is exempt from the count** on every surface: it is on every screen by
definition, and counting it would spend a slot before a page renders anything. The
exemption covers exactly three things:

- the **whole brand lockup, wherever chrome puts it** — the monogram's `C` and the
  wordmark's `Creo`, one identity in two pieces, not two spends. Today that is the top bar
  only: the footer carries no lockup ([ADR-0037](decisions/0037-reduced-navigation-and-copy.md));
  were one to return, it would be the same identity, not a second spend;
- the **active-section marker** (the underline on desktop, the coloured row in the mobile
  panel — the same marker in two layouts);
- the **single sign-up action for a signed-out visitor** — in the bar, or below `xs` in
  the mobile panel: one action in two layouts, never both visible, like the section marker
  above. There is one of it in the whole app, it is the product's only conversion action,
  and both reference sites this system was measured against fill theirs. A signed-in bar has no such button, so this costs
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
| idle / draft | `idle` `#A79E92` | 7.43:1 | `#1E1A17` | Not published, no activity, nothing filled in yet |

`dead` has one extra token, `--color-dead-hover` `#F4979E`, for the destructive
button alone — `dead-bg` on it measures 8.03:1. It is the accent’s `-hover` twin and
exists for the same reason: a button needs a hover state, and a state colour is not
allowed to acquire one by opacity.

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
| display-sm | 52/1.12 | 400 | Prata | `-0.022em`, the landing hero and the closing CTA; `clamp(2rem, 4.5vw, 3.25rem)`, so 32px on a phone |
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
  | `default` | `1200px` | Dashboard pages |
  | `wide` | `1440px` | Marketing sections with grids, the catalog, and the free tools — a well beside a form needs the width |
  | `full` | none (padding only) | A section that must reach both edges |

- **Colour owns the monitor, not text width.** Section backgrounds run **full-bleed**
  while the content inside them stays in a container and prose stays near 65 characters.
  This is measured practice: Stripe Atlas pins content to 1080px and owns a 1600px
  viewport through edge-to-edge alternating bands; tyver.io uses a wider 1440px container
  with no bands and reads as a single floating sheet. Widening paragraphs is not the
  answer to a wide display — banding is. `ui/Section.tsx` exists for exactly this and is
  the only place a full-bleed background is declared.
- **Every surface is responsive, and that includes the wide end.** Breakpoints
  `xs` 384 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536. `xs` is ours, a
  token in `app/globals.css`'s `@theme`, and has one use: the top bar's sign-up placement
  (§6, "Mobile navigation"). A page must be checked at 360 / 390 / 768 / 1280 / 1920 /
  2560 before it ships — 360 because a phone that narrow is common and `xs` changes the
  bar below 384. The list says nothing about height, so the mobile sheet is also opened
  at 740×360, a phone on its side. A layout that only exists at one width is unfinished.
- **Navigation must survive every width.** There is no width at which the nav simply
  disappears; below `lg` it becomes a disclosure panel, not nothing.
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
  each other, so the word is not a caption under a logo. The pair is one component,
  `ui/BrandLockup`, shared by the product bar and the tools' bar; the wordmark's 16px/600 is a
  literal because it is the brand's size, allowed only inside that primitive (§11).

Constraints that bind any future revision:

- **Flat, and this was tested.** The source reference is a bevelled 3D render. Depth was
  tried on the real bar at real size — a soft `drop-shadow` and a hard offset extrude —
  and both lost: at 28px a blur turns a two-colour glyph to mud, and an offset copy reads
  as a rendering fault. **Do not re-litigate this without a render at 28px.**
- **The `S` takes `fg`, not the reference's cold slate.** §3's warm ramp rules a cold grey
  out next to the accent. Every colour is a token.
- **The accent here is chrome, not action** — §3 exempts the lockup from the budget and
  stops there. The same shapes below the top bar would count.
- **28px is a floor, not a default.** A smaller surface takes the `C` alone, never a
  shrunken lockup. What binds the floor is now the gap between the letters rather than
  the triangle: the two overlap horizontally, so their gap is ~1.1px at 28px tall and the
  `C`’s open side starts reading as one shape with the `S` at around 24px. The floor keeps
  a step of margin over that measured failure point rather than sitting on it.
  `app/icon.tsx` is the surface the rule was written for.
- **The favicon sits on a round `ground` plate.** `app/icon.tsx` fills a circle rather
  than the frame, so the corners of the PNG stay transparent and nothing reads as a black
  box on a light tab strip. The plate is not decoration — it is what makes the background
  known to be `ground` again, and so what lets the icon keep the colour split and the
  contrast that goes with it (accent 9.48:1, `fg` 16.86:1). Both alternatives were
  rendered at 16px and rejected on the evidence: a square plate is the black box, and bare
  transparency loses the triangle, because `fg` is near-white and near-white on nothing
  disappears against Chrome's ~#dee1e6 strip — apricot straight onto it measures 1.59:1.
  The mark is inset inside the plate, not fitted to it: the `C` is a ring, and a ring
  touching the edge of a disc reads as a smudge at 16px.

**The glyph is three filled outlines, not stroked arcs.** Strokes were how it used to be
drawn, and they cannot express two things the reference does: the `C`’s terminals are cut
by a *concave arc* where a butt cap can only cut radially, and the `S`’s stroke varies in
width. Nothing in the glyph carries `stroke` or `strokeWidth`, so its weight no longer
moves with the viewBox.

The geometry is **measured, not drawn**: the reference render is separated into colour
masks, traced with marching squares and fitted, landing on the reference at IoU
0.992 / 0.991 / 0.994 (`C` / triangle / `S`) with nothing off by more than 3px on a
1453px body. Three things worth knowing before touching it:

- The `C` is a true circle — ~23.85 outer, ~15.76 inner, a stem of 8.09 and a 103° gap —
  while the `S` has no single outer/inner radius pair the way the `C` does: its two bowls
  take unequal radii, and its stem is ~7.2, thinner than the `C`’s. That asymmetry is the
  reference’s, not a defect to “correct”. (“Stem” here is the letterform sense — the SVG
  `stroke` attribute is gone from the glyph entirely.)
- The letters **overlap**: the `C` ends at x 38.7 and the `S` begins at 36.5. That
  interlock is why the viewBox is `0 0 68.335 48` rather than the 81.5 of the version that
  held them apart, and why the bar lockup is 40px wide at 28px tall.
- **The fitter is chosen per shape, and that is what keeps the curves clean.** A fitter
  that subdivides until it meets a tolerance has to reproduce the reference render’s own
  wobble, which at hero size reads as a lumpy edge. So the `C` and the triangle are arc
  splines — lines and circular arcs, which cannot ripple because their curvature is
  constant by construction, and which keep a straight edge exactly straight. The `S` is
  neither a circle nor a polygon, so it takes cubic Béziers on a **fixed segment budget**,
  raised only until the fit is in tolerance. Do not tighten that tolerance: the reference’s
  `S` wanders from any clean construction by up to ~10px, and tracking it faithfully is
  what produced the lumpy counter this replaced.

The derivation is in the component’s header comment; reuse the exported geometry rather
than redrawing it. The **colour** split, unlike the geometry, is necessarily restated in
each consumer — Tailwind classes in the two browser components, `fill` attributes in the
two Satori routes, because Satori has no CSSOM (§12). That is the one part of the mark
that can drift; keep the four in step.

The glyph is `aria-hidden` — the wordmark next to it is the accessible name, and labelling
both would announce the brand twice. The strings are split in the dictionary
(`brand.nameLead` / `brand.nameTail`), not sliced in the component: §9 admits no exception
for short literals.

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
- **Row actions are `sm` secondary buttons with words.** When a row carries three of them
  (the creatives list: Edit, Duplicate, Delete), they drop their icons rather than their
  words: with icons, at the 1200px container, the name column is left about 120px in
  Russian.
- **Size columns to their content, not to pixels.** Every column but the one that wraps
  (the name) is `w-px whitespace-nowrap`, and that one takes what is left. Widths pinned
  in a colgroup from an estimate broke in production the first time the real font
  measured wider: the actions overran their column and the table scrolled at full
  width. A content-sized column cannot drift that way; it only needs content that keeps
  one width across states, as the copy button's stacked labels do.

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
- **The landing page's gallery is the teaser form** (`CatalogGrid compact`): preview and name,
  two across at `sm` and four at `lg`. The description and the chips are what the catalog is
  for — comparing templates — and on the landing seven identical chips told nothing
  ([ADR-0037](decisions/0037-reduced-navigation-and-copy.md)).
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

`ui/ConfirmAction.tsx` is the one implementation. It was extracted when the second
irreversible action arrived — rotating the postback key, which breaks every network still
holding the old URL ([ADR-0023](decisions/0023-conversion-postbacks.md)) — and delete is
now a thin wrapper around it. The affected item's name is optional, since a key has none.
The heading is an `<h2>` element in the `h3` role — a heading of the page the dialog opens
over, set at card size. It is a modal and behaves like one: focus starts on Cancel, Tab
and Shift+Tab stay inside the card, Escape closes wherever focus is (the handler is on the
document, not the backdrop), the consequence line is the dialog's `aria-describedby`, and
closing returns focus to the trigger — unless the action removed it, as a delete does.
Its children are spaced with `gap`, like every sibling group (§5).

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

Two entries in the top bar are disclosure buttons rather than links, both built on
`NavDropdown`: **Tools** ([ADR-0013](decisions/0013-public-free-tools-section.md)), which
lists the two free tools directly — there is no `/tools` index page — and **Account**
(below).

- `aria-expanded` + `aria-controls` on the trigger, a plain panel of real `Link`s under it
  — the two-item disclosure pattern, not a full ARIA `menu` role (which would promise
  arrow-key navigation this component does not implement).
- Panel: `border border-hairline`, `--radius-panel`, `bg-surface`, the `shadow-overlay`
  token, `divide-y divide-hairline` between items. A tool is its name and nothing else: both
  are available, so a `StateWord` says nothing, and the name needs no sentence under it
  ([ADR-0037](decisions/0037-reduced-navigation-and-copy.md)). The list is assembled in
  `lib/tools.ts`'s `freeTools()`.
- Round the first and last item's own corners; the panel itself is never `overflow-hidden`,
  for the same reason a segmented control isn't (§2's 2px-offset focus ring). Rows run
  edge to edge of the panel, so they draw that ring inside (`-2px`). The link rows of the
  Tools and Account menus are alike — 44px, `px-5`, `type-small`, `fg`, the normal weight —
  so the two panels read as one list.
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
  - **Where the check fails** — a row of a table, whose scroll frame would clip the panel — the panel
    is portalled (`portal`, §6, "Workspace"): fixed at the trigger's place when it opens (above the
    trigger when it is in the lower half of the screen), measured against the viewport without its
    scrollbars. It is then at the end of `<body>`, outside the page's tab order, so opening it moves
    focus to its first item; Escape, or Tab off either end, closes it and returns focus to the button.
    Choosing in a menu of options (`closeOnClick`) returns focus to the button too, since the row that
    was chosen has gone. A dialog opened from a row of the panel hands focus back to the button when it
    closes, because the row is hidden (`NavDropdownContext`).

### Account menu

The signed-in viewer's account is one disclosure at the right of the bar — **Account** —
instead of an address, a language control and a *Sign out* button side by side
([ADR-0037](decisions/0037-reduced-navigation-and-copy.md)). The trigger is a `ghost` `md`
button with a chevron and a word; it never takes the accent.

- **Rows, top to bottom:** the address (mono — it is an identifier) with the access state
  under it as a `StateWord`, `live` *Access granted* or `idle` *No access* and, only in the
  second case and never for the admin, who is the one who answers it, a link to the
  Telegram chat; *Postback*; for an admin, *Accounts*; *Language* — a `label-instr`, as in
  the signed-out panel, because it names a control — with the `RU | EN` control; *Sign out*,
  the quiet row (`fg-secondary`, `fg` on hover). Nothing else. The state is a fact, not a
  page, which is why there is no Access page. *No access* is a word here and an empty cell
  in the admin's list (below): a table shows an absence by leaving the cell out, where a
  menu line has nothing to leave out.
- **No current marker.** The trigger takes neither the accent nor the underline. *Postback*
  sits under Creatives' route prefix, which carries the marker; `/dashboard/admin` is
  reached from this menu and has no section of its own.
- The panel is `NavDropdown`'s, right-aligned: the same border, radius, `shadow-overlay` and
  44px rows, and the same exemption from the portal rule — the DOM path from `<header>` to it
  is the Tools panel's, re-checked.
- **A signed-out visitor has no such menu**: the bar keeps the `RU | EN` control, *Sign in*
  and the one sign-up action (§3).
- Below `lg` the same rows sit in the mobile panel (next).

### Mobile navigation

Below `lg` the section links collapse into a disclosure panel behind a labelled trigger.
**They do not disappear.** The previous system hid them outright at 640px with no
replacement, which left a phone visitor with a brand mark and nothing to navigate with.

**Why `lg`, measured** (2026-11-03, labels that never wrap — `navItemClass` is
`whitespace-nowrap`): the full bar needs 768px signed out and, before ADR-0037, 832px signed in, in Russian,
the longer locale; collapsing at `sm`, as the bar once did, overlapped the language
control and the Tools trigger from 640 to 768 and wrapped «Мои креативы» onto two lines.
`lg` is the first standard breakpoint above both. Since ADR-0037 a signed-in bar holds
Creatives, Tools and Account only — the address, the language control and *Sign out* are rows
of the Account menu — so it is shorter than the 832px measured then, and `lg` stays: the
signed-out bar's 768px is unchanged.

- The trigger is a 44px touch target carrying `aria-expanded` and `aria-controls`.
- The panel is a full-width sheet under the bar: `bg-surface`, hairline top and bottom,
  44px rows, the same links as the desktop nav plus the auth actions.
- `Escape` closes and returns focus to the trigger.
- A signed-in viewer's panel ends with the account rows (above), the language control among
  them; the panel's own language row is for the signed-out visitor only.
- **The sheet scrolls inside itself.** It is capped at what is left of the viewport under
  the bar — `max-height: calc(100dvh − 100%)`, `100%` being the sticky bar it hangs from —
  with `overscroll-contain`. It has to be: the bar is sticky, so nothing below the fold of a
  short viewport can be scrolled to, and a signed-in sheet is 385–430px tall, taller than a
  phone on its side (740×360, measured 2026-11-06: the admin's *Sign out* ended 124px below
  the screen). A scrolling box clips a ring drawn outside it, so the account rows, which run
  edge to edge, draw theirs inside (§2); the section links keep the 2px offset, since their
  gutter is room enough.
- An icon may accompany the trigger but never replaces its label (§10).
- **What the bar keeps.** Below `lg` the bar carries the lockup, a signed-out visitor's
  sign-up action and the trigger; sign-in, the language control and the account move into
  the panel. **Below `xs` — the 360 and 375 phones — the sign-up action moves into the
  panel too**: the English label met the wordmark by 4px at 375 and by 19px at 360,
  measured with overlay scrollbars as on a phone. The panel shows it only where the bar
  dropped it (`max-xs:hidden` in the bar, `xs:hidden` in the panel — one token, so the
  pair cannot drift), so each action has one placement at any width. The lockup itself
  never shrinks to the monogram: it is one object ("Brand lockup").
- **Accepted, and to re-measure on any label change:** in English the bar runs tighter
  than its declared 16px between the lockup and the actions from `xs` to about 395px — 5px
  at 384, 11px at 390 — rather than send the sign-up action into the panel on the 390/393
  phones most visitors carry. Nothing touches; Russian clears by 32px or more. A longer
  label breaks this, and then `xs` moves, not the label's box.

### Access notice — the closed-beta notice

One notice at the top of **Creatives**, for a signed-in account that has no access
([ADR-0034](decisions/0034-closed-beta-manual-entitlement.md),
[ADR-0037](decisions/0037-reduced-navigation-and-copy.md)): *No access: tags do not serve
interactive ads*, and a link to the Telegram chat. `AccessNotice` is a `Notice` of tone `info`
with the link in its `action` slot — not a second box that copies it. It replaced a strip that hung
under the top bar on every page: a visitor who had decided nothing read it first on every
page, and an account without access read it on pages that had nothing to do with it. A
signed-out visitor now learns about the closed beta from the landing's note, and the account
menu carries the state.

- **Tone `info`, and only `info`.** The notice informs; it is not an action, so it never wears
  the accent, and it is not an alarm, so it is not `dead`. Tint `info-bg` with `info` text —
  7.63:1 — in a `--radius-panel` block. The link is underlined (`underline-offset-4`) and
  hovers to `fg`, 14.54:1 on the tint.
- **One sentence and one link**, in that order, as separate flex items so a 390px wrap
  happens between them and never inside the link. No icon, no second line of copy, and no
  dismiss control — there is no state to remember a dismissal with, and a notice that can be
  closed gets closed before it is read.
- The `Notice` block's own size: `type-small`, `py-2`, one line at 390px in English. It is
  page content, not chrome: not sticky, and it carries no accent to count.
- **Hidden for a participant and for the admin.** The sentence asks for something the first
  has and the second never needs. The page reads the viewer's own entitlement rows
  (owner-scoped under RLS).
The admin's accounts list (`/dashboard/admin`, the same ADR) is an ordinary state-rail
table: rail `live` for a participant, `info` for an account entitled by an external
subscription, none for an account with no access — and in that row the access cell is
the muted em dash, not a state word: in a table an absence is an empty cell (the account menu
says the same fact with an `idle` word, above). Its row
action is the `sm` secondary button the table rule prescribes — *Выдать доступ* /
*Отозвать* — and the email is mono, because an address is an identifier. *Отозвать*
goes through the destructive confirmation: a re-grant restores access, not the
impressions a running campaign lost while the tag served nothing. The dialog's subject
is the email, so mono — the one case where the subject is an identifier rather than a
user-written name.

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
which are read as a stream rather than acted on. Today that is the validator's run
timeline, feature matrix, wrapper chain and parser-versus-player comparison, and — since
[ADR-0023](decisions/0023-conversion-postbacks.md) — the postback log and the conversion
report's by-day table. The report's by-exit table is not: an exit is something the user
configured, so it keeps 44px. Nor is its by-goal table
([ADR-0027](decisions/0027-conversion-goals.md)): a goal comes from the network rather than
from the user, but it is a handful of rows read against the network's own report, not a
stream, so it keeps the default 44px beside the by-exit table. The creative page's VAST
errors table ([ADR-0033](decisions/0033-vast-error-statistics.md)) is the same case.

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
- That list is illustrative, not exhaustive: the distinction — system-emitted and read as a
  stream, versus user-owned or acted on — decides every case. Both halves count: a
  system-emitted table of a handful of summary rows is not a stream, and keeps 44px.

The justification is legibility of the whole, not fitting more in. A sixty-row event
timeline at 44px is 2,640px of scrolling, and the reader loses the shape of the run — which
is the only thing a timeline is for.

### Segmented controls

Language, delivery format, the landing hero's template switcher, the VAST
generator's version picker and its on/off switches for an optional section (skip, AdChoices,
OMID — the system has no checkbox, and a switch between two named states reads better than
one) all use the same shape: mono `chip` type, 1px `line` border, `surface-2` on the current segment,
hairline dividers between segments. The wrapper must **not** clip overflow — a focus outline
drawn at 2px offset inside an `overflow-hidden` box is invisible. Round the first and last
segment instead.

### Landing hero — one well, switched by tabs

The landing page (`/`) opens on one screen at 1280×720. From `lg` up the left column is the
headline (`display-sm`, §4), a one-line pitch, the primary CTA and, for a signed-out visitor, the closed-beta note; the
right column is a segmented template switcher above a single **demo well** (§7). Below `lg`
they stack in that order. There is no logo stage — the lockup in the bar is the brand, and
the first screen belongs to the offer and the proof
([ADR-0037](decisions/0037-reduced-navigation-and-copy.md)).

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
- **Below the hero the page says each thing once:** four step titles and an example tag; the
  template grid in its teaser form (preview and name — no description, no standards chip; the
  catalog is where templates are compared); the four standards by name beside the two free
  tools by name; one closing CTA; a footer of a copyright and three links. The page spends the
  accent twice in its content, on the two CTAs, plus the bar's sign-up action, which §3
  exempts.

### Free tools — the public utility surface

`/tools/vast-validator` and `/tools/vast-generator` are public pages that exist to be found
by someone with a broken ad tag, or one to make
([ADR-0013](decisions/0013-public-free-tools-section.md)); the generator asks for an account
only to save ([ADR-0036](decisions/0036-public-tool-that-saves.md)). They are held to the same system
as the dashboard, with two points worth stating because the temptation to relax them is
highest on a marketing-adjacent surface.

- **One well, same as anywhere.** The validator plays a real ad, so it gets the serving
  well (§7) and the page gets no second one.
- **Accent budget is one**, spent on the single primary that starts a run. A tool page is a
  workbench: everything else on it is secondary or a link.
- **One click starts a run.** The page has a single verb. Analysis and playback are two
  mechanisms, not two steps the visitor performs.
- **The bar is the tools' own** (`ToolBar`; [ADR-0038](decisions/0038-creative-workspace.md)): 48px,
  the lockup (`BrandLockup`, §6 — whole at every width), the **Validator | Generator** switch in the
  middle — two links, each tool its own address, the current one on `surface-2` and never the accent —
  and the visitor on the right: a signed-out visitor's `RU | EN` and *Sign in*, a signed-in one's
  *Creatives* and account menu (`AccountMenu`, `sm`). It stands where the product bar stood, as a
  creative's bar does on its own screens: the other tool is one click away, and so is the product (the
  lockup, *Creatives*). **Below `md` it re-stacks instead of squeezing**, as the workspace bar does: the
  lockup and the account (or *Sign in*) on a 48px row, then the switch with *Creatives* — or the language
  control — at the end of it. The switch is about 184px in either language and the two outer columns of a
  single row are 64px at 360, so one row there ran the switch under the account. The validator's bar stands
  in the page's `wide` column; the generator's, a workspace's, runs edge to edge like a creative's. The
  DOM path from the bar to the account's panel was checked for the nav dropdown's exemption (§6, "Nav
  dropdown"): a sticky header with a backdrop blur, a grid, a `contents` / flex cluster, the dropdown's
  root, and a panel that is `absolute` — no `overflow-hidden`, `white-space` or `truncate` between.

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

**The generator** ([ADR-0035](decisions/0035-vast-video-creatives.md),
[ADR-0036](decisions/0036-public-tool-that-saves.md)) keeps the validator's frame and changes
what sits in it, because its job is to make something rather than to judge it.

- **The generator is a workspace** (§6, "Workspace"): the tools' bar, an **outline** of the tag's
  sections at 216px, the **stage** — the well with *Check and play* under it, and a *Player | XML*
  switch for the tag's document — and a 340px **inspector** with one section's fields. At 1280×720 it is
  one screen where the form ran to 2.8. Below `lg` the outline is a row of chips, the stage comes
  first and the inspector follows; the section's explanation (the version's) leads its fields there,
  since the inspector's header is not drawn, and only the buttons stay at the foot of the screen — the
  notice and the sign-in note scroll with the section, because between them they took a quarter of a
  phone's height for good. The stage's content stops at the `default` width and is centred (§5): colour
  owns a wide monitor, not the measure of the text. Editing a video creative is this screen under a
  creative's own bar (§6, "Workspace"), with Settings | Stats.
- **The accent budget is one, spent on *Create creative*** — or *Sign in and create* for a
  signed-out visitor, the same button in the same place: the foot of the inspector, under the form's
  notice. *Check and play* is a secondary under the well: analysis and playback are still one click, but
  they are not the page's verb.
- **The sections** are the version, the basics, the video, the click-through, skip, tracking, companion
  banners, AdChoices, OMID and UniversalAdId, one at a time in the inspector. A section a version cannot
  carry is not in the outline; a caption under the version picker names what later versions add, and an
  `info` notice names what the draft holds that this version leaves out — `info`, because nothing is
  wrong. A section with an error in it carries a `dead` rail, a mark and the words *has errors* for
  assistive technology (colour is not the only channel, §11), and a save the browser can already refuse
  opens it with its first field focused; one the server refuses shows the rail and the notice and leaves
  the section as it is. Only such a section has a rail, since a rail on every row would teach the reader
  that the rail means nothing (§6).
- **The buyer's pixels are one list of rows**, each an event menu, a URL input and a
  `Remove` word, with `Add pixel` as an `sm` secondary under it. No rail: a pixel row has
  no state. The menu offers only the events the chosen version's XSD names. The rules a
  URL must meet — https, only the macros a player substitutes — are a visible caption,
  never a tooltip, and so is the three-banner cap; a row the current settings leave out
  says so under itself.
- **Our own trackers are stated, not configured**: one mono line of their element and event
  names, under a `HelpLabel` saying they are always in the tag and counted.
- **The XML is the stage's other view**, in a scrollable mono `<pre>` that takes keyboard focus,
  captioned as a preview whose tracking links are placeholders. The validator's recommendations follow
  under either view, when a check has run.
- **Media fields** are full width: `Choose file` and `Link` words when empty; a frame one second in,
  the file's name and a mono readout — type, size, duration, bitrate, megabytes — with `Replace` when
  filled; a linked file shows its URL in mono where an upload shows its name. The link state has a type
  menu and an `Apply` word beside the input, and Enter applies where blur does not — the check reads the
  file over the network, and a URL may carry no extension to take the type from. Signed out, the upload
  word becomes `Sign in to upload a file`, and does exactly that.
- **A verdict belongs to the document it ran on.** Once the form changes the document,
  the well returns to its idle screen, saying the tag changed since the check, and the
  verdict and recommendations leave with it.

### Workspace

A creative's own screens — Settings, Stats, a creative not yet created, and the VAST video generator,
new or editing — are a workspace rather than a page of the product: they take the whole viewport and
bring a bar of their own ([ADR-0038](decisions/0038-creative-workspace.md)). It is an exception to "page
shells go through `ui/Container`" (§5) and to the product bar being persistent: what these screens need
from a bar is the creative (or the tool), and the product is one click away behind *Creatives*. The list
pages — Creatives, the postback, the accounts — keep the product bar and the container
(`DashboardShell`).

- **The bar** (`WorkspaceBar`) is 48px with `sm` controls, in three clusters. Left: the way back
  (a `ghost` *Creatives* with a chevron — the only way out of the workspace, and so the only
  place the product's navigation is reached from), the creative's name, its format and, once it
  exists, its serving state. Middle: the **Settings | Stats** switch. Right: *More*, *Copy tag*
  and the screen's one primary — *Save* or *Create* on Settings, *Copy tag* on Stats. The name is
  a dense input on Settings (`inputDenseClass`: mono 13px at 32px, the height of the bar's `sm`
  controls — §4 makes every text input mono) and plain text on Stats and on the video editor
  (`type-small`, weight 500). A template that offers more than one delivery format shows them as a
  segmented choice beside the name; one format is a chip.
- **The name is the part that gives way.** From `lg` the left cluster gets what the switch and the
  actions leave: the name shrinks (to 224px at most) and the chip and the serving word never wrap. The
  switch is centred only from `xl`, where the outer columns are equal and each wide enough for its own
  contents; between `lg` and `xl` it follows the left cluster, because a centred 144px switch at 1024
  took room the name, the format and the serving state need, and they were drawn under it.
- **Below `lg` the bar re-stacks instead of squeezing**: the way back and *More* (and *Copy tag*
  where it is not the primary) on a row of at least 48px — it grows, and the buttons wrap, if Russian at
  360px does not fit them beside the way back — then the name with its chips, then the switch. The
  screen's primary moves to a full-width strip at the foot of the page: the button, 16px above and below
  it and a hairline, 77px (`sticky bottom-0`). One DOM for both: the name is a form field and cannot
  exist twice.
- **The tabs are links** (`CreativeTabs`), each its own address — `/dashboard/creatives/[id]/edit`
  and `/dashboard/creatives/[id]` — so the back button, a bookmark and a pasted URL all land where
  they should. Drawn as a segmented control (§6, "Segmented controls"): the current one on
  `surface-2`, never the accent.
- **Dimensions.** From `lg` the screen is the viewport high (`h-dvh`) and scrolls inside its parts,
  never as a page: outline 216px, inspector 340px, the stage the rest. They are the workspace's own
  measures and not tokens — no other screen has an outline. The outline and the inspector's chips are
  one component (`SectionNav`), used by Settings and by the generator.
- **More** (`NavDropdown`, §6, "Nav dropdown"): the actions that are not the screen's one action —
  check the tag in the validator, duplicate, delete (through the destructive confirmation, §6). Rows
  are plain text, 44px, never coloured. The panel closes on a click and hands focus back to *More*; it
  keeps its children mounted while closed, so a form row still submits after the panel has closed under
  its click, and the dialog's mousedown, which is "outside" the panel, does not take the dialog down.
  When the dialog closes, focus goes to *More* — the row that opened it is hidden. In a row of the
  Creatives list the panel is portalled, because the table's scroll frame would clip it: it opens
  above its button when the button is in the lower half of the screen (below it there is no room, and a
  panel that opens out of view can only be reached by scrolling, which closes it), takes focus on open,
  returns it on Escape or when Tab leaves either end of it, and closes if the page scrolls under it.

#### Settings

Left to right: the **outline**, the **stage**, the **inspector**. At 1280×720 a section is one
screen; the long form this replaced ran from one screen to six.

- **The outline** lists a template's sections: a schema group is a section, except that an
  `options` or a `matrix` group belongs to the group before it — Step Builder's step 1 is the title
  with its four options under it, the quiz's *Result* is the result screen with every path's exit.
  Rows of at least 44px, a 3px rail — `live` when every required field in the section has a value,
  `idle` when not, never `dead` (an unfinished section is incomplete, not an alarm) — the current one
  on `surface-2`. The rail is colour and colour is not the only channel (§11): a complete section
  carries a check at the right of its row, and every row says *complete* or *incomplete* to assistive
  technology. The text stands 16px in, the rail and its padding making the inset a table's cells have.
  The column scrolls by itself when a short window cannot hold every row. It appears only where a
  template has three sections or more and over eight active fields (Duel, the quiz, Step Builder, Pick &
  Message); six or eight fields are one inspector. Below `lg` it is a row of chips above the inspector —
  the same check, the same words — and a chip draws its focus ring inside, where the scroller's edge
  would cut it.
- **The stage** is the player well (§7) as large as the screen leaves it: the largest 16:9 screen that
  fits, taken from the well's own size (container query units) and centred. The player — Sandbox,
  Google IMA, Fluid Player — is chosen from a menu in the stage's corner. Below `lg` the screen takes
  the column's width, capped by the screen's height — 30% of it where the stage sticks, 70% where it
  does not — and the stage sticks to the top while the parameters scroll under it, **only where the
  screen is 600px high or more**: a phone on its side is 360px high, and a stage that stuck there would
  leave nothing to scroll the fields into. A field a keyboard focuses is kept out from under the stage
  and the strip by `scroll-padding` (`.stage-stick`, `.stage-screen`, `.workspace-strip`:
  `app/globals.css`). **The stage is outside the form.** The Sandbox player runs the creative in this
  document, a creative's own buttons carry no `type`, and a typeless button is a submit button to any
  form around it: inside the form, a click on the ad's call to action saved the creative.
- **The inspector** holds one section's fields in a 340px column under a 48px header that names it
  (below `lg` the chip is the name and the header stays a heading for assistive technology) and scrolls
  inside itself. A field is a mono label and a 44px control, 16px apart. Text and URL fields are inputs;
  a **required** select of up to three options whose labels together run to 26 characters is a segmented
  control — the 299px of the column hold about 28 characters of chip type, and a longer row wraps every
  button onto two lines — and any other select stays a select; a range is a slider with its value at the
  right of the label; a colour is a swatch beside its hex input; a picture or a clip is
  `MediaUploadField`, in its `row` form or, where fields sit side by side, its `stack` form. A field's
  `help` is behind its label (§6, "Help tooltip"), the click-through macros behind *{ } Macros* at the
  right of the label of a click field, and a required field is marked `*` and nothing else (§10). Accent
  budget of the inspector: zero — the one warm element is the bar's primary.
- **What posts.** Every active field posts under its own name, shown or not: the inspector shows one
  section and the rest ride along as hidden inputs. `visibleFieldNames` is the walk the Server Action
  makes, so what the form hides is what the action prunes. A save with a field the browser would refuse
  in a section the inspector is not showing — a required one empty, a URL that is not an address, a number
  outside its bounds — is stopped before it is sent: a hidden input is exempt from the browser's
  validation, and the server's redirect would throw away everything typed. The section opens, the field
  takes focus (an image field's first control) and a cold-red notice names it with where it is
  (`A → B · Heading`).

#### Inspector sections

A group renders one of four ways in the inspector
([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)).

- **Section** — the fields, stacked.
- **Options** — Step Builder's options per step ([ADR-0031](decisions/0031-step-builder-and-forwarded-picks.md)):
  one row per option. Its letter in a chip beside its label; its value beneath, when the template needs
  one; then its clips as 36px thumbnails, the column's name in `label-instr` above each — two across
  (each with its buttons under it, `stack`: a cell is about 125px), one where a step has one (the
  buttons beside it, `row`). The clips are variants of the option, not stages, so they are not numbered.
- **Scenario** — Duel's vote → win → after for each side ([ADR-0030](decisions/0030-duel-template.md)):
  one block per side, the letter and the name, then the clips across in play order, each a 44px thumbnail
  with its buttons under it — *Upload* above *URL*, as wide as the column, which is 94px: "Upload" and
  "URL" on one line need 133px, and a field that overflows its column pushes the inspector into a
  horizontal scrollbar. The order is the columns', so their captions carry no number.
- **Outcome matrix** — the quiz's answer-path exits ([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)),
  as a **drill-down**: the list of paths (44px rows, a 3px rail `live` or `idle` with a check and the words
  *complete* / *incomplete* behind it, the path in mono, the first text field's value muted, a chevron),
  then one path's fields with *All paths*, its place (`3 / 8`) and *Previous* / *Next*. Opening a path
  moves focus to its name, and *All paths* returns it to the row that was open — the button that was
  pressed is gone. The paths not open post through hidden inputs. `FILLED 3 / 8` under the list is the
  only progress signal. The list is not `overflow-hidden`; its rows round their own first and last corners
  (§2).

A **media field** in the inspector is a thumbnail and one or two quiet buttons: empty, an `sm` secondary
*Upload* and an `sm` ghost *URL* (one above the other, as wide as the cell, in a `stack`); URL entry, the input and a ghost word back to upload (the field turns
filled on blur or Enter, never on a keystroke); uploading, a spinner and the word, as a `status`; filled, a
frame one second into the clip (`#t=1` — the first frame is often a fade from black; `preload="metadata"`,
never autoplaying, since the page's one live unit stays in the stage, §7) or the picture, beside an `sm`
ghost *Replace*. A medium that will not render names its host in mono. Each state swaps whole controls, so
focus moves with it: to the URL input, back to the upload control, to *Replace* after an upload; the real
`<input type="file">` sits inside its label so the label's `has-[:focus-visible]` ring shows. A missing
required clip is reported as for every field: on save.

### Stats

A creative's Stats is the other half of its workspace, and one screen at 1280×720: the **delivery** strip
(impressions, clicks, CTR), **viewability** and **VAST errors** beside it; for a VAST video creative its
**progress** strip; the **conversions** strip; and two **expandable panels** side by side — errors by code,
conversions by exit — with the by-goal and by-day tables behind disclosures. The bar's primary is *Copy tag*,
always there; the way to the numbers is a click on a row of the list, and no scroll.

- Every reading follows §6, "Metrics": a dash for what cannot be read (never a zero), a muted dash for what
  structurally does not apply, the denominator named under a ratio. A caption is there only where the number
  alone would mislead — what CTR is *of*, what the conversions add up from, which revenue counts — and the
  explanation of why errors carry no rate is behind the label of their tile (§6, "Help tooltip").
- A section that could not be read says so in a notice under the strips, beside the section it concerns,
  and shows dashes; the rest of the screen is unaffected.
- The screen's content stands in the `wide` column (§5), not `default`: the three strips of the first row
  and the two panels beside each other need the 1440px. The bar runs edge to edge, as the workspace's does.
- The by-goal and by-day tables are native disclosures (`<details>`): they announce their state, need no script
  and carry the `summary` focus ring (§2). The panel is not `overflow-hidden`; the table scrolls in a frame of its
  own under the heading (§5).

### Metric strip

A hairline strip of readings (`StatStrip`): a label, one value line per currency, and what it is measured against.
It is the one implementation of the delivery, progress and conversions strips and of the single tiles beside the
delivery strip. A clipping parent is safe on it and only on it: every cell is a static readout, and the one
focusable thing a cell may hold is a tile's label as a help control (`HelpLabel`, §6) — its ring clears the
cell's 16px padding, which is the whole reason the clip is still safe. Put any other control in a cell and the
rounding moves to the cells.

### Expandable panel

A panel with a heading, a table and, when there are more rows than fit, *Show all* in its corner
(`ExpandablePanel`): the first three rows, the rest in place on a click, the button's own label saying it is
open (*Show less* — no `aria-expanded` besides, since both together read "Show less, expanded"). The rows are
server-rendered; the panel owns which of them show. Not `overflow-hidden` (the button's ring, §2); the table
scrolls in its own frame (§5).

### Disclosure

One collapsible panel (`ui/Disclosure`), native `<details>`: it needs no script, announces its state, and
`summary` carries the focus ring (§2). The chevron turns when it is open (§9), the summary takes a `surface-2`
hover, and nothing is `overflow-hidden`. Two shapes of the one element: `panel`, standing alone — a bordered box
titled in the label role, with an optional line of explanation above its content (a creative's by-goal and by-day
tables, the postback's parameters and statuses) — and `fold`, a row of a stack inside a panel that has its frame
already (the validator report's sections, a hairline between them, the title in `type-small`, weight 500).

### Creatives list

The Creatives page (`CreativesList`) is the list a returning owner opens the product for: the title with the
number of rows **shown**, a search by name (280px from `sm`), a filter by state (*All* / *Serving* /
*Not serving*, hidden while the aggregate is down) and the page's one primary, *New creative*. The rows are the
data-table treatment (§6, "Data tables"): 44px — the actions cell keeps 6px of vertical padding, which still clears
the focus ring's 4px, so three 32px buttons make a 44px row — a 3px rail for the serving state, the name, a format
chip, impressions, clicks, CTR (its header names the denominator, *of impressions*, under the label), the state,
and three actions with words — *Copy tag* (with its icon), *Edit*, *More* (with its chevron; the validator,
duplicate, delete). Search and filter are client-side over the rows the page has: an account's creatives are dozens,
and a round trip per keystroke would be the slower way to the same list. An empty result says so as a `status`.
With no creatives the page is the title and one panel with one button.
Below `sm` the rows are not a table that scrolls sideways: the name, the state and the three readings, each with its
name and the ratio with its denominator, and *Copy tag*. The page's primary becomes a strip at the foot of the screen
that is `fixed` — a list is a page, and a page's strip is pinned to the viewport, where the workspace's is
`sticky` within its screen — and the list leaves room for it.

### Template sheet

*New creative* opens a dialog over the list (`NewCreativeSheet`; [ADR-0038](decisions/0038-creative-workspace.md)): the
templates on the left (300px from `md`), the selected one on the right — its static preview in a well, its name,
its standards and its description (held to 52ch) — and *Cancel* / *Configure creative* in the footer. The card is
880px wide at most and as high as the screen leaves it, 612px at most (`min(612px, 100dvh − 2rem)`). The VAST video
generator is the last row, set apart by a hairline: a creative of a kind of its own, built in its own tool. A modal
like the destructive confirmation (§6) and built the same way: portalled to `<body>`, its title an `h2` in the
`type-h3` role, Escape closes it, Tab stays inside the card, focus returns to where it was opened from. Pick,
*Configure*, and the workspace opens on the template's first section: three clicks and one page load, where
catalog → template page → *Configure creative* was three of each. Below `md` the preview pane gives way and the
selected row opens to show its description. `/dashboard/creatives/new` without a template opens the list with the
sheet already open (`?new=1`).

### Inputs

44px high (32px in a dense table context, or in a bar of `sm` controls — `inputDenseClass`), 1px `line` border, `--radius-ctl`, **mono 13px**,
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
  event is not ingested. Today the product records three delivery events
  ([ADR-0016](decisions/0016-three-events-hourly-counters.md)): **impression**, **click**
  (fired only from the final call-to-action that opens the advertiser's URL — never from an
  intermediate interaction such as a quiz answer), and **viewable** (self-reported by a
  VPAID unit; reported by the player for a VAST video creative from 4.0). A VAST video
  creative also records start, the three quartiles and complete
  ([ADR-0035](decisions/0035-vast-video-creatives.md)). Since [ADR-0033](decisions/0033-vast-error-statistics.md) it also counts
  the player's **`<Error>` beacon, per VAST code**. There is still no count of ad requests, and an
  error often fires before any impression, so **error rate and fill rate may not appear on
  any screen**. CTR became derivable when click arrived and
  **is displayed, over impressions**. Two rules come with it:
  - **A derived ratio may close the delivery strip, never sit inside it.** The counts are a
    sequential set of things that happened; a ratio is a reading about them.
  - **Its qualifier names the denominator, always.** "of impressions", not a bare percentage.
    Impressions and viewable impressions give different numbers, and a buyer reading an
    unlabelled CTR will assume whichever is worse for us.

  With no impressions the ratio is genuinely not measurable, so it prints the em dash — the
  transient one, in `text-fg`. It is not `0%`, which would claim nobody clicked.
- **The conversion report is a second strip, not an extension of the delivery one**
  ([ADR-0023](decisions/0023-conversion-postbacks.md)). Its clicks are a different
  measurement — navigations through our redirect, over 30 days — so they sit under their
  own heading, are labelled **"Tracked clicks"** rather than "Clicks" (two labels a letter
  apart on one screen get scanned as one number), and carry a qualifier saying what they
  count. It reads clicks → conversions → revenue, then the two ratios closing it, each
  naming its denominator: **CR "of clicks"** and **EPC "per click"** — a table column
  included ("CR of clicks"). Both print the transient em dash with no clicks, for the
  reason CTR does.
  - **Laid out as one row from `lg`**, five columns sized to their readings (1 : 1.4 : 1.3 : 0.9 : 1, with
    `minmax(0, …)` so a long figure cannot blow its cell out), and two across below it. Five *equal* columns were
    measured too narrow for money at the metric size — a large RUB amount ran out of its cell below ~1270px — and
    the money columns are the wider ones.
  - **A qualifier's parts add up to the number above it.** The conversions count is
    approved + pending; its caption names both, and names the rejected count as not
    counted, with every number in mono.
  - **Money is an amount plus an ISO code, one line per currency.** There is no FX, and a
    sum across currencies is a number in none of them. With nothing approved the reading
    is a real `0.00`, not a dash. Inside a table cell, which is one line tall, the
    currencies share the line instead, separated by ` · ` — still one amount and one code
    each, never a total.
  - **Conversion statuses are state and take the state vocabulary:** approved `live`,
    pending `info`, rejected `idle` — not `dead`, since nothing about the account is
    failing when an advertiser declines a lead. A **postback that failed** is `dead`: it
    is a setup fault the owner has to act on.
  - **Goals split the strip, they do not replace it**
    ([ADR-0027](decisions/0027-conversion-goals.md)). The strip stays the sum over every
    goal; a by-goal table directly under it — conversions, approved, rejected, CR of all
    clicks, revenue — appears once any conversion carries a goal, even a single one, since
    a goal's name is information nothing else on the page shows. It has **no clicks
    column**: a click has no goal, so each row's CR is over all the creative's tracked
    clicks, and a column repeating one number down every row would read as a per-goal
    count. For the same reason its ratio column is headed **"CR of all clicks"**, not the
    by-exit table's "CR of clicks", whose denominator is that row's own clicks — two
    denominators, two labels. It does have a **rejected column**, which the other report
    tables leave to the strip's qualifier: a goal the advertiser declined outright is
    otherwise a row of zeros with nothing to say why it is there. The goal is machine text
    in mono, sorted by a fixed collation so the order does not change with the interface
    language; "No goal", for conversions that came without one, is copy and sorts last. No
    rail — a goal has no state.

- **A VAST video creative's progress is its own strip, under the delivery one**
  ([ADR-0035](decisions/0035-vast-video-creatives.md)). Only that kind counts start, the
  three quartiles and complete, so they cannot join the closed impression → click strip;
  the strip is absent, not dashed, on an interactive creative's page. It reads start →
  25% → 50% → 75% → complete, left to right as a player fires them, and is closed by
  **VTR "completed, of impressions"** — the denominator named, all-time like the counts
  beside it, the transient em dash with no impressions. VTR exists nowhere else: an
  interactive creative ingests no progress event. Its viewability tile says *reported by
  the player* from VAST 4.0 (its `<ViewableImpression>`), and *not applicable* below it,
  with the version named.
- **VAST errors are their own section, not a delivery tile**
  ([ADR-0033](decisions/0033-vast-error-statistics.md)). An error is not a step in
  impression → click. It is a total tile, shaped like the viewability tile, whose caption
  says the number is player-reported and why it is not divided by impressions. Under it
  is a 44px table: code (mono), what happened (copy), count, and **"Share of errors"**.
  The header names the denominator, because a bare percentage there gets read as a share
  of impressions. Rows sort by count. Neither the tile nor the table carries a rail or
  `dead`: a code is not a state of the creative, and every creative served at scale
  has some errors. Code `0` reads "no code, or one we could not read". A code that VAST
  does not define reads "outside the spec". Code names come from the validator's IAB
  table. A share too small for one decimal prints `<0.1%`, never a `0` beside a non-zero
  count.
  - **The empty and outage states.** With no errors, the tile prints a real `0` and a
    sentence takes the table's place. A failed read follows the conversion report: the
    transient em dash in the tile, a `dead` notice, and no table. The notice is about our
    read failing, not about the creative, so it does not contradict the no-`dead` rule
    above.
  - **Not a column in the creatives list.** A fifth number column pushed the Russian row
    actions out of the 1200px container.

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

**The screen is its own stacking context** (`isolate`). A creative's chrome — its mandatory
close control — is positioned at `z-index: 2147483000`; with no stacking context of its own
it escapes into the page's and paints over the sticky bar and the menus that hang from it.
It was found with the account menu open over the landing's well: an overlay is tested in
the context it opens from (§6, "Destructive confirmation"). The dev harness's stage has no
bar to paint over and stays as it is.

**Serving well** — the configurator. A real VAST request happened, so the stage carries what that
request can prove. The delivery format (which *is* the standard — `SIMID 1.1`, `VPAID 2.0` — one
field, not two) is in the workspace's bar beside the name, and the server's response time sits in the
status line under the well once an ad has been served. Player status and the expiry countdown share that
line: they change during playback, and the format states the fixed fact of the request.

A player may mark a status with a **tone**, which raises it out of that line into a
full-width `Notice` under the well; the line goes quiet meanwhile, so one sentence is never
in two places. The line is sized for three words, and a condition the viewer has to *act* on
is prose. The case this exists for is the IMA player meeting an ad blocker: the SDK is a
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

**A third-party player's chrome does not belong in the well.** The Fluid player runs as an
ad-only outstream player — the `<video>` it wraps has no content — so its play button, scrub
bar and `00:00 / 00:00` readout drive a video that does not exist, and a timecode frozen at
zero under a running creative is a false readout, not merely clutter. The skin is ours rather
than the publisher's; no DSP ships it, so it is not part of what the player proves. **The whole
control bar is hidden**, its gradient scrim along with it. Stated cost — the preview starts
muted and nothing in this player can unmute it, so a template with a base video is judged
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

- The UI ships in **Russian and English**. The switcher is a two-state segmented control, mono
  11px uppercase, labelled `RU` / `EN` — language codes, never flags (a flag denotes a
  country, not a language). It sits in the top bar for a signed-out visitor and in the
  account menu for a signed-in one ([ADR-0037](decisions/0037-reduced-navigation-and-copy.md)).
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
- **A duplicated creative's default name ends in ` - Copy` in either locale.** The owner
  asked for that exact suffix, and once saved it is the user's own label — data, like a
  template name, not UI copy. The button that makes it is *Дублировать* / *Duplicate*,
  not *Копировать*: the same row already has *Копировать тег*.
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
- **Text earns its place** ([ADR-0037](decisions/0037-reduced-navigation-and-copy.md)). Before a
  string ships, five questions: does it change what the reader does; is it already said next
  to it — a label, a state, a button's name; does it restate the name or the obvious; does it
  repeat without telling things apart — seven identical chips; would it say the same shorter?
  A page has no subtitle under its title (`PageHeader` takes none), a field no hint that
  repeats its label, a required
  field only its `*`. Lines that carry trust or safety stay: the postback key works like a
  password, we keep no copy of a checked tag.

## 11. Boundaries — what we do not do

| | |
| --- | --- |
| ✕ | The accent as a general brand colour on headings, icons, or rules. Warm = action; two appearances per product screen, three on `/` and `/catalog` (§3). |
| ✕ | A light theme, or any second theme. |
| ✕ | Shadows as a depth tool. Elevation plus a hairline; shadow is for detaching a floating overlay only. |
| ✕ | Warm red for errors. The alarm is cold `#EE8089`, or it stops being an alarm. |
| ✕ | Card grids where a table belongs. The catalog is the one grid, and only because a template has no state. |
| ✕ | A live creative running anywhere but a player well, or more than one live unit on a page. The VPAID host is a single global — the second unit overwrites the first. |
| ✕ | Derived-ratio metrics without the counts they come from. Fill rate is barred outright — ad requests are not counted — and so is error rate: errors are counted, but an error often fires before any impression (ADR-0033). CTR is permitted since ADR-0016 made click a real count, and VTR only on a VAST video creative's page, whose progress events ADR-0035 counts — both with their denominator stated (§6). |
| ✕ | Raw Tailwind palette colours (`gray-200`, `green-100`, `blue-600`, …), or any literal hex, in `app/` or `components/`. Tokens only. §8 exempts `runtime/templates/**` and nothing else. |
| ✕ | Arbitrary type sizes (`text-[13px]`) on content. Roles from §4, as utilities. The one place a literal size is correct is **inside a shared primitive that defines a documented control size** — `ui/Button.tsx`'s three label sizes, the top bar's brand and nav sizes. A control's size is part of its specification (§6), not a call site's opinion; a page reaching for a literal size is the defect this bans. |
| ✕ | Rounded pills as a default shape. The radius scale in §2; `50%` only for the status dot and the one circle §2 names as a circle by nature (a drag knob). |
| ✕ | Hard `<br>` inside a heading. Use `text-wrap: balance`. |
| ✕ | Icon-only actions, no exceptions. Verbs label actions; an icon accompanies a word. Tried once as a data-table space-saving device and retracted: even a spec-correct 18px icon read as an indistinguishable speck once it had no word to lean on, confirmed twice from live screenshots and a DevTools inspection that ruled out a rendering bug — the icon was never the problem, having no label was. If a row's action cell is too narrow for labelled buttons, the fix is narrower *other* columns or a taller cell, not a smaller word. |
| ✕ | Flags for language. |
| ✕ | A layout that exists at one width. Every surface is checked at 360 / 390 / 768 / 1280 / 1920 / 2560. |
| ✕ | A base utility at a call site that sets a property the primitive already sets (`hidden` on a `Button`'s `inline-flex`, `w-28` on `inputClass`'s `w-full`, `h-9` on a button's `h-11`). Tailwind orders same-property utilities by name, not by their place in the attribute, so the call site's class simply loses — that is how Sign in, `hidden sm:inline-flex`, never hid and sat over the wordmark at 390. Use a variant, which is emitted after every base utility (`max-lg:hidden`), or a prop or a base class the primitive offers (`size`, `inputBaseClass`). |
| ✕ | Motion that ignores `prefers-reduced-motion`, or a `transition` on `all`. |
| ✓ | Density as respect: 44px rows, spacing in multiples of 4 — and the 32px readout density (§6) for system-emitted tables that are read as a stream rather than acted on. |
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
- **Any new colour, radius, shadow, type size, or breakpoint is a change to this document first** — add
  the token here, then use it. That friction is what kept literal hex out of the components
  entirely, and it is the reason a whole-product repalette was a `@theme` edit rather than a
  sixty-file migration.
- **Contrast is computed, not judged.** Every ratio in §3 and §7 came from the WCAG formula
  against the stated background. When you add or change a colour, compute it — text ≥ 4.5:1,
  large text and non-text ≥ 3:1 — and write the number next to the token.

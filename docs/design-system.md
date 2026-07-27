# Instrument — the AdInteract design system

> The visual and interaction contract for every AdInteract surface. Binding on all UI
> work: new pages, new components, new states, and edits to existing ones. Enforced by
> the [`design-check`](../.claude/skills/design-check/SKILL.md) skill and the
> [`design-system-reviewer`](../.claude/agents/design-system-reviewer.md) subagent.
> Rationale and rejected alternatives live in
> [ADR-0007](decisions/0007-design-system-instrument.md).

## 1. Thesis

A media buyer does not come here to admire anything. They configure a creative, copy a
VAST tag, paste it into a DSP, and check whether it is alive. **Instrument** is designed
for that person: the character comes from precision — one warm colour that always means
*action*, hairlines instead of shadows, monospace for everything the machine owns, and
status readable in peripheral vision.

Three consequences follow, and they override any local styling preference:

1. **The dashboard is the product.** The landing page borrows the dashboard's language,
   not the other way round.
2. **Restraint is the aesthetic.** If a screen looks busy, the fix is removal, not a
   nicer decoration.
3. **Warm is action, cold is alarm.** See §3 — this is the load-bearing rule of the
   whole palette.

## 2. Foundations

- **Single light theme.** There is no dark theme and no theme toggle. The one dark
  surface in the product is the player well (§7), which is a function, not a theme.
- **8pt grid.** Layout spacing — gaps between elements, sections, and panels — is a
  multiple of 4px; the rhythm is 8/12/16/24/32/48/64. Two carve-outs, both stopping at
  the control's edge: *padding inside a control* may use 2px steps (6/10/14) where that
  is what lands it on its 32px height, and the *gap between the parts of one control* —
  status dot to word, brand mark to wordmark, icon to label — may do the same, because
  those parts read as a single object rather than as laid-out siblings. The gap between
  a label and its field is layout, not a control's insides.
- **Radius 3px** for controls, panels, inputs, chips. `50%` only for the status dot.
  Nothing else is rounded.
- **A focus outline is drawn at 2px offset, so it must never sit inside an
  `overflow-hidden` box.** This applies to every grouped control — segments, catalog
  tiles, anything using a `gap-px` hairline container: round the first and last child
  instead of clipping the parent. It is the single most repeated way focus disappears.
- **No shadows.** Depth is expressed by a 1px hairline and a change of surface. The one
  exception is a floating overlay (dropdown menu, popover, modal), which may use a
  single subtle shadow token.
- **Row height 44px** in data tables (12px vertical padding on 13px/20px text).

## 3. Colour

### Accent — Sienna

Warm terracotta. It means **action or current selection**, and nothing else.

| Token | Utility | Hex | Use |
| --- | --- | --- | --- |
| `--color-accent` | `bg-accent` / `text-accent` | `#A24B2E` | Primary button, active nav underline, brand mark, focus ring |
| `--color-accent-hover` | `bg-accent-hover` | `#85391F` | Hover/active state of the above |
| `--color-accent-tint` | `bg-accent-tint` | `#F7EBE4` | Selected row, current-choice background |

White text on `--color-accent` measures **5.9:1** — AA at all sizes. Do not lighten the
accent without re-checking that ratio.

**Hard limit: at most two accent appearances in the content area of a screen.** Typically
one primary button plus one current-state marker. A third occurrence means something else
must give it up.

The **persistent top-bar chrome is exempt from that count**: the brand mark is on every
screen by definition, so counting it would spend one of the two slots before a page shows
anything. The exemption covers the brand mark and the active-section underline, and
nothing else — in particular the language control is *not* a task action and must not be
accent-filled. Everything below the top bar counts.

### Semantics — deliberately cold

Because the accent is warm, the status vocabulary is pushed to the cold side. A warm red
would blend into the accent and stop reading as an alarm; a blue freed from accent duty
now carries informational states.

| State | Rail / dot (`--color-*`) | Text (`-fg`) | Tint background (`-bg`) | Meaning |
| --- | --- | --- | --- | --- |
| live / active | `live` `#1B7A52` | `#12603F` | `#E4F0EA` | Serving, entitled |
| trial / info | `info` `#2C5FA8` | `#244F8C` | `#E8EEF8` | Trialing, renewing soon, informational |
| dead / past due | `dead` `#B02537` | `#93202F` | `#FAE8EA` | Lapsed, failing, fail-closed |
| idle / draft | `idle` `#C4BFB7` | `#6E6862` | `#EAE8E4` | Not published, no activity |

Semantic colour is **not** the accent and never decorates. It only encodes state.

### Neutrals — warm, chosen, not inherited

The ramp is pushed warm to sit with Sienna; a cold grey next to terracotta reads dirty.
Never use a raw Tailwind palette grey (`gray-*`, `slate-*`, `zinc-*`) in this project.

Token names below are the ones that actually ship in `app/globals.css`. Tailwind v4 emits
utilities from the `--color-*` namespace, so the token name and the class name are one
lookup apart — `--color-hairline` → `border-hairline`, `bg-hairline`, `text-hairline`.

| Token | Utility stem | Hex | Use |
| --- | --- | --- | --- |
| `--color-surface` | `surface` | `#FFFFFF` | Panel/surface |
| `--color-surface-sunken` | `surface-sunken` | `#FBFAF9` | Panel header, subtle inset |
| `--color-ground` | `ground` | `#F4F3F1` | Page ground |
| `--color-fill` | `fill` | `#EAE8E4` | Fill, hover, chip background, table row separator |
| `--color-hairline` | `hairline` | `#DEDBD6` | Hairline — the default border, panel edges, table head |
| `--color-line` | `line` | `#C4BFB7` | Strong hairline, control border |
| `--color-fg-disabled` | `fg-disabled` | `#948E85` | Disabled text |
| `--color-fg-muted` | `fg-muted` | `#6E6862` | Muted text, labels, placeholders |
| `--color-fg-secondary` | `fg-secondary` | `#403B36` | Secondary text |
| `--color-fg` | `fg` | `#1B1A18` | Primary text |

Lines come in two weights on purpose: `hairline` draws the outside of a panel and the rule
under a table head, `fill` draws the separators between rows inside it. The lighter inner
rule is what keeps a 30-row table from reading as a grid.

## 4. Typography

Two faces, one rule.

- **IBM Plex Sans** — everything a human wrote: headings, body copy, button labels,
  help text, error messages.
- **IBM Plex Mono** with `font-variant-numeric: tabular-nums` — everything the machine
  owns or a human must read character by character: VAST tags and URLs, creative and
  template ids, format/standard names (`SIMID 1.1`, `VPAID 2.0`), timecodes, durations,
  counts and metrics, status words, field labels, **and all text inputs** (they hold
  URLs, macros, and timecodes).

This human/machine split is the most recognisable feature of the interface. It is a
rule, not a preference. Plex covers Latin and Cyrillic, so both UI languages (§8) share
one grid with no font substitution.

| Role | Size / line | Weight | Notes |
| --- | --- | --- | --- |
| display | 30/36 | 600 | `-0.02em`, landing hero and page titles |
| h1 | 20/28 | 600 | `-0.01em` |
| h2 | 15/22 | 600 | Section heading |
| body | 15/24 | 400 | Running text; keep near 65 characters wide |
| small | 13/20 | 400 | Help text, table cells |
| caption | 12/16 | 400 | The smallest sans size that exists: field help, a metric's qualifier, the player well's caption. Below this, use `small` — there is no 11px sans |
| data | 13/20 | 400 | Mono, tabular-nums |
| label | 11/16 | 500 | Mono, uppercase, `0.09em` — instrument-panel legends (`label-instr`) |
| chip | 11/16 | 500 | Mono, uppercase, `0.06em` — format chips, segment buttons, state words. Tighter than a label because it sits inside a box, not above one |

`text-sm` (14px) is not on this scale. Machine-owned values use the `data` role even when
they sit in a dense table cell — a VAST tag at 12px is a downgrade, not a refinement.

## 5. Layout

- Dashboard content max width **1080px**; running prose max **66ch**. The public catalog
  (`/catalog`, `/catalog/[slug]`) holds the same 1080px, so the content never runs wider
  than the top-bar chrome above it.
- The spec-sheet grid — a `168px` label gutter plus a fluid content column — is the
  default for **wide** settings and documentation-like screens. Two kinds of form stack
  the label above the field instead:
  - panels narrower than ~520px (the auth panels), where a 168px gutter leaves the input
    unusable;
  - the **creative configurator**, which is wide enough for the gutter but renders fields
    from a template's `config_schema`: label lengths and help text are authored per
    template, so a fixed gutter would either clip a long label or strand a short one.
- Sections are separated by a hairline, not by empty space alone.
- Lay out sibling groups with flex/grid `gap`, never per-element margins.
- Wide content (tables, tag URLs, code) scrolls inside its own `overflow-x: auto`
  container. The page body never scrolls sideways.

## 6. Components

### Data tables — the default for lists

Lists of creatives and subscriptions are **tables with a state rail**, not a grid of
cards. This covers every list inside the dashboard, including pickers over the user's own
rows. The catalog is the single exception, specified below.

- 3px left border on the first cell, coloured by the semantic state, with `padding-left`
  cut to 13px so rail plus padding still sum to the 16px cell inset. This is what makes
  a problem visible in peripheral vision at thirty rows.
- **A row without a real state gets no rail.** A decorative rail — one hardcoded tone on
  every row — teaches the reader that the rail means nothing.
- Header cells use the mono uppercase label style.
- The row is never filled with semantic colour — the rail plus the state word already
  carry the meaning, and a filled row turns the list into a traffic light.
- Status appears as `dot + mono uppercase word`. Reserve the pill/badge form for places
  where the word itself is the payload.
- Numeric columns are mono with `tabular-nums`.

### Catalog tiles — the one grid

The template catalog (`/catalog`) is the only grid in the product, and it earns the
exception honestly: its rows carry no state. A published template is not serving, lapsing,
or failing — it is a thing you pick. The landing page renders the same component at teaser
length. Everything else is a table.

- Hairline-separated grid: `gap-px` on a `bg-hairline` container with `bg-surface` cells.
  One column at base, two at `sm`, three at `lg`.
- Tile contents, in order: name (15/22, 600) → description (13/20, `fg-muted`, clamped to
  three lines) → format chips (mono `chip` role). Nothing else, and nothing else
  interactive: the whole tile is one link.
- Hover is `bg-surface-sunken`. No lift, no shadow, no border colour change. Focus is the
  standard 2px accent outline at 2px offset.
- **Accent budget on the catalog index is zero.** Tiles are links, not actions.
- **No live creative and no image inside a tile.** This is not a performance preference:
  the VPAID host is the global `window.getVPAIDAd`, so a second unit on the same page
  overwrites the first. A grid of live tiles is incorrect, not merely heavy. Live demos
  live on the template detail page, one per page (§7).

### Buttons

| Variant | Appearance | Rule |
| --- | --- | --- |
| primary | `accent` fill, white text | **One per screen** |
| secondary | `surface` fill, `line` border | The default action button |
| ghost | transparent, `fill` on hover | Tertiary/cancel |
| disabled | `fill` background, `fg-disabled` text | Avoid; prefer an enabled control that explains itself |

Height 32px, radius 3px, 13px/500 label, 120ms transitions.

**One implementation per repeated element**, not just for buttons: `ui/Button.tsx`
(`buttonClass()` in client components), `ui/Chip.tsx` for the chip role, `ui/State.tsx`
for state words and rails. A hand-rolled control that lands at 24px, or a fifth copy of
the chip that quietly ships at weight 400, is how a system starts drifting.

### Segmented controls

Language, delivery format, and player backend all use the same shape: mono `chip` type,
1px `line` border, `fill` on the current
segment, hairline dividers between segments. The wrapper must **not** clip overflow —
a focus outline drawn at 2px offset inside an `overflow-hidden` box is invisible. Round
the first and last segment instead.

### Inputs

32px high, 1px `line` border, radius 3px, **mono 13px**. Placeholders are `fg-muted`
(`fg-disabled` is reserved for genuinely disabled controls). Help text is 12px `fg-muted`
below the field. Focus is a 2px accent outline with 2px offset — every interactive
element must have a visible focus state, including one whose real `<input>` is
`sr-only` behind a styled label.

### Metrics

Mono value at 22/28 weight 500 with `tabular-nums`, mono uppercase label above, 12px
`fg-muted` qualifier below. Grouped in a hairline-separated strip, not in cards. Inside a
table cell a metric drops to the `data` role (13/20); the 22/28 strip form belongs to
detail pages.

Counting rules, because a metric that lies costs more than a metric that is missing:

- Counts are integers, `tabular-nums`, thousand-grouped with
  `Intl.NumberFormat(LOCALE_TAG[locale])`. Grouping is the one concession a machine value
  makes to a human reader.
- **A zero is a real reading — print `0`.** An em dash means "not measurable", and the two
  must never be confused. Never hide a row because its counts are zero.
- **When the numbers are unmeasurable, the state rail has nothing to encode either.**
  Print the em dash *and* drop the rail to transparent — falling back to a neutral tone
  paints a claim ("idle") where there is only an absence.
- The delivery funnel reads left to right in the order the player fires it:
  impression → start → q25 → q50 → q75 → complete.
- **No derived ratio without the counts it comes from**, and no derived ratio at all where
  the underlying event is not ingested. Today the product records impression, start and the
  three quartiles plus complete — there is no click event, no error event, and no count of
  ad requests, so CTR, error rate and fill rate may not appear on any screen.

## 7. The player well

The creative preview is the single dark surface in the product, because a creative is
always judged against black, as in an editing suite. It carries its own small palette —
the light-theme tokens have no contrast down there — and nothing outside the well may
use these:

| Token | Hex | On `well` | Use |
| --- | --- | --- | --- |
| `--color-well` | `#17150F` | — | The well itself |
| `--color-well-screen` | `#221E18` | — | The viewport rectangle inside it |
| `--color-well-line` | `#332E26` | — | Hairlines and control edges on dark |
| `--color-well-fg` | `#8C857A` | 5.00:1 | **All text in the well**, including secondary readouts |
| `--color-well-fg-dim` | `#5A5348` | 2.40:1 | **Non-text only** — hairlines, inactive glyphs, disabled marks |
| `--color-well-live` | `#63C79A` | 8.84:1 | Success indicators: "ad served", "click-through fired" |
| `--color-well-accent` | `#E08A5E` | 6.92:1 | The one warm marker on dark (see below). **Reserved — no consumer yet** |

Ratios are measured against `#17150F` with the WCAG formula, in the browser, not estimated.
`--color-well-accent` is Sienna lightened to clear AA down there; Sienna itself measures
**3.11:1** on the well — under the 4.5:1 text threshold, so it cannot carry a word on dark.
`well-accent` is not the accent token and must never appear on a light surface.

There are two variants of the well, and the difference is whether an ad was actually
requested. **Exactly one well per page**; the catalog index has none.

**Serving well** — the configurator. A real VAST request happened, so an instrument strip
above the viewport carries what that request can prove: the delivery format (which *is*
the standard — `SIMID 1.1`, `VPAID 2.0` — one field, not two) on the left, and the
server's response time on the right once an ad has been served. Player status and the
expiry countdown sit below the viewport rather than in the strip, because they change
during playback while the strip states the fixed facts of the request.

**Demo well** — the template detail page in the catalog. The unit runs straight from
Storage with sample config; there is no ad request, no tag, and no latency, **so it gets
no instrument strip.** Fabricating a response time here is forbidden — it would be a
number that means nothing on the one screen a prospect trusts most.

The demo well has exactly **one caption slot** under the viewport, `well-fg` at the
`caption` size: it holds the placeholder disclosure until a click-through fires, and the
click-through readout afterwards (label in `well-live`, URL in mono `well-fg`). One slot,
never two stacked captions.
- `well-fg-dim` at 2.5:1 is below AA and below the 3:1 non-text threshold, so it may not
  carry a word — least of all a countdown telling a buyer their preview tag is expiring.
  Dim-looking text in the well is `well-fg`; `well-fg-dim` draws lines, not language.
- The warm marker is allowed **at most once** on dark, on a progress indicator — the
  scrub bar. Today the scrub lives in third-party player chrome we do not style, so
  `--color-well-accent` is declared and deliberately unused; it becomes live the day the
  Sandbox harness draws its own progress bar. Machine data down there (URLs, timecodes)
  is `well-fg`, never warm.

## 8. Language and copy

- The UI ships in **Russian and English**. The switcher is a two-state segmented control
  in the top bar next to the account, mono 11px uppercase, labelled `RU` / `EN` —
  language codes, never flags (a flag denotes a country, not a language).
- The choice persists in a **cookie**, written server-side, so the landing page and the
  dashboard always agree within a browser. It is deliberately *not* on the user record
  yet: `profiles` exists and its RLS already lets an owner update their own row, but
  adding a `locale` column is a schema migration, and a display preference is not a good
  reason to put one inside a styling release. The consequence is small and stated: a
  different browser starts at the default locale.
- **Not everything visible is UI copy.** Template names and descriptions come from the
  `templates` table and stay as authored. So does the sample content inside a demo
  creative — it is derived from the template's own `config_schema` defaults plus the
  placeholder assets in `public/demo/`, which is stand-in advertiser material, not
  interface language. Technical status words that the ad industry uses in
  English (`Live`, `SIMID 1.1`, `VPAID 2.0`) are also left untranslated on purpose —
  translating them would make the dashboard harder to match against a DSP.
- **The public VAST endpoint is unaffected by language.** It has no session and no UI;
  no locale logic may be added to that path (see
  [architecture.md](architecture.md) and [security.md](security.md)).
- Every user-visible string goes through the i18n layer with both locales supplied. A
  hardcoded human-readable string in a component is a defect.
- Copy rules: sentence case; a control names what happens ("Copy tag" → "Tag copied",
  never "Successfully copied!"); errors say what went wrong and what to do; no
  exclamation marks; no "please", "simply", "just".

## 9. Boundaries — what we do not do

| | |
| --- | --- |
| ✕ | Terracotta as a general brand colour on headings or icons. Warm = action, twice per screen maximum **in the content area** (§3 exempts the brand mark and the active-section underline; nothing else). |
| ✕ | Shadows or floating cards. Hairline plus surface change only; shadow is for overlays. |
| ✕ | Warm red for errors. The alarm is cold `#B02537`, or it stops being an alarm. |
| ✕ | Card grids where a table belongs. The catalog is the one grid, and only because a template has no state. |
| ✕ | A live creative running anywhere but a player well, or more than one live unit on a page. The VPAID host is a single global — the second unit overwrites the first. |
| ✕ | Derived-ratio metrics (CTR, VTR, fill rate) without the counts they come from, or at all where the underlying event is not ingested. |
| ✕ | Raw Tailwind palette colours (`gray-200`, `green-100`, `blue-600`, …). Tokens only. |
| ✕ | Rounded pills as a default shape. 3px radius; `50%` only for the status dot. |
| ✕ | Icon-only actions. Verbs label actions; an icon accompanies a word. |
| ✕ | Flags for language, or a second theme. |
| ✓ | Density as respect: 44px rows, spacing in multiples of 4. |
| ✓ | State encoded in form as well as colour. |
| ✓ | Both locales supplied for every new string. |

## 10. Implementation

- Tokens live as CSS custom properties in `app/globals.css` and are exposed to Tailwind
  through the `@theme` block. Components consume tokens, never literal hex.
- Fonts are loaded with `next/font/google` (IBM Plex Sans, IBM Plex Mono) with Latin and
  Cyrillic subsets. Nothing may override `body`'s font stack.
- Any new colour, radius, shadow, or type size is a change to this document first — add
  the token here, then use it.

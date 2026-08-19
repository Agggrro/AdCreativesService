# Instrument — the CreoSmith design system

> The visual and interaction contract for every CreoSmith surface. Binding on all UI
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
  exception is a floating overlay (dropdown menu, popover, modal), which may use the
  single `shadow-overlay` token (`--shadow-overlay` in `app/globals.css`) and nothing
  else. A modal's backdrop is `bg-fg/40` — the existing `fg` token at 40% opacity, not a
  new colour.
- **Row height 44px** in data tables (12px vertical padding on 13px/20px text). One
  narrower density exists, and only for machine readouts — see §6, "Readout density".

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

The **persistent top-bar chrome is exempt from that count**: the brand lockup is on every
screen by definition, so counting it would spend one of the two slots before a page shows
anything. The exemption covers the **whole lockup** — the monogram's `C` and the
wordmark's `Creo`, which are one identity in two pieces, not two spends — plus the
active-section underline. Nothing else: in particular the language control is *not* a task
action and must not be accent-filled. Everything below the top bar counts.

### Semantics — deliberately cold

Because the accent is warm, the status vocabulary is pushed to the cold side. A warm red
would blend into the accent and stop reading as an alarm; a blue freed from accent duty
now carries informational states.

| State | Rail / dot (`--color-*`) | Text (`-fg`) | Tint background (`-bg`) | Meaning |
| --- | --- | --- | --- | --- |
| live / active | `live` `#1B7A52` | `#12603F` | `#E4F0EA` | Serving, entitled — and, in a configurator matrix, fully configured |
| trial / info | `info` `#2C5FA8` | `#244F8C` | `#E8EEF8` | Trialing, renewing soon, informational |
| warn / at risk | `warn` `#6247C4` | `#4E3AA3` | `#EDEBFA` | Valid but fragile: deprecated, ambiguous, or broken in part of the market |
| dead / past due | `dead` `#B02537` | `#93202F` | `#FAE8EA` | Lapsed, failing, fail-closed |
| idle / draft | `idle` `#C4BFB7` | `#6E6862` | `#EAE8E4` | Not published, no activity, nothing filled in yet |

Semantic colour is **not** the accent and never decorates. It only encodes state.

`warn` is violet rather than the amber a warning usually wears, and that is forced rather
than stylistic: amber is warm, warm means action, and a warning that reads as a button is
worse than no warning. Violet is cold, sits clearly apart from `info` blue and `dead` red,
and cannot be mistaken for Sienna. It measures **8.54:1** for text on `surface`, **7.27:1**
on its own tint, and **6.53:1** for the rail — the same band as `info` (8.16 / 7.00 / 6.35)
and `dead` (8.44 / 7.15 / 6.63), so the family stays even and the pairing `idle` cannot do
is available here.

The three-step severity it exists for is the VAST validator's (§6): a violation of the
declared spec is `dead`, something legal but known to break in part of the market is
`warn`, and an opportunity is `info`. Collapsing the middle step would hide the difference
between "this will bite you" and "you could do better", which is the distinction the
report is read for.

`idle`'s text on its own tint (`#6E6862` on `#EAE8E4`) measures **4.49:1** — just under AA
for small text. Idle is the one pair where text and tint may not be combined at the `chip`
size; put an idle state word on `surface` or `surface-sunken` instead. Fix the token
rather than working around it if a case ever genuinely needs the pairing.

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
| wordmark | 15/24 | 700 | `-0.01em`. The **only** role above 600, and the only consumer of Plex Sans 700 — it exists so the word carries the same weight as the monogram beside it. Do not reach for 700 anywhere else; a heading that needs more presence needs more size, not more weight |
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

### Brand lockup

The lockup is a **CS monogram** plus the wordmark, and the two are read as one object:

- **Monogram** (`ui/BrandMark.tsx`) — an open Sienna `C` whose counter holds a play
  triangle, then an `S`. One inline SVG, 28px tall. Only the `C` is warm; the triangle
  and the `S` are `fg`.
- **Wordmark** — `Creo` in `accent`, `Smith` in `fg`, at the `wordmark` role (§4). The
  colour split is the same split as the glyph, which is the whole point: `C`↔`Creo`,
  `S`↔`Smith`. The two halves explain each other, so the word is not a caption under a
  logo.

It replaced a 20px accent square holding the letter `A`, which the rename to CreoSmith
left meaningless. The strings are split in the dictionary (`brand.nameLead` /
`brand.nameTail`), not sliced in the component — §8 admits no exception for short
literals.

Constraints that bind any future revision:

- **Flat, and this was tested.** The source reference is a bevelled 3D render, and
  reintroducing depth was tried on the real bar at real size — a soft `drop-shadow` and a
  hard offset extrude, both on the glyph and the word. Both lost: at 28px a blur turns a
  two-colour glyph to mud, and an offset copy reads as a rendering fault rather than as
  depth. So §2's no-shadow rule costs nothing here, and the flat mark is the better
  drawing on its own merits, not merely the compliant one. **Do not re-litigate this
  without a render at 28px.**
- **Warm, not slate.** The reference's second letter is cold slate. §3 rules that out
  next to terracotta, so the `S` takes the `fg` neutral. Every colour is a token.
- **The accent here is chrome, not action.** §3 exempts the whole lockup from the
  two-appearance budget, and stops there: the same shapes used anywhere below the top bar
  would count.
- **28px is a floor, not a default.** Below it the play triangle silts up inside the
  counter. A smaller surface — a favicon, say — takes the `C` alone, never a shrunken
  lockup.

The `C`'s radial terminals and the `S`'s flat ones both fall out of butt-capped arcs
rather than hand-drawn outlines, and the `S`'s bowls are elliptical (rx 12.5, ry 9.5)
because circular ones read narrow beside the `C`; the geometry is derived in the
component's header comment. The glyph is `aria-hidden` — the wordmark next to it is the
accessible name, and labelling both would announce the brand twice.

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
| danger | `dead` fill, white text | The confirm action inside a destructive confirmation dialog only — never a default list action, and never the trigger that opens the dialog |
| disabled | `fill` background, `fg-disabled` text | Avoid; prefer an enabled control that explains itself |

Height 32px, radius 3px, 13px/500 label, 120ms transitions.

**One implementation per repeated element**, not just for buttons: `ui/Button.tsx`
(`buttonClass()` in client components), `ui/Chip.tsx` for the chip role, `ui/State.tsx`
for state words and rails. A hand-rolled control that lands at 24px, or a fifth copy of
the chip that quietly ships at weight 400, is how a system starts drifting.

### Destructive confirmation

An action that cannot be undone (deleting a creative) never fires from a single click.
The trigger is a plain `secondary` button, labelled — never coloured, since §3 forbids a
status colour used as decoration. It opens a centred dialog: `bg-fg/40` backdrop,
`shadow-overlay` panel, a sans h2 naming the action, the affected item's own name (sans,
not mono — it is a label the user wrote, not a machine value), a one-line consequence in
`fg-muted`, then `ghost` **Cancel** and `danger` **confirm**, in that order so the safe
choice sits nearest the reading direction's start. `Escape` and a backdrop click both
cancel. Confirming submits a server action — no client-side fetch/JSON round trip for a
plain delete.

**Every overlay is portalled to `<body>` (`createPortal`), with one documented exception**
(below, "Nav dropdown", and narrow on purpose — see there before citing it as precedent).
`position: fixed` removes an element from layout flow but leaves it in the DOM tree, so an overlay
opened from inside a table cell stays that cell's descendant and keeps inheriting from it.
The delete dialog shipped this way and inherited `white-space: nowrap` from its row's
`<td>`: the body copy rendered as one 880px line inside a 384px card and spilled across
the table. `break-words` cannot override `nowrap`, and no amount of width capping on the
card helps, because the overflow is the text, not the box. Portalling is also what keeps
`fixed` anchored to the viewport should any ancestor ever gain a `transform`, `filter`,
or `contain` — each of which silently makes itself the containing block instead.

Test an overlay **in the context it actually opens from**, never in isolation: rendered
standalone this dialog computed `white-space: normal` and looked perfect, which is exactly
how the bug survived a round of "verified locally".

### Nav dropdown

The Tools entry in the top bar (ADR-0013) is a disclosure button, not a link: it opens a
panel listing the two free tools directly. There is no `/tools` index page — it shipped
first (a table, one row per tool) and was removed once this dropdown replaced it as the
only thing in the app that pointed at it (ADR-0013's consequences). Each tool now stands
on its own page, reachable from this panel or directly — a search engine, a bookmark,
`?tag=` on the validator.

- `aria-expanded` + `aria-controls` on the trigger, a plain panel of real `Link`s under it
  — the two-item disclosure pattern, not a full ARIA `menu` role (which would promise
  arrow-key navigation this component does not implement).
- Panel: `border border-hairline`, `rounded-ctl`, `bg-surface`, the `shadow-overlay` token
  (§2), `divide-y divide-hairline` between items. Each item carries the tool's name, its
  `StateWord` (below, "Free tools"), and its one-line description, read from
  `lib/tools.ts`'s `freeTools()` — the one place that list is assembled.
- Round the first and last item's own corners (`rounded-t-ctl` / `rounded-b-ctl`); the panel
  itself is never `overflow-hidden`, for the same reason a segmented control isn't (§2's
  2px-offset focus ring).
- **Not portalled** — the system's one documented exception to "every overlay is portalled"
  above, and it is *not* a blanket carve-out for `position: absolute`. The portal rule
  guards against two separate hazards, and each has to be checked on its own terms, not
  waved through by positioning scheme:
  - **CSS inheritance** (the `white-space: nowrap` incident above) follows the DOM tree
    regardless of `position` — `absolute` inherits exactly as `fixed` does. The only honest
    defense is that the specific path from `<header>` down to this panel is verified free of
    anything inheritable that would leak in (no `overflow-hidden`, `white-space`, or
    `truncate` on any ancestor) — a claim about *this* DOM path today, not a property of
    `absolute` in general. Re-check it, don't assume it, if this trigger is ever reused
    inside a different header.
  - **The viewport-anchor hazard** — an ancestor gaining `transform`, `filter`, or `contain`
    and silently becoming the containing block — is genuinely specific to `position: fixed`,
    and does not apply here at all: the panel is `position: absolute` against a `relative`
    wrapper it owns one level up, so there is no viewport anchor to hijack in the first
    place. It also needs to scroll together with the header (which is not `sticky`), which
    `fixed` would get wrong regardless of the ancestor chain.
  Portal a nav dropdown the day either check stops holding — a different header, or a need
  to escape a clipping ancestor.

### Help tooltip

Explanation a fluent user does not need belongs *behind* a trigger, not in a paragraph
under the control. The VAST validator forced this: every setting carried two or three
lines of `fg-muted` prose, and the result was a form you had to read past rather than
operate. An expert tool earns the right to be terse — it does not earn the right to be
unexplained.

`ui/Tooltip.tsx` exports `HelpLabel`, and it is the one implementation.

**The label is the trigger.** Not a `?` button beside the label — the label and the
icon are one `<button>`, rendering as `Tracking pixels ?`. This is the whole design of
the component and it is settled, not open: a bare `?` is an icon-only control, §9
forbids those without qualification, and
[ADR-0007](decisions/0007-design-system-instrument.md) records four iterations of
carving an exception out of that rule — three of them narrowing the exception instead
of questioning it — before retracting it entirely. Making the word the trigger needs no
exception: the word is visible, it *is* the accessible name, and the icon accompanies
it, which is exactly what §9 asks for. It also produces a touch target the size of the
label rather than of a 14px glyph.

It attaches to **any visible label that names something** — a field's `label-instr`, a
table column header, a section heading — and never floats free of one. `className`
carries the type role of whichever it is.

- **It opens on hover, on keyboard focus, and on click** — all three, never hover
  alone. Hover does not exist on a touch device, and once the inline paragraph is gone
  the panel holds the only copy of that sentence. A pointer leaving the trigger closes
  it after a short grace period, so the gap between trigger and panel can be crossed to
  read it; a click pins it open until clicked again.
- Panel: `bg-surface`, `border border-hairline`, `rounded-ctl`, `shadow-overlay` (§2),
  `small` sans, `max-w-[44ch]`. Portalled to `<body>` per the overlay rule above — it
  opens from inside table headers and grid cells, which is precisely the inheritance
  hazard that rule exists for, and a `<th>`'s `white-space: nowrap` demonstrably reaches
  it otherwise.
- Association is `role="tooltip"` plus `aria-describedby`. Not `aria-expanded`, which
  describes an expandable widget; a tooltip is not one.
- `Escape` closes and returns focus to the trigger; an outside click closes.
- It holds explanation only: never a control, never an error, never a value to copy.
  Nothing the user must act on may live behind a hover.

### Readout density

44px stays the default, and stays mandatory wherever a row represents **a thing the user
owns** — a creative, a template, a subscription. A second, narrower density exists for
**machine readouts**: tables whose rows the system emits rather than the user authors,
and which are read as a stream rather than acted on. The validator's run timeline,
feature matrix, wrapper chain and parser-versus-player comparison are the entire list
today.

- Row height **32px** — `px-3 py-1.5` on `data` 13/20 type, which the cell class sets
  itself rather than leaving to each call site. The rail stays 3px, so the left padding
  drops to 9px exactly as the 44px cell's drops to 13px. Header row is 28px, the same
  `px-3 py-1.5` on the 11/16 `label` role.
- **No row in this density carries a row-level action.** A row you can act on is not a
  readout and takes 44px. That is what stops the density becoming a way to cram, and it
  is why the validator's findings list — whose rows expand — is *not* in it.
- The density is a property of the table, not of a cell: a table is entirely one or
  entirely the other, and a cell never mixes the readout cell class with a second type
  utility that fights it.
- 32px is the height of a single-line row, not a promise. A cell that stacks a value
  over a qualifier is taller, and that is correct — the density sets the floor and the
  rhythm, not a cap.
- That list of four tables is illustrative, not exhaustive: the distinction above —
  system-emitted and scanned, versus user-owned and acted on — decides every case.

The justification is legibility of the whole, not fitting more in. A sixty-row event
timeline at 44px is 2,640px of scrolling, and the reader loses the shape of the run —
which is the only thing a timeline is for. Ten creatives at 32px would just look cramped,
which is why the default does not move.

### Segmented controls

Language, delivery format, player backend, and the landing hero's template switcher all
use the same shape: mono `chip` type, 1px `line` border, `fill` on the current
segment, hairline dividers between segments. The wrapper must **not** clip overflow —
a focus outline drawn at 2px offset inside an `overflow-hidden` box is invisible. Round
the first and last segment instead.

### Landing hero — one well, switched by tabs

The landing page (`/`) leads with a segmented template switcher above a single **demo
well** (§7) — exactly the old `/preview` shape, restored as the site's front door. This is
**not** the catalog-tile grid and does not relax its rule: at any moment exactly one VPAID
unit is mounted, because switching tabs unmounts the previous one before mounting the
next. A grid of simultaneously-live tiles is still forbidden; a single well whose content
is swapped by a segmented control is the pattern that rule was always compatible with.

- Content order: eyebrow/headline and one-line pitch → the switcher → the well → one
  primary CTA (`Start free trial` for a visitor, `Go to dashboard` when signed in).
- Every published template with a working demo unit gets a tab, derived the same way as
  `/catalog/[slug]` (`lib/template-demo.ts`) — the switcher is not a hand-maintained
  fixture list. A template with no resolvable demo unit is left out of the tab strip
  rather than shown broken.
- **Exception to the placeholder-imagery rule below:** this is the single highest-visibility
  surface in the product, and the previous shipped version used photographic sample images
  rather than neutral placeholders. `image`-typed fields here render a photo (a seeded,
  deterministic third-party image service), not the `public/demo/` SVGs. The image source
  is out-of-repo and therefore a real, accepted dependency: if it is unreachable the
  affected background simply doesn't load; nothing else on the page depends on it.
- **Same exception on `/catalog/[slug]`:** a template's own detail page runs the identical
  demo unit built the same way (`lib/template-demo.ts`), so it uses the same photographic
  imagery rather than the neutral SVGs — a gray placeholder well right below "how it
  works" reads as broken, not neutral. The catalog **grid** (`CatalogGrid`, tiles on
  `/catalog` and the landing teaser) is unaffected: it renders no unit and no imagery at
  all, so the placeholder-imagery rule below still applies wherever a `public/demo/` SVG
  would otherwise be the only option (e.g. a future static thumbnail).

### Free tools — the public utility surface

`/tools/vast-validator` and `/tools/vast-generator` are public, unauthenticated pages that
exist to be found by someone with a broken ad tag ([ADR-0013](decisions/0013-public-free-tools-section.md)).
There is no `/tools` index page; the two are listed together only in the top-bar dropdown
("Nav dropdown" above). They are held to the same system as the dashboard, with two points
worth stating because the temptation to relax them is highest on a marketing-adjacent
surface.

- **One well, same as anywhere.** The validator plays a real ad, so it gets the serving
  well (§7) and the page gets no second dark surface.
- **Accent budget is one**, spent on the single primary that starts a run. A tool page is
  a workbench: everything else on it is secondary or a link.

- **One click starts a run.** The page has a single verb. Analysis and playback are two
  mechanisms, not two steps the visitor performs, and a tool that makes you press a
  second button to see the thing you asked for has mistaken its internals for a workflow.

The validator is two columns from `lg` up and one below it: the well and the run timeline
on the left, the settings, the verdict strip and the recommendations on the right.
Reference tables — interactive standards, the feature matrix, the wrapper chain,
parser-versus-player — sit under both columns as collapsed `<details>`, because they
answer a follow-up rather than the question the visitor arrived with. A report that runs
as one 4,000px column is not thorough, only tall.

Rows take a state rail where they carry state and none where they do not. The
recommendations list rails on severity (`dead` / `warn` / `info`, §3) **and is grouped by
it**, one group per level, so severity is legible from the shape of the page rather than
only from a word. The wrapper-chain table rails on HTTP outcome, dropping to transparent
when the status is unknown, because an unreachable hop has nothing to encode; the feature
matrix does **not** rail, because "this tag does not use Mezzanine" is an absence, not a
state — a rail on every row would be exactly the decorative rail this system forbids. The
interactive-standards table, the run timeline and the parser-versus-player comparison all
rail too, each on a state of its own. That list is illustrative, not exhaustive: the
general rule above decides every case.

**There is exactly one findings list.** An earlier version shipped a per-rule "Findings"
table *and* a curated "Recommendations" list beneath it, saying the same things twice at
two altitudes; a reader who notices that once learns to skim both. Advice a rule already
carries in its own `hint` does not get a second home.

The run timeline carries the tracking URL each event would fire, in its own column, rather
than repeating the event list as a separate tracker table. The join is by event name, not
by observation — no player reports which URL it actually requested — and the column's
tooltip says so. A tool that presents an inference as a measurement is worse than one that
omits it.

The pasted-XML input is the one place the mono rule is load-bearing rather than aesthetic:
it holds a VAST document, and a proportional face makes indentation unreadable.

### Configurator sections and the outcome matrix

A template's `config_schema` can group its fields ([ADR-0011](decisions/0011-conditional-grouped-config-schemas.md)),
and a group renders one of two ways.

**Section** (the default) — a `<fieldset>` whose legend is the `h2` role (15/22, 600),
separated by `border-t border-hairline`, per §5. Deliberately not `label-instr`: that role
belongs to the field labels *inside* the section, and reusing it flattens the two levels
into one. **Every section takes the rule, including the first** — the configurator always
renders the creative-name field and the delivery-format control above the schema-driven
groups, so there is never a section with nothing over it. The legend needs
`float-left w-full`, or the fieldset's border-notch algorithm cuts a gap in the rule
around the heading.

**Matrix** — for a group whose blocks are variants of one thing, such as the quiz's eight
answer-path exits. Rendering 24 inputs flat is the wall this exists to avoid.

- It carries the **data-table row treatment** (above) — 44px rows, a 3px semantic rail,
  `padding-left` cut to 13px — not a card grid and not an ad-hoc accordion. The markup is
  a disclosure list rather than a real `<table>`, which is the right choice for expandable
  rows; take the treatment, not the element.
- The rail carries a **real** state — configured (`live`) or empty (`idle`) — never a
  decorative one. Not `dead`: an unfinished row is incomplete, not an alarm.
- The row's label is machine text (the answer path, `A → A → B`) in mono, so it is
  identical in both locales and needs no dictionary entry (§8).
- **One block open at a time**, marked with `bg-surface-sunken` so the row merges into the
  panel it opens. **Accent budget spent: zero**; the page's single warm element stays the
  submit button. Not `bg-fill`: `idle-fg` on `fill` measures **4.49:1**, just under the
  4.5:1 small-text threshold, and "open but still empty" is the row a user looks at most.
  That pairing is off-limits for a state word anywhere until `--color-idle-fg` is darkened
  and re-measured.
- The container must not be `overflow-hidden`, or the 2px-offset focus ring on a row is
  clipped away (§3) — which is also why it cannot use `Panel`. Round the first and last
  row instead.
- A chevron may accompany the row, `aria-hidden`, because the row's accessible name is
  the path itself — an icon is never the whole action (§9).
- A completion counter (`ЗАПОЛНЕНО N / 8`) sits below in `label-instr`, because closed
  rows submit through hidden inputs and so cannot use native `required`; the form
  validates them itself rather than letting a server redirect discard the whole draft.

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
- The delivery strip reads left to right in the order the events can occur:
  **impression → click**. It is a closed, sequential set — a metric that is
  conditional on something other than "did the aggregate load" (see below) does not
  belong in it, even if it is a count of the same shape.

  It used to be six: impression → start → q25 → q50 → q75 → complete. The five
  video-progress trackers — start, the three quartiles and complete — were removed in
  [ADR-0016](decisions/0016-three-events-hourly-counters.md) — they cost a
  player-fired beacon each to reproduce numbers the buyer's own DSP already
  reports. The rule that survives is the shape, not the membership: whatever is in
  the strip must be sequential, unconditional, and read left to right.
- **A metric that is structurally not applicable to this row is a third state,
  not the unmeasurable dash.** "Unmeasurable" (`statsAvailable === false`) is
  transient and page-wide — the aggregate genuinely failed to load, and every
  metric on the page is affected identically. "Not applicable" is permanent and
  row-specific — the metric will never exist for this row, by a property of the
  row itself (e.g. viewability for a SIMID creative: measured by the
  advertiser's OMID vendor, never ingested by us — [ADR-0012](decisions/0012-viewability-measurement.md)).
  Printing the same em dash in the same weight for both teaches the reader that
  a permanent absence and a temporary outage look identical, which is exactly
  the confusion this section exists to prevent for zero-vs-dash. The "not
  applicable" reading prints the em dash in `text-fg-disabled` (not the
  unmeasurable dash's `text-fg`) with a `caption`-role explanation beneath —
  the metric's own qualifier slot, not a page-level banner — naming what does
  measure it. A metric that can be N/A for some rows and a real reading for
  others (viewability today; anything format- or plan-conditional later) does
  not belong inside the closed delivery-funnel strip above — give it its own
  labelled strip so a missing reading never turns a clean divisor into a
  ragged grid, and so its distinct third state reads as deliberately separate,
  not as a broken tile in the funnel.
- **No derived ratio without the counts it comes from**, and no derived ratio at all where
  the underlying event is not ingested. Today the product records exactly three
  ([ADR-0016](decisions/0016-three-events-hourly-counters.md)): **impression**,
  **click** (fired only from the final call-to-action that opens the advertiser's
  URL — never from an intermediate interaction such as a quiz answer), and
  **viewable** (VPAID-only, self-reported). There is still no error event and no
  count of ad requests, so **error rate and fill rate may not appear on any screen**.
  CTR became derivable when click arrived and **is displayed, over impressions**.
  Two rules come with it, and they generalise to any ratio added later:
  - **A derived ratio may close the delivery strip, never sit inside it.** The
    counts are a sequential set of things that happened; a ratio is a reading
    about them. It goes last, after the counts it comes from.
  - **Its qualifier names the denominator, always.** "of impressions", not a bare
    percentage. Impressions and viewable impressions give different numbers, and a
    buyer reading an unlabelled CTR will assume whichever is worse for us.
  With no impressions yet the ratio is genuinely not measurable, so it prints the
  em dash — the transient one, in `text-fg`: it becomes measurable the moment
  delivery starts. It is not `0%`, which would be a claim that nobody clicked.

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

A player may mark a status with a **tone**, which raises it out of that line into a
full-width `Notice` (§6) under the well; the line goes quiet meanwhile, so one sentence is
never in two places. The line is sized for three words, and a condition the viewer has to
*act* on is prose. The case this exists for is the IMA tab meeting an ad blocker: the SDK
is a third-party script from an ad-serving domain, and the notice has to say so plainly,
name the address to allow, and state that the creative is not the problem. It is `info`,
not `dead` — nothing about the account, the tag or the creative is failing, and red is the
vocabulary a buyer reads as "my ad is dead". The address rides along as the notice's mono
`detail`: it is a value to copy, not prose.

The validator (§6) raises the same notice under its own well, but reads the condition off
its **timeline** rather than from a status line, because that surface already records every
stage event and a second source for one fact could disagree with the first. Both quote the
address from the one constant the loader actually requests.

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
  scrub bar. There is no scrub in the well today: the Sandbox harness draws none, and the
  Fluid tab's has been hidden along with the rest of its transport controls (below), so
  `--color-well-accent` is declared and deliberately unused. It becomes live the day a
  harness draws its own progress bar.
- **A third-party player's chrome does not belong in the well.** The Fluid tab runs as an
  ad-only outstream player — the `<video>` it wraps has no content — so its play button,
  scrub bar and `00:00 / 00:00` readout drive a video that does not exist, and a timecode
  frozen at zero under a running creative is a false readout, not merely clutter. The skin
  is ours rather than the publisher's; no DSP ships it, so it is not part of what the tab
  proves. **The whole control bar is hidden**, its 53px gradient scrim along with it. The
  players in this product are for *showing* a creative, not for operating one: a lone
  volume control surviving in an otherwise empty bar read as a stray mark floating over
  the creative rather than as a control, which is what settled it. Stated cost — the
  preview starts muted and nothing in this tab can unmute it, so a template with a base
  video is judged silently here. The rules live next to the component
  (`components/players/fluid-preview.css`), not in the token file — vendor chrome is not a
  design token. The creative's own close control (ADR-0009) is drawn inside the ad slot and
  is untouched by any of this. Machine data down there (URLs, timecodes)
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
  `templates` table and stay as authored — and so do a template's **`config_schema` field
  labels, help text, and select-option labels**, which are authored per template in the
  same row. They are the one place a Russian user sees English inside the dashboard chrome;
  a section *heading* is not, because groups are a closed set the product owns and they go
  through `configurator.groups`. Route a field label through i18n the day templates become
  user-authored rather than seeded. So does the sample content inside a demo
  creative — it is derived from the template's own `config_schema` defaults plus
  placeholder images (`public/demo/` on the catalog, seeded photographic placeholders on
  the landing hero — §6), which is stand-in advertiser material, not
  interface language. Technical status words that the ad industry uses in
  English (`Live`, `SIMID 1.1`, `VPAID 2.0`) are also left untranslated on purpose —
  translating them would make the dashboard harder to match against a DSP.
- **The public VAST endpoint is unaffected by language.** It has no session and no UI;
  no locale logic may be added to that path (see
  [architecture.md](architecture.md) and [security.md](security.md)).
- Every user-visible string goes through the i18n layer with both locales supplied. A
  hardcoded human-readable string in a component is a defect.
- **A developer-only surface is exempt from the bilingual requirement above, and from
  nothing else.** The creative harness (`/dev/harness`) and the `/api/dev/*` routes under
  the same gate answer 404 unless the request came from the developer's own machine, so
  no user reaches them in either language; routing their labels through
  `dictionaries.ts` would bury the shipping copy that file exists to police — the same
  reasoning this section already applies to `lib/vast-inspect/`'s rule catalogue. The
  copy rules below still bind (sentence case, controls name what happens, errors say what
  to do), and so does everything else in Instrument: tokens, the human/machine type
  split, the state-rail tables, one well, the accent budget of one. A dev tool that
  drifts is how a pattern gets re-invented and then copied back into the product. Scope
  is exactly "surfaces gated by `isLocalHeaders()`"; nothing reachable in production may
  cite it.
- **A domain dataset may carry its own bilingual payload instead**, provided a type makes
  both locales mandatory. The VAST validator's rule and feature catalogue
  (`lib/vast-inspect/`) is the case this exists for: roughly eighty rules, each keyed to an
  IAB spec clause, each with a message and a fix. They are data about the specification,
  not interface language, and folding 240 strings into `dictionaries.ts` would bury the UI
  copy that file exists to police. The enforcement is the same one the dictionary relies
  on — `Msg` is `{ ru: string; en: string }`, so the compiler refuses a half-translated
  entry exactly as `Dict` refuses a missing key. UI chrome around such a dataset — headings,
  buttons, column labels, empty states — still goes through the dictionary.
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
| ✕ | Derived-ratio metrics without the counts they come from. VTR and fill rate are barred outright — their events are not ingested. CTR is permitted since ADR-0016 made click a real count, but only with its denominator stated (§6). |
| ✕ | Raw Tailwind palette colours (`gray-200`, `green-100`, `blue-600`, …). Tokens only. |
| ✕ | Rounded pills as a default shape. 3px radius; `50%` only for the status dot. |
| ✕ | Icon-only actions, no exceptions. Verbs label actions; an icon accompanies a word. Tried once as a data-table space-saving device (a copy/edit/delete action cell) and retracted: even a spec-correct 18px icon with a proper stroke read as an indistinguishable speck once it had no word to lean on, confirmed twice from live screenshots and a DevTools inspection that ruled out a rendering bug — the icon was never the problem, having no label was. If a row's action cell is too narrow for labelled buttons, the fix is narrower *other* columns or a taller cell, not a smaller word. |
| ✕ | Flags for language, or a second theme. |
| ✓ | Density as respect: 44px rows, spacing in multiples of 4 — and the 32px readout density (§6) for system-emitted tables that are read rather than acted on. |
| ✓ | State encoded in form as well as colour. |
| ✓ | Both locales supplied for every new string — except on a developer-only surface, which no user reaches in either language (§8, and that carve-out only). |

## 10. Implementation

- Tokens live as CSS custom properties in `app/globals.css` and are exposed to Tailwind
  through the `@theme` block. Components consume tokens, never literal hex.
- Fonts are loaded with `next/font/google` (IBM Plex Sans, IBM Plex Mono) with Latin and
  Cyrillic subsets. Nothing may override `body`'s font stack.
- Any new colour, radius, shadow, or type size is a change to this document first — add
  the token here, then use it.

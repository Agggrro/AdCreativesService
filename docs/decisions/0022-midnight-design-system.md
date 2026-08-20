# 0022. "Midnight": one dark theme, a pastel warm accent, and creatives outside the system

- Status: Accepted
- Date: 2026-08-20
- Supersedes: [ADR-0007](0007-design-system-instrument.md)

## Context

[ADR-0007](0007-design-system-instrument.md) chose **Instrument** on one load-bearing
premise, stated in its own words: *"the dashboard, the configurator, and the preview —
not the landing page — are where users spend their time."* Everything followed from that
— a single light theme, a 30px display size, 32px controls, 3px radius, no shadows, and
a landing page that borrows the dashboard's language rather than the other way round.

The premise no longer holds. CreoSmith sells **interactive video creative** — a design
service. A prospect judges us by how the product looks before they ever configure
anything, and the surface that does the selling was four elements in a 1080px column:
a heading, a subtitle, a demo player, and one button. No sections, no footer anywhere in
the repository, and 7 responsive breakpoints across the entire codebase with `md:`,
`xl:` and `2xl:` at zero. ADR-0007 named its own risk — *"'restrained technical B2B' is
exactly where generic SaaS design lives"* — and answered it with rules rather than
decoration. On the dashboard that answer worked. On the sales surface it did not.

ADR-0007 also considered and rejected a **broadcast console** direction — dark-first,
video-suite feel — on the grounds that "a dark landing page is harder to make sell" and
that it "commits the product to a second theme we would then have to maintain." Both
objections are answered now rather than waved away: the first was a guess and the
mock-ups disproved it for a creative-services brand, and the second dissolves because
there is no second theme — the light one is retired, not kept alongside.

Three colourways were built as full landing-page mock-ups and compared: a literal
logo-derived palette, a warm light monochrome, and a dark one. The dark direction was
chosen by the product owner.

## Decision

**Midnight replaces Instrument.** One dark theme, no light theme, no toggle.

- **Ground `#0D0B0A`**, surface `#161311`, hairline `#2C2621`. Warm-biased throughout;
  no cold greys.
- **Accent: a warm pastel apricot `#E9A57B`**, meaning action or current selection.
  Pastel is forced, not stylistic: Instrument's Sienna `#A24B2E` measures **3.11:1** on
  this ground — below the text threshold. A warm accent on black *has* to be lightened,
  and the lighter tone also reads as the more expensive one.
- **The semantic ramp is rebuilt, not ported.** Measured against the new ground, all five
  of Instrument's state text tokens fail: `live-fg` 2.59, `info-fg` 2.41, `warn-fg` 2.30,
  `dead-fg` 2.33, `idle-fg` 3.57, against a 4.5:1 threshold. The `dead` rail `#B02537`
  measures 2.96 — under even the 3:1 non-text threshold, which would leave the alarm
  colour invisible. The ramp lightens to `live #63C79A`, `info #89B0EA`, `warn #A796EE`,
  `dead #EE8089`, `idle #A79E92` (7.4–9.5:1). It stays cold-versus-warm: warm is still
  action, cold is still alarm.
- **The player well is no longer "the one dark surface"** — the whole product is dark, so
  that phrase has no work left to do. The well is now separated by **elevation, not
  darkness**: it keeps the ground tone while the section around it lifts to `surface`,
  plus a hairline. Darkening it further is not an option — pure black against this ground
  measures **1.07:1**, so the well would simply disappear.
- **Scales replace single values.** Radius becomes 8 (control) / 12 (panel) / 16 (card) /
  20 (well) instead of a single 3px. The type scale becomes four tiers with tracking that
  changes sign — negative above ~32px, positive below ~16px — and ships as CSS utilities
  rather than as arbitrary values; 123 hardcoded `text-[Npx]` occurrences are what the
  absence of that scale produced.
- **Width is a container scale, and colour is what owns the monitor.** Section
  backgrounds run full-bleed while prose stays near 65 characters. This is measured
  practice, not preference: Stripe Atlas pins its content to 1080px — the same width we
  already had — and owns a wide display through edge-to-edge alternating bands, while
  tyver.io's 1440px container with no bands reads as a single floating sheet.
- **Motion is part of the system**: staggered reveals on scroll, 400–600ms,
  `cubic-bezier(.22,1,.36,1)`; transitions on named properties, never `all`;
  `prefers-reduced-motion` disables everything but colour changes. No animation library —
  CSS plus `IntersectionObserver`.

**Creative templates are outside the design system.** `runtime/templates/**` and
`runtime/lib/vpaid-base.js` are exempt from the palette, the type scale, the radius
scale, the spacing scale, and the shadow rule.

A creative renders inside a publisher's page, in an advertiser's campaign, wearing the
advertiser's brand — its colours come from the template's own `config_schema`
(`coverColor`, supplied imagery), not from ours. Binding a creative to CreoSmith's tokens
would not merely be unnecessary; it would be wrong, because it would put our brand inside
someone else's ad. This **codifies existing practice rather than changing behaviour**:
the templates already carry literal hex (`#e11d48`, `#3a3a3a`, `#1c1c1c`) and reference
no site token at all. Until now nothing said they were allowed to.

What still binds a template: the mandatory close control
([ADR-0009](0009-mandatory-close-control.md)), the full VPAID lifecycle, an `api.debug`
record per state transition, the [`creative-check`](../../.claude/skills/creative-check/SKILL.md)
gate at four slot sizes, and legibility — an advertiser may look like anything except
unreadable.

**What survives from Instrument**, because it was right and is independent of theme:
the human-writes-sans / machine-writes-mono split with `tabular-nums`; state rails on
tables and the rule that a row without a real state gets no rail; overlays portalled to
`<body>`; a visible focus ring at 2px offset that must never sit inside `overflow-hidden`;
no icon-only actions; both locales supplied for every string at the moment it is written;
and a rationed accent — reworded for a sales surface, but not lifted.

## Consequences

- **The entire product changes colour at once**, dashboard included. The semantic ramp,
  the tables, the configurator, the validator report and the three preview players all
  need re-measuring against dark surfaces, not merely restyling. This is the bulk of the
  work and it is not optional: a state colour that fails contrast is a defect in a tool
  people use to tell whether their ad is alive.
- **`--color-well-*` must be re-derived.** Those seven tokens were measured against a
  light-surrounded well. The ratios inside the well are unchanged, but the well's
  relationship to its surroundings is inverted, and the "one dark surface" framing that
  justified them is gone.
- **Any colour, radius, shadow, or type size is still a documentation change first.**
  That friction is what kept literal hex out of `.tsx` entirely under Instrument — the
  reason this palette swap is a `@theme` edit rather than a 60-file migration. It carries
  over unchanged.
- **The creative-template exemption is a real boundary, and it cuts both ways.** Nothing
  under `runtime/templates/**` is a precedent for anything in `app/` or `components/`, and
  a literal hex there may never be cited to justify one here. The exemption is scoped to
  files, not to arguments.
- **A dark-only product excludes users who need a light UI.** Instrument's single light
  theme had the same shape of cost pointed the other way, and ADR-0007 accepted it to
  avoid maintaining two themes. That trade is accepted again, in the same terms and for
  the same reason.
- **Two gates describe the old system in their own text** and would fail work built to
  this ADR: [`design-check`](../../.claude/skills/design-check/SKILL.md) opens by naming
  "a single light theme, a Sienna accent", and
  [`design-system-reviewer`](../../.claude/agents/design-system-reviewer.md) checks against
  it. Both are rewritten in the same change, or the gate starts rejecting the system it
  is supposed to enforce.

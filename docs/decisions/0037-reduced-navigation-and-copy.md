# 0037. Reduced navigation, one account menu, a leaner landing, and text that earns its place

- Status: Accepted
- Date: 2026-11-06
- Supersedes in part: [0008](0008-catalog-first-information-architecture.md) — the catalog stops being a section of the signed-in navigation; the rest of 0008 stands
- Amends: [0013](0013-public-free-tools-section.md) (what the Tools entry lists), [0034](0034-closed-beta-manual-entitlement.md) (the site strip and the access page)

## Context

A review of the whole UI against four complaints from the owner — a navigation that kept
growing, settings forms that run to several screens, a 340px logo stage in front of the offer
on `/`, and explanatory text on every page — produced a redesign drawn end to end on a private
design canvas (23 screens at 1280×720, 1920, 2560 and 390×844) and accepted by the owner on
2026-11-06. Measured on the build of that date, at 1280×720:

- the signed-in bar carried seven elements: Catalog, My creatives, Access, Tools, the
  language control, the address and Sign out;
- `/` was six screens tall; its headline sat at y=629 and its call to action at y=911;
- a creative's settings were 1.1 (Scratch & Reveal) to 5.7 (Step Builder) screens tall.

The redesign is large, so it ships in steps. This record is the whole direction; the commit of
each step says what that step delivered.

## Decision

**Navigation.** The signed-in bar is *Creatives*, *Tools ▾* and *Account ▾*. The account menu
holds the address, the access state (*Access granted* / *No access*), *Postback*, for an admin
*Accounts*, the `RU | EN` control and *Sign out*. A signed-out visitor's bar is unchanged
(Catalog, Tools, `RU | EN`, Sign in, Get started). The Tools dropdown lists the two tools by
name: both are available, so a state word and a sentence under each said nothing. Below `lg`
the same rows end the mobile sheet, which scrolls inside itself: the bar is sticky, and a
signed-in sheet is taller than a phone on its side.

**Access stops being a page.** `/dashboard/access` and `/dashboard/subscriptions` redirect to
Creatives. The state is a row of the account menu; the request is one notice at the top of
Creatives for an account that has no access (`AccessNotice`). The site-wide closed-beta strip
(`ClosedBetaStrip`) is removed: it was the first thing a visitor read on every page. A
signed-out visitor learns that the product is in closed beta from the landing's note.

**The catalog leaves the signed-in navigation.** It stays public and indexed. Creation still
begins there, through *New creative* on Creatives, until the template picker (below) replaces
that path.

**The landing.** The brand stage is removed; the monogram is the 28px lockup in the bar. From
`lg` the first screen is two columns: headline, one line, one call to action and the beta note
beside the live demo well and its switcher. Below the hero: four step titles and an example
tag, the template grid in its teaser form (preview and name), the four standards and the two
tools by name, one closing call to action, and a footer of a copyright and three links. The
headline takes `display-sm`; the 76px `display` role is deleted.

**Text earns its place.** Every string answers five questions — does it change what the
reader does; is it already said next to it; does it restate the name or the obvious; does it
repeat without telling things apart; does it say the same shorter. Page subtitles under titles
are removed (catalog, the two tools, postback, creatives, the configurator, the video editor,
the accounts list, sign-in and sign-up) and `PageHeader` loses its subtitle prop, together
with the dictionary strings only they used. The rule is written into
[design-system.md](../design-system.md) §10.

**Planned, not delivered by the first step.** Each gets its own amendment when it ships: a
template picker sheet in place of catalog → template page → configure; a creative as one
workspace with *Settings | Stats* tabs, an outline and a one-section inspector, replacing the
long configurator form; search and filter on Creatives; the two tools inside the same
workspace shell; the matching phone layouts.

## Consequences

- ADR-0008's "three sections" no longer describes the navigation; its other decisions (public
  catalog, demo config from schema defaults, owner-scoped aggregate, honest metrics) stand.
- A signed-in user is one click further from *Sign out* and *Postback* (they are in the menu)
  and has no *Catalog* link in the bar; *New creative* on Creatives is the way in.
- A participant sees no closed-beta text anywhere; an account without access sees it once,
  where it matters.
- Template names and descriptions, and a template's schema labels, stay in the database in
  English only ([design-system.md](../design-system.md) §10). The shorter Russian descriptions
  drawn on the canvas need `templates` to be localised, which this step does not do.
- Removing `display` and the brand stage deletes `type-display`, `.brand-halo`, `.brand-play`
  and `ui/BrandStage.tsx`. The monogram's geometry stays exported for the icon routes.

# 0038. A creative as a workspace: Settings and Stats, an inspector, a template sheet

- Status: Accepted
- Date: 2026-11-06
- Amends: [0037](0037-reduced-navigation-and-copy.md) — delivers what it listed as planned (the template picker, the workspace, search on Creatives); [0011](0011-conditional-grouped-config-schemas.md), [0030](0030-duel-template.md), [0031](0031-step-builder-and-forwarded-picks.md) — how their groups are drawn

## Context

The first step of the redesign (ADR-0037) cut the navigation, the landing and the text. Three of the owner's complaints were left, and they were measured on the build of 2026-11-06 at 1280×720:

- **Settings sprawl.** A creative's settings were one long form: 1.1 screens for Scratch & Reveal, 2.2 for Duel, 4.6 for Step Builder (5.7 with the preview beside it). Sections stacked, the outcome matrix and the options tables inside them, and the live player sat in a sticky column that scrolled with the page.
- **Statistics buried.** A creative's page was 1.5 screens; the VAST tag was its fourth block, conversions and errors lay below the fold, and *Copy tag* — the action most people open a creative for — needed a scroll.
- **Three pages to start.** Creating a creative was catalog → template page → *Configure creative*: three clicks and three page loads before the first field.

## Decision

**A creative is a workspace with two sections, Settings and Stats.** Both are full-viewport screens with a bar of their own (`WorkspaceBar`, 48px) in place of the product bar: the way back to *Creatives*, the name, the format and the serving state, the **Settings | Stats** switch, and on the right *More*, *Copy tag* and the screen's one primary. The two sections keep their addresses (`/dashboard/creatives/[id]/edit`, `/dashboard/creatives/[id]`), so every existing link lands where it did. The product bar stays on the list-like pages (Creatives, the postback, the accounts) through `DashboardShell`; the dashboard layout keeps only the check that there is a signed-in viewer.

**Settings is an outline, a stage and an inspector.** The outline lists a template's sections — a schema group is a section, except that an `options` or a `matrix` group belongs to the group before it — with a rail that says whether a section is complete. The stage is the player well as large as the screen leaves it, with the player chosen from a menu. The inspector shows one section's fields in 340px. At 1280×720 a section is one screen. Templates of six to eight fields have no outline: one inspector. What the form posts is unchanged — every active field under its own name, the same Server Actions, the same `buildConfigFromValues` — and the sections the inspector is not showing post through hidden inputs. A save that would be refused for a required field in one of them is caught first, and the section, the field and the reason are shown.

**Stats is one screen.** Delivery, viewability and errors; the conversions strip; errors by code and conversions by exit in two panels, three rows each and *Show all* in place; by-goal and by-day behind disclosures. *Copy tag* is always in the bar, and is the screen's accent.

**New creative is a sheet.** *New creative* opens a dialog over the list — the templates and, beside them, the selected one's preview, standards and description — and *Configure creative* goes to the workspace on its first field. The VAST video generator is the last row. `/dashboard/creatives/new` without a template opens the list with the sheet open, and the catalog's own links (`/catalog`, `/catalog/[slug]`) are unchanged.

**Creatives gets search and a filter by state, and per-row *Copy tag*, *Edit*, *More*.** Client-side over the rows the page already has: an account's creatives are dozens. *More* (the validator, duplicate, delete) is the same menu as the workspace's, portalled in a row, whose scroll frame would clip it.

## Consequences

- `ConfiguratorForm`, `ScenarioGrid`, `OutcomeMatrix` and `CreativesTable` are replaced by `ConfiguratorWorkspace`, the inspector's `OptionRows` / `ScenarioRows` / `OutcomeDrill` and `CreativesList`. A template needs no code: the sections come from its `config_schema` groups, and no schema changed — there is no migration and nothing to backfill.
- The workspace is the second exception to "every page goes through `ui/Container`" and to a persistent product bar. The design system says so (§5, §6 "Workspace"): *Creatives* in the bar is the navigation there, at every width.
- A creative's settings can no longer be skimmed in one scroll; they are read a section at a time. The outline's rail is what keeps the whole in view — a section turns `live` when its required fields are filled.
- A save is refused in the browser for a missing required field wherever it is, with its place named (`A → B · Heading`), where it used to be refused by the server with the whole form lost. The server's check stays, as the only one that counts.
- *Show all*, the disclosures and the sheet are client state over server-rendered rows; no new data is read. The Stats page reads what it read.
- VAST video creatives keep the generator's own form for editing, inside the product bar; their Stats are the workspace's. Bringing the generator into the workspace is the next step, with the validator (below).
- The VAST generator and validator pages and the phone layouts of the tools are not part of this record; see the next amendment to ADR-0037.

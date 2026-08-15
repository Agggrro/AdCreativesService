# 0013. A public free-tools section, and a nav for signed-out visitors

- Status: Accepted
- Date: 2026-08-15

## Context

[ADR-0008](0008-catalog-first-information-architecture.md) fixed the product's
information architecture at three sections — Каталог · Мои креативы · Подписки —
and that decision has held. This change adds a fourth, `/tools`, which is an
IA-level change and therefore needs its own record rather than an edit to
ADR-0008's list.

The reason is acquisition rather than product surface area. "vast validator" is
something ad ops people search for on a bad afternoon, and the market for it is
crowded but shallow: the official IAB validator handles VAST 2.0/3.0/4.1 and
does not play the tag, Google's Video Suite Inspector plays the tag but produces
no structured report, and the commercial testers are closed. None of them treat
the interactive layer — VPAID, SIMID, OMID — as more than a footnote. That layer
is the entire subject of this product, so a validator is simultaneously the most
useful free tool we could build and the most direct demonstration of what we
know.

Two tools are planned. The **VAST validator** ships here. The **VAST generator**
is a placeholder route, deliberately a real page rather than a disabled row, so
the index links somewhere that explains itself.

## Decision

**`/tools` is public and unauthenticated**, as is everything under it. It reads
no database and holds no session.

**The signed-out nav changes from empty to a shorter list.** `AppTopBar`
previously rendered `nav={user ? mainNav(dict) : []}`, on the reasoning that two
of the three sections would bounce a visitor to the login screen. That reasoning
never applied to the catalog, and it applies even less to a free tool whose whole
audience is people without an account. `lib/nav.ts` now exports `publicNav()`
(catalog + tools) alongside `mainNav()` (all four), and the top bar picks between
them. The active-section underline is exempt from the accent budget
(`docs/design-system.md` §3), so a fourth tab costs nothing there.

**`/api/tools/*` is excluded from the middleware matcher.** The routes are
public, and the `/hop` route in particular sits inside a player's wrapper
resolution timeout, where a Supabase `getUser()` round trip per hop is pure
latency for no benefit. The `/tools` *pages* stay inside the matcher, because
they render the top bar and need to know whether the visitor is signed in. This
follows the precedent already set by `api/track` and `api/preview-unit`.

**Nothing a user checks is stored.** No database table, no bucket, no log of
submitted tags. A report exists in the page's React state and leaves only if the
user copies or downloads it. For URL-mode runs the tag is mirrored into `?tag=`,
which makes a run shareable and repeatable while still storing nothing on our
side; pasted XML has no equivalent, so its share affordances are copy and
download. This was a deliberate product choice, and it is also what keeps us from
becoming a custodian of other companies' ad tags.

**Access is open — no login, no rate limit.** See the Consequences below; this is
a known, accepted exposure rather than an oversight.

**The tools index is a table, not a tile grid.** `docs/design-system.md` §6 gives
the catalog the product's one grid, and gives the reason: a template carries no
state. A tool does — available or not yet — so it takes the data-table treatment
with a real rail. The design system is amended alongside this ADR with a short
"Free tools" section recording that, and with the `warn` semantic token the
validator's three-level severity needs.

## Consequences

- **The IA is now four sections.** A fifth should be resisted; the top bar is the
  product's one persistent piece of chrome, and it degrades quickly past this.
- **`publicNav` is a second list to maintain.** Any new section has to be
  classified as public or not. That is a small, explicit cost in exchange for
  never again hiding a public page from the people it was built for.
- **The validator is a public endpoint that fetches URLs a stranger chose** —
  the first in this codebase. Every guard that makes that safe is in
  `lib/vast-inspect/fetch-tag.ts` and documented in `docs/security.md`.
- **There is no rate limit, by decision.** Nothing is persisted, so the exposure
  is compute and egress rather than data, and the fetcher's per-request caps
  (5 s deadline, 512 KB, 5 redirects, 5 hops) bound the cost of any single call.
  What is not bounded is the number of calls. This is the first surface where
  `docs/security.md`'s long-standing "rate limiting is a named, unimplemented
  gap" has real consequences, and it should be the thing that finally motivates
  fixing it.
- **The generator's placeholder is a promise with a date attached to nothing.**
  If it stays a placeholder for long it reads worse than not listing it, so it
  should either ship or come off the index.

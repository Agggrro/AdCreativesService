# 0014. The VAST inspection engine — prose-derived rules, and dry-run by substitution

- Status: Accepted
- Date: 2026-08-15

## Context

The validator ([ADR-0013](0013-public-free-tools-section.md)) needs to do two
things this codebase had never done: read VAST rather than write it, and play a
tag that belongs to someone else.

Reading is new territory. `lib/vast/` generates VAST by string templating and
`lib/vast/xml.ts` is escape-only; there was no parser, by an explicit earlier
decision ([ADR-0006](0006-live-preview-token.md)). Playing someone else's tag is
newer still, because a VAST document's entire purpose is to make a player fire
other people's pixels — and on a public tool, those pixels belong to strangers
who did not ask us to inflate their impression counts or spend their budget.

## Decision

### Validate against prose, not against an XSD

The rule catalogue in `lib/vast-inspect/rules/` is hand-written, one small
self-describing object per rule, each citing the clause it enforces.

XSD validation was rejected for three independent reasons, any one of which would
have been sufficient. There is no published XSD for VAST 4.3 at all, so the
newest version could not be covered. XSD cannot express most of what actually
breaks a player: that a tracking URL is `http` on an `https` page, that a
`MediaFile` claims `video/mp4` and ends in `.webm`, that `AdVerifications` sits
in `Extensions` where VAST 4.0 put it in a document declaring 4.1. And an XSD
validator's output is a schema violation, not an explanation — a person holding a
broken tag needs to know what to change.

**Version attribution comes from the XSDs and the specification prose, never
from secondary sources.** This is a rule with a scar behind it: the first cut of
this catalogue raised a hard error on `apiFramework="VPAID"` in a VAST 4.3
document, on the strength of a third-party validator's documentation. VAST 4.3
does not remove VPAID — its change list adds SIMID support and error code 902,
and it still documents what to include "if VPAID support is indicated in the
request" — so the rule invented a spec violation on a conformant tag, which is
the worst thing a validator can do. Deprecation begins at 4.1 (§1.8), not 4.0.
Three neighbouring facts were wrong the same way and are now taken from the
XSDs: `InteractiveCreativeFile` is 4.0 (4.1 added `variableDuration`), `Pricing`
is 3.0, and `interactiveStart` — the event a SIMID creative fires — is in the 4.2
enumeration.

Running one on Vercel is also impractical: every Node XSD library is either a
native binding or a Java shell-out.

Each rule therefore carries its own severity, its version gate, its spec
reference, and both locales of its message and its fix. Rule copy deliberately
does **not** live in `lib/i18n/dictionaries.ts`: there are roughly eighty rules,
they are a domain dataset rather than interface chrome, and keeping RU and EN
next to the rule is what stops them drifting apart. `docs/design-system.md` §8's
requirement — both locales supplied at the moment a string is written — is met;
the dictionary stays navigable. UI chrome around the report goes through the
dictionary as normal.

`fast-xml-parser` is the one new dependency: pure JS, no native build, and it
ships an `XMLValidator` that reports well-formedness with a line and column,
which is exactly IAB error 100. Well-formedness is checked separately and first,
because the parser is deliberately lenient and would otherwise hand back a
partial tree for a truncated document — analysing half a tag as though it were a
whole one is the one thing a validator must never do.

`@dailymotion/vast-client` was rejected despite being the obvious choice. It
normalises a document into a clean model, and normalisation destroys precisely
the defects we exist to find.

### Severity is three-valued

`error` violates the spec at the version the tag declares. `warning` is legal but
known to break in a meaningful slice of the market. `advisory` works everywhere
and is an opportunity. Collapsing the middle would erase the difference between
"this will bite you" and "you could do better", which is what the report is read
for. It required a new `warn` colour token; `docs/design-system.md` §3 records
why it is violet and not amber.

### Dry-run works by substituting the document, not by intercepting requests

Intercepting the player's network calls is not possible. Google IMA issues them
from its own cross-origin bridge frame, which nothing on the page can reach.

So the document is substituted instead. `lib/vast-inspect/neutralize.ts` rewrites
every element whose content a player will request unprompted — `Impression`,
`Tracking`, `ClickTracking`, `Error`, the viewability trio, the companion and
icon trackers — to point at `/api/tools/vast/void`, which answers 204 and
discards. Every `<VASTAdTagURI>` is rewritten to `/api/tools/vast/hop`, carrying
the real next hop inside an HMAC-signed token, so that hop is fetched by us,
neutralized in turn, and handed back. The chain therefore keeps its exact shape —
same hop count, same order, same wrapper semantics — while nothing reaches a
third party.

This rewrites the raw source rather than re-serialising the parsed tree.
Comments, namespaces, entity choices and CDATA boundaries all survive untouched,
so the player parses something as close to the original as it can be while still
being safe.

**`JavaScriptResource` and `ExecutableResource` are neutralized too**, which is
wider than the tracker inventory in `trackers.ts`. A verification script is not a
pixel, but loading it executes a measurement vendor's code, which beacons on its
own and bills per measured impression. Suppressing it costs the ability to prove
the script loads — which is what the live toggle is for — and that is the cheaper
of the two mistakes.

**What is deliberately not neutralized** is as considered as what is.
`MediaFile`, `Mezzanine`, `InteractiveCreativeFile` and `ClickThrough` all stay
intact: they are what the ad *is*, not what counts it, and finding out whether
they work is the point of playing the tag at all.

In live mode the player receives the user's original tag, byte-identical, and
everything fires for real.

Nothing about a run is stored server-side. The state a hop needs travels in its
signed token.

### The player is Google IMA, and it is checked against the parser

IMA is the reference implementation of the market: a tag that fails there fails
nearly everywhere. It is the only player this codebase hosts that reports numeric
error codes, it accepts a raw document via `adsResponse` — which is the only way
pasted XML can be played at all — and it exposes a full event set and `getAd()`
metadata.

That last one buys something no other validator offers. Our parser says what the
XML declares; IMA says what a real SDK actually resolved. `ParserVsPlayer`
compares duration, UniversalAdId, media dimensions, AdSystem, apiFramework and
wrapper depth, and shows the disagreements. A validator that only reads XML
cannot see that a declared 30-second spot resolved to 15 seconds; a player that
only plays cannot see that the document said otherwise.

`AdEvent.Type.LOG` is surfaced as well — IMA's own non-fatal diagnostics, which
are frequently the only clue when a tag "works" but silently drops a creative.

`components/validator/ValidatorStage.tsx` is a sibling of `ImaPlayer`, not a fork
of it. `ImaPlayer` keeps its `PreviewMint` contract, which is right for the
configurator and wrong here. They share `loadImaSdk()`.
`PreviewPlayerProps` gained an **optional** `onEvent`, so the three existing
players compile untouched and can be instrumented later.

## Consequences

- **The rule catalogue is a maintenance commitment.** Every VAST release means
  reading prose and writing rules. That is the cost of the accuracy an XSD could
  not have given us, and the catalogue's shape — one self-describing object per
  rule — is what keeps that cost linear.
- **Dry-run and live can disagree, and the report says so.** In dry-run the
  document is served from our own origin, so a CORS fault that would break the
  live run cannot appear. That is surfaced as an explicit notice rather than
  hidden; the honest framing is that dry-run tests the tag and live also tests
  its delivery.
- **In dry-run, verification scripts do not load**, so an OMID integration cannot
  be proved working in that mode. The live toggle exists for that.
- **The fetcher is the SSRF boundary for the whole product.** Any future feature
  that fetches a user-supplied URL should go through
  `lib/vast-inspect/fetch-tag.ts` rather than reimplementing its guards. See
  `docs/security.md`.
- **`onEvent` is optional forever, or it stops being additive.** Making it
  required later would be a breaking change to three players that do not want it.
- **Our own generator is now checkable by our own validator.** The fixture corpus
  includes output from `/api/vast`, and it passing is a real self-consistency
  test: if the validator flags our own SIMID or VPAID output, the defect is in
  the generator.

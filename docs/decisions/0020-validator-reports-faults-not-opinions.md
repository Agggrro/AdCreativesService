# 0020. The validator reports faults, not opinions

- Status: Accepted
- Date: 2026-08-19

## Context

[ADR-0014](0014-vast-inspection-engine.md) built the inspection engine and gave it a
three-valued severity: a violation of the declared specification is an error, something
legal but broken in part of the market is a warning, an unused capability is an advisory.
The severities are right. What went wrong is what got *put* in them.

Running our own creatives through our own validator produced six findings. Three were
real and two of those were our generator's bugs — a missing `AdServingId` and an
`<InLine>` child order that does not match the XSD sequence; both are fixed in
`lib/vast/builder.ts` rather than argued away. The other three were the validator being
opinionated:

- **VPAID is deprecated.** True, and useless. A buyer who has configured a VPAID creative
  has already decided; the tool restating IAB's position on every run is a lecture, not a
  finding. Worse, it was a *warning*, so every one of our own tags failed its own check.
- **No `Mezzanine`.** Mezzanine is a high-quality source an SSAI platform transcodes its
  own renditions from. A VPAID unit is executable JavaScript; there is no video asset to
  hand over. The advice cannot be taken.
- **No `ViewableImpression`.** That element asks the *player* to measure viewability. A
  VPAID unit measures its own and reports it over its own channel
  ([ADR-0012](0012-viewability-measurement.md)). The advice is already answered.

A fourth, **no plain-video fallback beside a VPAID `MediaFile`**, was reported as a
warning. It is a genuine cost — a player that cannot run VPAID, which is all of CTV,
renders nothing — but it is not a spec violation: `<MediaFiles>` is a list of candidates
a player picks from by capability, and a VPAID-only list is conformant. It is also
unactionable for an image-only creative, which has no video to fall back to.

Separately, the report said everything twice. A per-rule "Findings" list was followed by
a curated "Recommendations" list restating the same problems at a higher altitude, and a
"Tracking" table restated the timeline's event vocabulary one screen further down.

## Decision

**A finding must be something the reader can act on, at a severity that matches what it
will actually cost them.** Four consequences:

1. `VPAID-deprecated` is **deleted**, not downgraded. There is no severity at which
   "you chose a legacy standard on purpose" is worth a row.
2. `VAST-mezzanine-recommended` and `VAST-viewable-impression` **do not apply when the
   creative declares VPAID**. They still apply everywhere else, and the fixture corpus
   pins both halves — absent on the VPAID fixture, present on the plain linear one.
3. `VPAID-no-video-fallback` drops from `warning` to `advisory`. The fact stays in the
   report; it stops deciding the verdict.
4. **One findings list**, grouped by severity, replacing both the old "Findings" block and
   the curated "Recommendations" block. `buildRecommendations()` is deleted: every
   sentence it carried already existed in the corresponding rule's own `hint`, and a
   reader who notices the duplication once learns to skim both.

**And the report must not present an inference as an observation.** The timeline now
carries the tracking address each event would fire, replacing the separate tracker table.
No player reports which URL it actually requested — the addresses are matched to events by
name (`firstQuartile` ↔ `Tracking event="firstQuartile"`) — so the column's tooltip says
so in as many words. Trackers that matched no event are listed under the timeline as
declared-but-never-fired, and take **no state rail**, because a rail would assert an
outcome we did not measure.

## Consequences

Our own creatives now pass their own validator: zero errors, zero warnings, three
advisories that are all genuinely optional. That was the point — a validator its own
author's output cannot pass is a validator nobody trusts.

The engine keeps knowing that VPAID is deprecated from 4.1 and never removed; that fact is
still load-bearing, because it is *why* a VPAID creative in a 4.3 document must never be an
error. It is now used only to not raise one. `features.ts` still shows `deprecatedIn: 4.1`
in the capability matrix, which is the right place for a fact the reader may want and
the wrong place for advice.

The suppression in (2) makes two rules aware of a standard rather than only of an element,
which is a coupling the catalogue did not have before. Two things keep it honest. It reads
the **creative's own subtree**, never the document: gating it through `appliesTo` — which
runs once per document, while both rules report once per `InLine` — meant a single VPAID
node anywhere silenced the advice for every other ad in a pod. And the corpus pins the
behaviour in three directions: absent on an all-VPAID document, present on a plain linear
one, and present on a pod that mixes them.

`vpaidNodes` in `rules/kit.ts` is the shared predicate for *suppression* only. Detection of
VPAID for the report's own interactive panel (`report.ts`) and capability matrix
(`features.ts`) remains separate, because those answer a different question and want a
wider net — notably `<InteractiveCreativeFile apiFramework="VPAID">`, which suppression
deliberately does not count, since such a creative has a base video and both advisories
still apply to it. Three detectors is a real cost; collapsing them is worth doing, but
only with that difference preserved rather than flattened.

The name-based tracker join is the one place the tool infers rather than observes. Making
that legible in the UI is a standing obligation, not a one-off caveat: any future column
built on the same join has to carry the same disclosure.

Deleting a rule means the corpus can no longer assert it absent — an id-based assertion
goes green the moment someone reintroduces the same mistake under a new name. The
`vpaid-in-43.xml` fixture therefore keeps `maxErrors: 0` as the real guard, which is the
same reasoning ADR-0014 recorded when it first removed the hard error.

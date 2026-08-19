# AdTech Standards & Strategy

> Status: design phase. This is the domain knowledge that shapes the product.
> If you only read one doc before touching creative code, read this one.

## The standards, honestly

| Standard | What it is | Our stance |
| --- | --- | --- |
| **VAST 4.x** | XML envelope describing a video ad (media files, tracking, companions). The *transport*. | **Core.** We emit VAST 4.2 wrappers/inline for every creative. |
| **SIMID 1.1** | IAB's modern interactivity layer. Creative runs in an isolated iframe, talks to the player via `postMessage`. Replaces VPAID. | **Primary interactive standard.** Better security/perf model. |
| **VPAID 2.0** | Legacy interactivity. Runs arbitrary JS in the player's context. Deprecated by IAB; dropped/limited by many DSPs/SSPs (incl. Google Ad Manager). | **Supported as a chosen format** for reach with legacy DSPs — never the only path, and flagged as legacy in the UI. |
| **MRAID** | Rich-media API for **in-app display** ads inside app webviews. Not video, not VAST. | **Out of scope for v1.** Possible separate product line later. Do not conflate with the video pipeline. |
| **Interactive-image creatives** | Static image(s) + an interactive layer (scratch, slider, quiz, gate) rendered by a VPAID unit / SIMID iframe. | **In scope, video-delivered.** Runs on in-stream/out-stream **video** inventory via VPAID/SIMID over VAST — NOT display/MRAID. VPAID-first (image-only); SIMID needs a base loop. See [ADR-0005](decisions/0005-interactive-image-creatives.md). |
| **OMID / OM SDK** | Open Measurement for viewability/verification. Orthogonal to interactivity. | **Implemented for SIMID as a pass-through only** — the advertiser supplies a third-party vendor's script/parameters, we emit `<AdVerifications>`; we are not our own OMID vendor. VPAID instead gets a custom, self-reported, non-accredited viewability module (`runtime/lib/vpaid-base.js`). See [ADR-0012](decisions/0012-viewability-measurement.md). |

## Multi-format strategy (the product decision)

The user chooses the delivery format in the UI per creative. We do **not** bet on a
single standard. See [ADR-0002](decisions/0002-multi-format-creative-delivery.md).

- A **template** is authored once conceptually (e.g. "Shoppable Video") and
  **optimized into multiple format variants** (SIMID, VPAID, …). The template
  declares `supported_standards`.
- A **creative** (a user's configured instance) stores the user's **selected
  format(s)**. The VAST endpoint emits the matching variant via the format adapter.
- Adding a future standard = a new adapter + a new template variant. The DB, the
  endpoint contract, and the dashboard format-picker are all designed to be open to
  new formats without migration pain.

### How format shows up in VAST (implementation note)

- **SIMID:** interactive document referenced via `<InteractiveCreativeFile
  apiFramework="SIMID">` alongside the base `<MediaFiles>` video. Player renders the
  video and loads the SIMID doc in a sandboxed iframe.
- **VPAID:** `<MediaFile apiFramework="VPAID" type="application/javascript">`
  pointing at the VPAID JS unit, emitted **before** the optional base-video
  `<MediaFile>` fallback. VAST doesn't mandate an order, but Fluid Player decides
  whether an ad is VPAID by testing `mediaFileList[0].apiFramework` only — with the
  video first it silently plays the fallback and never loads the unit. Keep VPAID
  first; capability-based players are unaffected either way.
- **Declared `type` must match the actual file.** `baseVideoMediaFile()` sniffs the
  MIME type from the URL's extension rather than assuming `video/mp4` — a webm
  declared as mp4 is a spec violation a strict player is entitled to reject.
- **`<AdServingId>` is emitted, and `<InLine>`'s children are in schema order.**
  `AdServingId` is required and non-empty from VAST 4.1 (§3.4); an SSP that wraps our
  tag mints its own at its own level, which does not satisfy the `InLine`'s, and strict
  ingest parsers validate it here. The order is the XSD's `xs:sequence` —
  `AdSystem, Error, Impression, AdServingId, AdTitle, AdVerifications, Creatives` — which
  reads inverted because `Inline_type` extends `AdDefinitionBase_type` and the base's
  children come first. `lib/vast/builder.ts` and the inspector's
  `lib/vast-inspect/rules/ordering.ts` hold the same sequence; change both or neither.

The adapter layer hides these differences from the endpoint. Each adapter is
responsible for spec-conformant output — validate with the **`vast-spec-reviewer`**
subagent.

**Implemented in** [`lib/vast/`](../lib/vast): `builder.ts` (VAST 4.2 envelope,
`<AdParameters>` config injection, tracking, fail-closed `generateVast`),
`adapters/{simid,vpaid}.ts` (per-format `<MediaFiles>` nodes), `adapters/index.ts`
(registry + `getAdapter`), `xml.ts` (escaping/CDATA), `config.ts` (defensive
`config_json` parsing). Runtime units (Shop Now overlay) live in
[`runtime/shoppable/`](../runtime); per-creative config reaches them via
`<AdParameters>` at serve time (never baked in — ADR-0003).

## Reading VAST — the inspection engine

Everything above is about *emitting* VAST. [`lib/vast-inspect/`](../lib/vast-inspect)
does the opposite, for the public validator
([ADR-0014](decisions/0014-vast-inspection-engine.md)).

It validates against the **prose** of the specifications, not against an XSD.
There is no published XSD for VAST 4.3 at all, and XSD cannot express most of what
actually breaks a player: an `http` tracker on an `https` page, a `MediaFile`
declaring `video/mp4` for a `.webm` URL, an `AdVerifications` block left inside
`<Extensions>` where VAST 4.0 put it. Rules are gated on the version the document
declares, so a `skipoffset` in a 2.0 document is reported as unsupported rather
than as fine.

Version attribution is taken from the IAB XSDs and the specification prose, not
from secondary sources — several widely-repeated claims are wrong, and a
validator that repeats them invents violations. **VPAID is deprecated from VAST
4.1 and has never been removed**: 4.3's own change list only adds SIMID support
and error code 902, and 4.3 still documents what to include "if VPAID support is
indicated in the request". The engine knows this in order *not* to raise an error —
it no longer reports the deprecation at all, and suppresses the `Mezzanine` and
`ViewableImpression` advisories on a VPAID creative, which has no video asset to
transcode and measures its own viewability ([ADR-0020](decisions/0020-validator-reports-faults-not-opinions.md),
[ADR-0012](decisions/0012-viewability-measurement.md)). The fact still appears in the
capability matrix, where a fact belongs; it is not advice.
`InteractiveCreativeFile` is a **4.0** element, not
4.1; 4.1 added its `variableDuration` attribute. `Pricing` is 3.0. The
`interactiveStart` tracking event — the one a SIMID creative fires — arrived in
the 4.2 XSD.

The catalogue is pinned by a fixture corpus — `npm run check:vast`, against a
running dev server. It asserts that the clean fixture produces zero errors and
zero warnings, that each broken fixture reports the specific rules it was built
to trip, that named false positives stay absent, and that dry-run lets no
third-party tracker through while live mode passes the document byte-identical.
It also pins the VPAID advisory suppression in **three** directions — absent on the
all-VPAID fixture, present on the plain linear one, and present on a pod mixing the two.
The first alone would pass a bug that disabled those advisories outright; the first two
would pass one that scoped the suppression to the document instead of to the creative.
Run it after any change to the rules.

Coverage spans VAST 2.0–4.3, SIMID 1.2 and OMID, in ten groups: document, ad,
inline, linear, wrapper, tracking, interactive, verification, modern/CTV, and
delivery hygiene.

**Child order is checked for `InLine` and `Wrapper` only**, and the restriction is
deliberate. The schema models its containers with `xs:sequence`, so order is
normative — and because `Inline_type` extends `AdDefinitionBase_type`, the correct
order is base-then-derived, putting `<Error>` and `<Pricing>` *before* `<AdTitle>`.
That looks wrong and is not: IAB's own published sample is authored that way. But
the same schema orders `ClosedCaptionFiles` before `MediaFile`, and `Linear`
before `UniversalAdId`, which contradicts both the 4.3 prose and IAB's sample —
so `MediaFiles`, `Creative` and `Linear` are left unchecked rather than warned on
wrongly. Re-deriving any of them means checking the schema *and* real tags. Findings carry a severity, an XPath, a spec citation, both
locales of the message and its fix, and the IAB error code a player would report.
The interactive and verification groups mirror the invariants
[`.claude/agents/vast-spec-reviewer.md`](../.claude/agents/vast-spec-reviewer.md)
checks on our own output, which makes our generator checkable by our own
validator — a fixture in the corpus exists for exactly that.

The engine also reports what the tag *is*, not only what is wrong with it: which
VAST version's features it uses and which ones its declared version puts out of
reach, and a dedicated VPAID/SIMID/OMID panel. That panel is the part of the
report the rest of the market treats as a footnote, and it is the part that
matches what this product actually builds.

`<AdParameters>` carries the creative's **full `config_json`**, not just the fixed
subset (`videoUrl`, `clickThroughUrl`, `durationSeconds`, `productName`,
`productImageUrl`) that `CreativeConfig` types explicitly — those explicit fields
are re-applied on top so their defaults/coercion still win, but every other
per-template field (e.g. Scratch & Reveal's `coverText`/`revealThreshold`) now
reaches the runtime unit too. `VastBuildContext.rawConfig` carries this through.

Since [ADR-0011](decisions/0011-conditional-grouped-config-schemas.md), `config_json`
holds only the fields that were **active** when the creative was saved, so a template
with conditional fields ships a different `<AdParameters>` payload depending on how it
was configured. That is deliberate: a switched-off branch must not ride along on every
ad request.

**Try before saving:** the dashboard configurator can run a template's *current,
unsaved* form values through a real (ephemeral) VAST tag in three player
backends — see the "Live preview" section of [architecture.md](architecture.md).

## Per-path click-through: what the standards actually guarantee

Quick Setup Quiz can give each answer path its own destination, but **VAST has exactly
one `<VideoClicks><ClickThrough>` per creative**. The resolved per-path URL is therefore
handed to VPAID's `AdClickThru(url, "", true)`, while the VAST document keeps a single
universal `clickThroughUrl` that stays **required in both result modes**.

This is not redundancy. VPAID 2.0 says a player receiving `AdClickThru` with
`playerHandles = true` should navigate to the supplied URL; VAST says a player may prefer
the document-level `<ClickThrough>`. **Players genuinely disagree, and Google IMA is known
to favour the VAST-level URL when one is present.** So, stated plainly rather than
assumed:

- **Per-path click-through is best-effort and player-dependent.** Do not describe it in
  the UI or to advertisers as guaranteed.
- A player that ignores the VPAID-supplied URL falls back to the advertiser's universal
  destination — degraded, never dead. Dropping `<VideoClicks>` in branching mode would
  force honouring players onto the per-path URL but leave every other player with no
  destination at all, and some will not render a clickable region without it.
- **The Sandbox harness reads `AdClickThru`'s argument directly, so branching always
  looks correct there** — including on inventory where it would collapse. Verify in
  Google IMA and Fluid before believing it.

The result *screen* carries no such caveat: its heading and button label are drawn by our
own code inside the ad slot, so those are exact on every player.

## Media fields: image, gif, or a short video

Every `type: "image"` config field (background, before/after, option thumbnails,
reveal image) accepts any of those interchangeably — the advertiser pastes one URL,
the runtime decides how to render it. Static raster/vector formats and animated GIF
render as a CSS `background-image` (GIF animates natively there); a URL that looks
like a video file (`.webm`, `.mp4`, `.m4v`, `.mov`, `.ogv`) gets a real `<video>`
element instead (autoplay, loop, muted, `object-fit: cover`) since a background-image
cannot play one. One shared helper (`adInteractMediaLayer` in
[`runtime/lib/vpaid-base.js`](../runtime/lib/vpaid-base.js)) makes this decision once
for every template rather than each one re-implementing a type sniff. The
configurator's field stays a plain URL input — there is no separate "is this a
video" toggle to keep in sync.

## Mandatory close control

Every VPAID creative gets a close ("×") control, built once into the shared base
rather than per template — see [ADR-0009](decisions/0009-mandatory-close-control.md).
It is disabled behind a ring that fills over a fixed delay (default 5s, not yet a
creative setting) and, once live, tears the creative down like a user-initiated skip.

The "×" is **drawn as an SVG path inside the ring's own `viewBox`, never typed as a
text glyph** — do not "simplify" it back to `textContent`. A glyph is centred by its
line box rather than its ink, its metrics change with whatever font the player's device
actually has (Arial is absent on the Android/Linux devices most of this inventory
renders on), and glyph rasterisation snaps to the pixel grid while the SVG ring does
not — the 26px control routinely lands on a half pixel. Together those pushed the cross
visibly up and left of the ring. Sharing one coordinate system with the ring makes the
mark centred by geometry on every device, font stack, and DPR.
This is also why a creative has **no fixed watch duration** anymore: the internal
`durationSeconds` (VAST `<Duration>`, quartile timer pacing) is still injected with a
default via `lib/vast/builder.ts`, but it is no longer a configurator field — nothing
auto-completes or auto-removes the creative on a timer; only the viewer's own close
click does.

A consequence worth naming, now that a quiz can run three questions: **`complete` means
"was on screen for the injected duration", not "finished the interaction".** A viewer
still on question two when the 30s quartile timer expires fires `complete` anyway. This
was always true of every template; multi-step just makes the gap visible. Do not defer
`complete` until the mechanic ends — that would make the metric incomparable across
creatives and would break players that gate their own teardown on it. SIMID does not get this yet (it runs in a sandboxed iframe over a
different, postMessage-based runtime, not the VPAID base) — a known gap, not a design
decision.

## What a running unit reports about itself

A VPAID unit is opaque from outside its iframe — cross-origin for Google IMA, vendor-owned
for Fluid Player — so the only signal that ever escaped was whatever a player chose to
re-expose. The shared base now posts every lifecycle event, plus whatever a template
declares through `api.debug(name, data)`, using `postMessage` addressed to the origin the
unit was served from ([ADR-0019](decisions/0019-creative-telemetry-channel.md)).

Three things about it are load-bearing:

- **It ships in every build, production included**, because a debug-only build would mean
  the unit being debugged is not the unit in the DSP.
- **`targetOrigin` is the access control.** In production the top frame is the publisher's
  page; the origin does not match and the browser drops the message before delivery. A
  creative cannot leak its state to the page hosting it. Widening that argument to `"*"`
  would undo the entire guarantee.
- **The unit checks reachability before posting at all**, because a *rejected* post is not
  silent — browsers log a console error for a `targetOrigin` mismatch. A cross-origin
  `location.origin` read throws instead, and is caught. In production nothing is posted
  and the publisher's console stays clean.
- **Nothing is collected.** There is no endpoint and no storage — it is read on our own
  pages, live. This is not a measurement channel and must not become one without a
  decision of its own; the three ingested events remain exactly those in
  [ADR-0016](decisions/0016-three-events-hourly-counters.md).

SIMID does not have this either — same gap as the close control above: it runs its own
postMessage runtime rather than the VPAID base.

## The protection reality (do not oversell)

A SIMID/VPAID creative **executes JavaScript on the client**. That JS is, by
definition, delivered to the browser/player and is therefore inspectable. **We cannot
make the creative code impossible to access**, and we must never market it that way.

What we actually provide — *access control + raising the cost of copying*:

1. **Dynamic VAST kill-switch** — the real lever. No active subscription → empty/
   fallback VAST, payload never served. (See [architecture.md](architecture.md).)
2. **Short-TTL signed URLs** for the SIMID iframe / VPAID unit.
3. **Server-side config injection** — product data/links injected at serve time,
   never baked into static bundles.
4. **Minification / obfuscation** of the runtime.

Domain / referer allow-listing used to be listed here as a fifth layer. It was never
built, and it is not planned — see [ADR-0003](decisions/0003-access-control-over-code-hiding.md).

Full rationale: [ADR-0003](decisions/0003-access-control-over-code-hiding.md).

## Glossary

- **DSP** — Demand-Side Platform; where the buyer pastes the VAST tag.
- **VAST tag URL** — the URL we generate; the DSP calls it to fetch the ad.
- **Wrapper vs Inline VAST** — wrapper redirects to another VAST; inline carries the
  media. We serve inline for our own creatives.
- **Quartile events** — start / 25% / 50% / 75% / complete tracking pings.
- **`<AdVerifications>`** — VAST 4.1+ element carrying an OMID verification
  vendor's script + parameters. We emit it for SIMID as a pass-through
  (ADR-0012); we never populate it ourselves as a vendor.
- **Viewable / `viewable` event** — VPAID-only, self-reported (not
  OMID-accredited): the ad slot was ≥50% on-screen for a continuous 2s (the
  MRC video threshold), fired by `runtime/lib/vpaid-base.js`'s
  `IntersectionObserver`. See ADR-0012.

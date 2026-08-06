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
| **OMID / OM SDK** | Open Measurement for viewability/verification. Orthogonal to interactivity. | **Post-MVP** hook; design VAST to leave room for `<Verification>` nodes. |

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

`<AdParameters>` carries the creative's **full `config_json`**, not just the fixed
subset (`videoUrl`, `clickThroughUrl`, `durationSeconds`, `productName`,
`productImageUrl`) that `CreativeConfig` types explicitly — those explicit fields
are re-applied on top so their defaults/coercion still win, but every other
per-template field (e.g. Scratch & Reveal's `coverText`/`revealThreshold`) now
reaches the runtime unit too. `VastBuildContext.rawConfig` carries this through.

**Try before saving:** the dashboard configurator can run a template's *current,
unsaved* form values through a real (ephemeral) VAST tag in three player
backends — see the "Live preview" section of [architecture.md](architecture.md).

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
This is also why a creative has **no fixed watch duration** anymore: the internal
`durationSeconds` (VAST `<Duration>`, quartile timer pacing) is still injected with a
default via `lib/vast/builder.ts`, but it is no longer a configurator field — nothing
auto-completes or auto-removes the creative on a timer; only the viewer's own close
click does. SIMID does not get this yet (it runs in a sandboxed iframe over a
different, postMessage-based runtime, not the VPAID base) — a known gap, not a design
decision.

## The protection reality (do not oversell)

A SIMID/VPAID creative **executes JavaScript on the client**. That JS is, by
definition, delivered to the browser/player and is therefore inspectable. **We cannot
make the creative code impossible to access**, and we must never market it that way.

What we actually provide — *access control + raising the cost of copying*:

1. **Dynamic VAST kill-switch** — the real lever. No active subscription → empty/
   fallback VAST, payload never served. (See [architecture.md](architecture.md).)
2. **Short-TTL signed URLs** for the SIMID iframe / VPAID unit.
3. **Domain / referer allow-listing** so the unit only runs where authorized.
4. **Server-side config injection** — product data/links injected at serve time,
   never baked into static bundles.
5. **Minification / obfuscation** of the runtime.

Full rationale: [ADR-0003](decisions/0003-access-control-over-code-hiding.md).

## Glossary

- **DSP** — Demand-Side Platform; where the buyer pastes the VAST tag.
- **VAST tag URL** — the URL we generate; the DSP calls it to fetch the ad.
- **Wrapper vs Inline VAST** — wrapper redirects to another VAST; inline carries the
  media. We serve inline for our own creatives.
- **Quartile events** — start / 25% / 50% / 75% / complete tracking pings.

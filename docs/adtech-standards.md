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
  pointing at the VPAID JS unit.

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

# Creative runtime assets

The interactive units served inside the VAST creative. **Source** lives here; the
**built** output (`npm run build:runtime` → `runtime/dist/**`) is what actually gets
uploaded to the Supabase **`creatives`** Storage bucket, which the VAST endpoint
serves via short-TTL signed URLs (ADR-0003 / ADR-0004).

## Layout

- `lib/vpaid-base.js` — the shared VPAID 2.0 base (lifecycle, quartile/click
  plumbing, the shared media-layer helper for image/gif/video URLs, and the
  mandatory close control — ADR-0005 / ADR-0009). A template implements only
  `onStart(slot, params, api)`.
- `templates/<name>/vpaid.js` — one render module per template, defining `var
  TEMPLATE = { name, duration, onStart }`.
- `build.mjs` concatenates each render module with the shared base into
  `dist/<name>/vpaid.js` (or the path override in `build.mjs` for a template
  whose storage key nests deeper, e.g. `shoppable` → `dist/shoppable/vpaid/unit.js`).
- `shoppable/simid/index.html` — the one SIMID 1.1 reference document (Shoppable
  Video's alternate format; SIMID runs in a sandboxed iframe, not the VPAID
  pipeline, so it isn't built by `build.mjs` and doesn't get the base's media
  helper or close control yet).

## Files → bucket keys

| Local path | Upload to (bucket key) | Standard |
| --- | --- | --- |
| `shoppable/simid/index.html` | `shoppable/simid/index.html` | SIMID 1.1 |
| `dist/shoppable/vpaid/unit.js` | `shoppable/vpaid/unit.js` | VPAID 2.0 |
| `dist/scratch-reveal/vpaid.js` | `scratch-reveal/vpaid.js` | VPAID 2.0 |
| `dist/slider/vpaid.js` | `slider/vpaid.js` | VPAID 2.0 |
| `dist/quiz/vpaid.js` | `quiz/vpaid.js` | VPAID 2.0 |
| `dist/age-gate/vpaid.js` | `age-gate/vpaid.js` | VPAID 2.0 |

These keys match `templates.runtime_keys` in [`../supabase/seed.sql`](../supabase/seed.sql).

## Setup

1. Create a **private** bucket named `creatives` in Supabase Storage (private so the
   files are only reachable via signed URLs — `lib/storage.ts` signs them).
2. Run `npm run build:runtime`, then upload the `dist/**` files above to the matching
   keys (Supabase dashboard or CLI).
3. Apply [`../supabase/schema.sql`](../supabase/schema.sql) then
   [`../supabase/seed.sql`](../supabase/seed.sql).

## How config reaches the unit

Per-creative config (video URL, click-through, product name/image, per-template
fields) is injected at serve time via the VAST `<AdParameters>` element — never
baked into these files. Both standards parse that JSON:
- SIMID: from the `SIMID:Player:init` message's `creativeData.adParameters`.
- VPAID: from `creativeData.AdParameters` in `initAd`.

## Status

Reference implementations. Validate against the target players (Google IMA for
VPAID; a SIMID-capable player) before production — see
[`../docs/mvp-scope.md`](../docs/mvp-scope.md).

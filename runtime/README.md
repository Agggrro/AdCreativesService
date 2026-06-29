# Creative runtime assets

The interactive units served inside the VAST creative. These are **source assets**
that must be uploaded to the Supabase **`creatives`** Storage bucket; the VAST endpoint
serves them via short-TTL signed URLs (ADR-0003 / ADR-0004).

## Files

| Local path | Upload to (bucket key) | Standard |
| --- | --- | --- |
| `shoppable/simid/index.html` | `shoppable/simid/index.html` | SIMID 1.1 |
| `shoppable/vpaid/unit.js` | `shoppable/vpaid/unit.js` | VPAID 2.0 |

These keys match `templates.runtime_keys` in [`../supabase/seed.sql`](../supabase/seed.sql).

## Setup

1. Create a **private** bucket named `creatives` in Supabase Storage (private so the
   files are only reachable via signed URLs — `lib/storage.ts` signs them).
2. Upload the files above to the matching keys (Supabase dashboard or CLI).
3. Apply [`../supabase/schema.sql`](../supabase/schema.sql) then
   [`../supabase/seed.sql`](../supabase/seed.sql).

## How config reaches the unit

Per-creative config (video URL, click-through, product name/image, duration) is
injected at serve time via the VAST `<AdParameters>` element — never baked into these
files. Both units parse that JSON:
- SIMID: from the `SIMID:Player:init` message's `creativeData.adParameters`.
- VPAID: from `creativeData.AdParameters` in `initAd`.

## Status

Reference implementations of the Shop Now overlay. Validate against the target
players (Google IMA for VPAID; a SIMID-capable player) before production — see
[`../docs/mvp-scope.md`](../docs/mvp-scope.md).

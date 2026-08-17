# Creative runtime assets

The interactive units served inside the VAST creative. **Source** lives here; the
**built** output (`npm run build:runtime` → `runtime/dist/**`) is uploaded to a
**public, content-addressed Vercel Blob store** and recorded in `runtime/manifest.ts`
([ADR-0017](../docs/decisions/0017-runtime-assets-on-public-cdn.md)). VPAID units are
then fetched straight off the CDN by the player; the SIMID document still goes through
`/api/creative/simid/[token]`, because no object store will serve HTML as a runnable
document.

## Layout

- `lib/vpaid-base.js` — the shared VPAID 2.0 base (lifecycle, quartile/click
  plumbing, the shared media-layer helper for image/gif/video URLs, the
  mandatory close control — ADR-0005 / ADR-0009 — a self-reported,
  non-OMID-accredited viewability observer that fires once the slot has been
  ≥50% on-screen for a continuous 2s — ADR-0012 — and the telemetry channel,
  below). A template implements only `onStart(slot, params, api)`.
- `templates/<name>/vpaid.js` — one render module per template, defining `var
  TEMPLATE = { name, duration, onStart }`.
- `build.mjs` concatenates each render module with the shared base, then
  minifies the result with `terser` (mangle + compress, comments stripped —
  deliberately no control-flow-flattening/self-defending obfuscation, which
  adds per-init runtime cost that risks tripping a player's VPAID init
  timeout) into `dist/<name>/vpaid.js` (or the path override in `build.mjs`
  for a template whose storage key nests deeper, e.g. `shoppable` →
  `dist/shoppable/vpaid/unit.js`). This raises the cost of casually copying
  the served unit; it is not, and is not meant to be, secrecy — see
  [ADR-0003](../docs/decisions/0003-access-control-over-code-hiding.md).
- `shoppable/simid/index.html` — the one SIMID 1.1 reference document (Shoppable
  Video's alternate format; SIMID runs in a sandboxed iframe, not the VPAID
  pipeline, so it isn't built by `build.mjs` and doesn't get the base's media
  helper or close control yet).

## Files → logical keys

| Local path | Logical key | Standard |
| --- | --- | --- |
| `shoppable/simid/index.html` | `shoppable/simid/index.html` | SIMID 1.1 |
| `dist/shoppable/vpaid/unit.js` | `shoppable/vpaid/unit.js` | VPAID 2.0 |
| `dist/scratch-reveal/vpaid.js` | `scratch-reveal/vpaid.js` | VPAID 2.0 |
| `dist/slider/vpaid.js` | `slider/vpaid.js` | VPAID 2.0 |
| `dist/quiz/vpaid.js` | `quiz/vpaid.js` | VPAID 2.0 |
| `dist/age-gate/vpaid.js` | `age-gate/vpaid.js` | VPAID 2.0 |

These keys match `templates.runtime_keys` in [`../supabase/seed.sql`](../supabase/seed.sql)
and are what `runtime/manifest.ts` maps to real CDN URLs. The **object** key on the
CDN is not the logical key: it carries a content hash
(`runtime/quiz/vpaid.<sha256[0..8]>.js`), which is what lets it be cached for a year
([ADR-0017](../docs/decisions/0017-runtime-assets-on-public-cdn.md)).

## Setup

1. Create a Vercel Blob store with access **Public** and connect it to the project.
   Public because the player fetches the VPAID unit straight off the CDN with no
   function in the path. This is a *different* store from the private one holding the
   serving snapshots — Blob allows 100 stores even on Hobby, and its docs recommend
   separating public from private content.
2. Put its read/write token in `.env.local` as `RUNTIME_BLOB_READ_WRITE_TOKEN`.
3. Run `npm run build:runtime`, then `npm run runtime:push`. The push hashes each
   built file, uploads it under a content-addressed key, and writes
   `runtime/manifest.ts`. `npm run runtime:push quiz` pushes a single template and
   updates only its manifest entry. `build:runtime` wipes `dist/` first, so a unit
   whose key moves (as `shoppable`'s once did) cannot leave a phantom object behind.
4. **Commit `runtime/manifest.ts`.** The app imports it at build time, so an
   unpushed commit means the deployed app still points at the previous URLs.
5. Apply [`../supabase/schema.sql`](../supabase/schema.sql) then
   [`../supabase/seed.sql`](../supabase/seed.sql) — `npm run db:schema` and
   `npm run db:seed`. Both files are idempotent full-applies, so re-running the seed
   *is* how a template change ships; there is no migrations directory.

Commands read `.env.local`. `runtime:push` needs `RUNTIME_BLOB_READ_WRITE_TOKEN`; the
`db:*` commands need `DATABASE_URL`, which nothing else uses — see
[`.env.example`](../.env.example).

The Supabase `creatives` bucket is still the fallback source for any key not yet in the
manifest ([`../lib/runtime-bytes.ts`](../lib/runtime-bytes.ts)), which is what lets the
CDN move ship before the store exists. Once every template has been pushed, that
fallback is dead weight and can go.

**Order matters when shipping a template change.** Push the runtime first (harmless on
its own — no saved creative references a capability it does not have yet), **commit the
manifest**, then deploy the app, then apply the seed, **then run
`npm run snapshot:backfill`**.

That last step is not optional. Seeding before the deploy leaves the live configurator
rendering a schema its code does not understand; skipping the backfill leaves something
worse, because it is silent. Serving snapshots copy `template_type`, `runtime_keys` and
`supported_standards` out of `templates` ([ADR-0015](../docs/decisions/0015-serving-snapshots-on-cdn.md)),
so a seed that moves a runtime key leaves every snapshot for that template pointing at
the old object — which fails closed to an empty ad, with nothing in the logs to say
why. The backfill is idempotent, so running it after every seed is the safe habit.

## How config reaches the unit

Per-creative config (video URL, click-through, product name/image, per-template
fields) is injected at serve time via the VAST `<AdParameters>` element — never
baked into these files. Both standards parse that JSON:
- SIMID: from the `SIMID:Player:init` message's `creativeData.adParameters`.
- VPAID: from `creativeData.AdParameters` in `initAd`.

## What the unit reports about itself

Every VPAID lifecycle event is posted out of the unit with `postMessage`, addressed to
the origin the unit was served from
([ADR-0019](../docs/decisions/0019-creative-telemetry-channel.md)). A template adds its
own records through the `api.debug(name, data)` handed to `onStart` — namespaced `tpl:`,
and the place to report anything with no VPAID event of its own:

```js
api.debug("mount", { w: slot.clientWidth, h: slot.clientHeight });
api.debug("answer", { step: 1, picked: "B", path: "B" });
```

Compiled into every build, production included. `targetOrigin` is what keeps it safe: in
production the top frame is the publisher's, the origin does not match, and the browser
drops the message. **Never widen that argument.**

The unit also checks each candidate window is ours *before* posting, because a rejected
post is not silent — browsers log a console error for a mismatch. So in production it
posts nothing at all. Never `console.log` from a unit either; the receiver does the
logging, and a publisher's console stays clean.

Read it back on any of our own pages as `window.__creosmith`, or watch it live on
`/dev/harness`, which also judges a unit against the mandatory lifecycle. That page serves
units from `dist/` off disk, so **`npm run build:runtime` before looking** — the
configurator's own preview resolves the *published* object through `manifest.ts` and will
not show a local edit until `npm run runtime:push`.

**Every change in this directory goes through the
[`creative-check`](../.claude/skills/creative-check/SKILL.md) skill, before and after.**
It is a mandatory gate in [`CLAUDE.md`](../CLAUDE.md): a render module is verified by
being run, never by reasoning that it should work.

## Status

Reference implementations. Validate against the target players (Google IMA for
VPAID; a SIMID-capable player) before production — see
[`../docs/mvp-scope.md`](../docs/mvp-scope.md).

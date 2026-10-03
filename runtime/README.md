# Creative runtime assets

The interactive units served inside the VAST creative. **Source** lives here; the
**built** output (`npm run build:runtime` → `runtime/dist/**`) is uploaded,
**content-addressed**, to the R2 bucket behind `media.smithcdn.net` and recorded in
`runtime/manifest.ts` ([ADR-0017](../docs/decisions/0017-runtime-assets-on-public-cdn.md),
[ADR-0029](../docs/decisions/0029-off-vercel-onto-cloudflare-workers.md)). VPAID units are
then fetched straight off Cloudflare's cache by the player; the SIMID document still goes
through `/c/s/:token`, which gives it the CSP it runs under and a per-request token.

## Layout

- `lib/vpaid-base.js` — the shared VPAID 2.0 base (lifecycle, quartile/click
  plumbing, the shared media helpers for image/gif/video URLs — every picture field is
  fitted by height, blurred sides filled, through `adInteractFitMedia` (ADR-0025) — the
  mandatory close control — ADR-0005 / ADR-0009 — a self-reported,
  non-OMID-accredited viewability observer that fires once the slot has been
  ≥50% on-screen for a continuous 2s — ADR-0012 — and the telemetry channel,
  below). A template implements only `onStart(slot, params, api)`; what it starts that
  does not end by itself (animations, observers, audio) it stops in an
  `api.onStop(fn)` cleanup, which the base runs on every terminal path — and after
  which `api.clickThrough()` does nothing ([ADR-0024](../docs/decisions/0024-pick-message-template.md)).
  Media a template plays itself, the base cannot pause: a template pauses and resumes it
  in `api.onPause(fn)` / `api.onResume(fn)`, run from the player's `pauseAd` / `resumeAd`
  ([ADR-0030](../docs/decisions/0030-duel-template.md)). The base itself pauses the timer
  that drives a video-less ad's quartiles, and touches the player's video slot only when
  the creative plays its base video there.
  An animation that runs until the viewer acts sticks to `transform` and `opacity`;
  one that moves layout or repaints on every frame (`top`/`left`, `clip-path` — the
  slider's swing) runs a bounded number of times, because Chrome's heavy-ad
  intervention meters a unit's main-thread time and an ad can sit on screen untouched.
- `templates/<name>/vpaid.js` — one render module per template, defining `var
  TEMPLATE = { name, duration, onStart }`.
  **The slot is not always in the document the unit runs in.** Fluid Player loads the
  unit into an iframe of its own and builds the slot in the host page
  (`fluid-player/src/modules/vpaid.js` `loadVpaid`, `adsupport.js`
  `switchPlayerToVpaidMode`). So anything a template binds to a window — a drag's
  `mouseup`, a `resize` fallback, the `ResizeObserver` constructor, a `matchMedia`
  query — belongs to `slot.ownerDocument.defaultView`, not to `window`: bound to the
  unit's own window, a drag in Fluid never ends. The harness loads the unit into the
  slot's own document and cannot show this.
  The slot also sits under the host page's styles there, and inherits what CSS
  inherits — `direction` among it: on a right-to-left page a flex row runs right to
  left. A row whose order carries meaning (the slider knob's two chevrons, or the
  word between them in its capsule) pins `direction:ltr`.
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
| `dist/pick-message/vpaid.js` | `pick-message/vpaid.js` | VPAID 2.0 |
| `dist/duel/vpaid.js` | `duel/vpaid.js` | VPAID 2.0 |

These keys match `templates.runtime_keys` in [`../supabase/seed.sql`](../supabase/seed.sql)
and are what `runtime/manifest.ts` maps to real CDN URLs. The **object** key on the
CDN is not the logical key: it carries a content hash
(`runtime/quiz/vpaid.<sha256[0..8]>.js`), which is what lets it be cached for a year
([ADR-0017](../docs/decisions/0017-runtime-assets-on-public-cdn.md)).

## Setup

1. The units live in the R2 bucket that holds advertiser media (`creative-media`),
   under `runtime/` — public, because the player fetches the VPAID unit straight off
   the CDN with nothing of ours in the path. A runtime key
   (`runtime/<path>.<sha8>.<js|html>`, `lib/runtime-keys.ts`) and a media key
   (`{uuid}/{uuid}.{ext}`) can never match each other, so media deletes cannot reach a
   unit and the push cannot overwrite an upload. **`runtime/` is locked** by an R2 bucket
   lock rule (`runtime-immutable`, indefinite): no key can overwrite or delete a unit
   once it is there — the app's own key included, which is the point (ADR-0029).
2. `.env.local` needs the R2 variables (`R2_*`, `NEXT_PUBLIC_MEDIA_URL`) — the same
   bucket-scoped token the media uploads use.
3. Run `npm run build:runtime`, then `npm run runtime:push`. The push hashes each
   built file, uploads it under a content-addressed key with a year-long immutable
   cache, and writes `runtime/manifest.ts`. A key already there is not re-uploaded —
   the lock would refuse it — but its served bytes are checked against the hash, and a
   mismatch stops the push.
   `npm run runtime:push quiz` pushes a single template and updates only its manifest
   entry. `build:runtime` wipes `dist/` first, so a unit whose key moves (as
   `shoppable`'s once did) cannot leave a phantom object behind.
4. **Commit `runtime/manifest.ts`.** The app *and the ad Worker* import it at build
   time, so an unpushed commit means both still point at the previous URLs — which
   keep working, since no hash is ever deleted.
5. Apply [`../supabase/schema.sql`](../supabase/schema.sql) then
   [`../supabase/seed.sql`](../supabase/seed.sql) — `npm run db:schema` and
   `npm run db:seed`. Both files are idempotent full-applies, so re-running the seed
   *is* how a template change ships; there is no migrations directory.

Commands read `.env.local`. `runtime:push` needs the R2 variables; the
`db:*` commands need `DATABASE_URL`, which nothing else uses — see
[`.env.example`](../.env.example).

The Supabase `creatives` bucket is still the fallback source for any key not yet in the
manifest ([`../lib/runtime-bytes.ts`](../lib/runtime-bytes.ts)), which is what lets the
CDN move ship before the store exists. Once every template has been pushed, that
fallback is dead weight and can go.

**Order matters when shipping a template change.** Push the runtime first (harmless on
its own — no saved creative references a capability it does not have yet), **commit the
manifest**, then deploy the app — a push to `main`, after which CI builds and deploys both
Workers, each reading the manifest at build time; wait for both deploy jobs — then apply
the seed, **then run
`npm run snapshot:backfill`**.

That last step is not optional. Seeding before the deploy leaves the live configurator
rendering a schema its code does not understand; skipping the backfill leaves something
worse, because it is silent. Serving snapshots copy `template_type`, `runtime_keys` and
`supported_standards` out of `templates` ([ADR-0015](../docs/decisions/0015-serving-snapshots-on-cdn.md)),
so a seed that moves a runtime key leaves every snapshot for that template pointing at
the old object — which fails closed to an empty ad, with nothing in the logs to say
why. The backfill is idempotent, so running it after every seed is the safe habit.

**A new template goes in as a draft first** ([ADR-0024](../docs/decisions/0024-pick-message-template.md)).
Its seed row carries `is_published = false`, which RLS and every app query hide, so it can
sit in the database before any deployed app knows its unit key. Apply just that row —
the seed's own statement restricted to it — rather than the whole seed, after checking
that the live rows still match `seed.sql`. `/dev/harness` lists drafts (marked `· draft`),
which is what lets the mandatory `creative-check` run before the template is visible
anywhere. Publishing is then the last step of the order above: flip `is_published` to
`true` in `seed.sql` in the same commit as the unit's manifest entry, deploy, and only then
apply the seed. A draft that is published before the deploy shows up in the live catalog
with no demo, and a creative made from it points at a unit the CDN does not have.

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

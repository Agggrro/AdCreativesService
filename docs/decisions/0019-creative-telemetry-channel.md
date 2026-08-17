# 0019. Creative telemetry over an origin-locked postMessage channel

- Status: Accepted
- Date: 2026-08-18

## Context

A VPAID unit is opaque from the outside. It runs inside the player's own iframe —
cross-origin on `imasdk.googleapis.com` for Google IMA, same-origin but vendor-owned for
Fluid Player — so nothing about it can be read from the hosting page: not its DOM, not
its computed styles, not its internal state. The only signal that escaped was whatever a
player chose to re-expose, which in the configurator amounted to three status strings
(`AdStarted`, `AdVideoComplete`, `AdClickThru`).

That is thin for diagnosing a live tag, and it is nothing at all for *building* a
template. A render module's real state — which quiz branch was taken, how much of the
scratch cover has been erased, what size the slot was actually measured at — has no VPAID
event to ride on and never left the iframe. In practice every such question was answered
by a human opening devtools and reading it out, which does not scale to the volume of
template work planned.

[ADR-0014](0014-vast-inspection-engine.md) had already established the right shape for the
answer — `PlayerEvent`, a player-agnostic timeline record — and left `onEvent` optional on
`PreviewPlayerProps` so players could be instrumented later. This is that later.

## Decision

The VPAID runtime posts one structured record per lifecycle event, plus anything a
template declares through a new `api.debug(name, data)`, using `postMessage` with
**`targetOrigin` set to the origin the unit was served from**.

```js
window.parent.postMessage({ __creosmith: 1, v: 1, runId, seq, template, name, at, data },
                          CREOSMITH_ORIGIN);
```

`CREOSMITH_ORIGIN` is read from `document.currentScript.src` while the unit is still
executing, and the unit is always served from our own origin
(`resolveInteractiveUrl`, `lib/storage.ts`). The record goes to both `parent` and `top`,
because the unit sits one frame deep in some players and two in others; the receiver
de-duplicates on `runId` + `seq`.

**The channel is compiled into every build, production included.**

### `targetOrigin` is the access control, not a formality

In production `window.top` is the publisher's page. Its origin does not match
`CREOSMITH_ORIGIN`, so **the browser discards the message before delivering it**. A
creative cannot leak its state to the page it is running on even if something there is
listening for it. That is enforced by the browser, not by our discipline, and it was
verified rather than assumed: a message addressed to a foreign origin is not delivered to
a listener on the page, while the same message addressed to the page's own origin is.

On our own preview, validator and harness pages the origins match and the record arrives.

### But a rejected post is not a silent one — so we do not make it

Delivery is silent; the *attempt* is not. Chromium and Firefox both write a console
**error** when `targetOrigin` does not match the recipient, so posting blindly would have
printed one or two errors per lifecycle event on the publisher's page, on every
impression — and in a player that runs the unit in the top-level document, with no iframe
to attribute them to. That is precisely the noise this ADR promises never to make, and it
would have shipped: the flaw was in the first implementation and was caught in review.

So the unit asks first, quietly. Reading `w.location.origin` across origins throws a
`SecurityError`, which is caught and logs nothing:

```js
function adInteractReachable(w) {
  try { return !!w && w.location.origin === CREOSMITH_ORIGIN; } catch (e) { return false; }
}
```

Targets are filtered through that once per run and cached. **In production the channel
therefore makes zero `postMessage` calls and produces zero console output** — its entire
cost is one origin probe per candidate window. `targetOrigin` is still passed on every
call and remains the guarantee of record; the probe is what keeps the attempt from being
made at all.

Two events are excluded from the channel outright: `AdSizeChange` and `AdVolumeChange`.
The player drives both at input frequency — a resize drag, a volume drag — and neither is
a lifecycle event anyone debugs.

### Interaction with the ad-serving domain (ADR-0018)

`CREOSMITH_ORIGIN` is whatever origin actually served the unit, which is not one fixed
host. On our own surfaces the unit is fetched same-origin with the page — the preview
mint resolves it against `getRequestOrigin(request)`, and the catalog demo and the harness
use their own same-origin routes — so the record is delivered. In production with
`NEXT_PUBLIC_CDN_URL` set, the unit comes from the dedicated ad domain, so
`CREOSMITH_ORIGIN` is that domain and the publisher's page is a third origin: dropped,
which is the intent.

The property that matters is therefore **"the unit reports to whoever served it"**, not
"the unit reports to the app domain". Anything that starts serving units to our own pages
from a different origin than the page itself would silence the channel there — a
diagnosable annoyance rather than a leak, but worth knowing before chasing it.

### Why always on, rather than a debug build

A flag — in `AdParameters`, or a separate `dist-debug/` — would mean the unit being
debugged is not the unit that ships. That is the exact class of divergence that produces
"works locally, breaks in the DSP", and it is worth far more than the channel costs: in
production the reachability probe finds no target, so nothing is posted, nothing is
logged, and no network request is made. The residual cost is the bytes in the unit.

### What may not go on it

- **No `console` output from the unit.** The collector on our page writes to the console;
  the unit does not. A publisher's console stays clean.
- **No wholesale creative config.** Event arguments (`AdClickThru`'s destination) and what
  a template explicitly declares, not the `AdParameters` object. The origin lock makes
  this belt-and-braces rather than load-bearing, but a channel that carries less is a
  channel with less to get wrong if the lock is ever weakened.
- **Nothing is collected server-side.** There is no endpoint, no ingestion, and no
  storage. Adding one would be a separate decision with privacy questions of its own —
  records would be arriving from a third-party context.

## Consequences

- **The inside of a creative is legible from our own pages**, including through IMA's
  cross-origin iframe, which is the case that had no other answer.
- **A template throwing in `onStart` now says so.** The three catches in `startAd` still
  swallow — the lifecycle has to survive them — but they report first. Without that, a
  thrown render module is indistinguishable from a unit that never loaded: both leave a
  slot that drew nothing.
- **Templates can report their own state.** `api.debug()` is namespaced `tpl:` so a
  template can never shadow a lifecycle event. All five shipped templates now report at
  least their measured slot size at mount.
- **The record format is a public API in the wild.** Anyone can read the unit and see it.
  `v: 1` is there so it can change without silently breaking a reader; ADR-0003 already
  states we do not pretend client-executed creative code is hidden.
- **Never widen the channel to `targetOrigin: "*"`.** The entire safety argument is that
  one argument. A future need to reach a genuinely different origin — a customer-hosted
  QA page, say — is a new decision, not a parameter change.
- **Receivers must still check `event.origin`.** The sender's `targetOrigin` stops our
  records reaching the wrong page; it does nothing to stop someone else's messages being
  mistaken for ours. `subscribeToCreativeTelemetry` checks both.
- **Known limit: the probe cannot see a genuinely cross-origin ancestor.** Reading
  `w.location.origin` from a differently-origined frame throws — that is the same-origin
  policy working as intended — so a unit running in a cross-origin player frame reports
  nothing even when the top frame *is* ours. This is acceptable today because none of the
  three players creates one: IMA runs VPAID with `setVpaidMode(INSECURE)`, which loads the
  unit into a same-origin `about:blank` frame whose slot lives in our own document
  (verified in the configurator). It stops being acceptable the day a player is added that
  sandboxes the creative cross-origin. The fix then is a handshake rather than a probe —
  the collector posts a beacon down to child frames with `targetOrigin: "*"` (which never
  mismatches, so never warns), and the unit replies to whichever sender proves to be our
  origin. Do that rather than reverting to blind posting.
- **The configurator's preview cannot verify a local runtime edit.** It resolves the unit
  through `runtime/manifest.ts`, so its player tabs run the *published* object; telemetry
  appears there only after `npm run runtime:push`. `/dev/harness` exists partly for this
  reason — it reads `runtime/dist/` off disk.

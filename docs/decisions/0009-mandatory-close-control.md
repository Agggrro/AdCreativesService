# 0009. Mandatory close control, no fixed watch duration

- Status: Accepted
- Date: 2026-08-06

## Context

Every template rendered its own content and lifecycle by hand
([ADR-0005](0005-interactive-image-creatives.md)), with a per-template
`durationSeconds` config field driving both the VAST `<Duration>` element and an
internal timer that fired quartile/complete tracking events. Nothing let the viewer
dismiss the creative themselves, and the "duration" framing implied the creative was
meant to end on a clock rather than stay up until the viewer was done with it — the
opposite of how these interactive mechanics (a slider, a quiz, a scratch reveal) are
actually meant to be experienced.

## Decision

- Every VPAID creative gets a close ("×") control, built **once** into the shared
  base (`runtime/lib/vpaid-base.js`) rather than duplicated per template. It mounts
  itself after the template's own `onStart`, so no template code has to know about
  it — a new template gets it for free.
- The control is disabled behind a ring that fills over a fixed delay (default 5s)
  read from `AdParameters.closeDelaySeconds` with a `5` fallback — not yet a
  configurator field (`В настройки креатива это не выводим пока`), but the read-a-param
  shape means adding that field later needs no runtime change.
- Clicking it once live clears the slot and fires the same `AdSkipped`/`AdStopped`
  pair `skipAd()` already used — a close is a user-initiated skip, not a new VPAID
  lifecycle concept.
- `durationSeconds` is no longer a configurator field on any template. It still
  exists internally (`lib/vast/builder.ts`'s `DEFAULT_DURATION_SECONDS` fallback)
  because VAST's `<Duration>` element is required and the quartile timer
  (ADR-0005's "timer-driven quartiles ... so billing/tracking still works") still
  needs a pace to run at — but it is fixed, not advertiser-set, and it no longer
  controls whether the creative disappears. Only the viewer's own close click does
  that.
- Out of scope for now: **SIMID** creatives don't get this control. SIMID runs in a
  sandboxed iframe over `postMessage`, not the VPAID base this control lives in, so
  today only Shoppable Video's SIMID variant lacks it. Documented gap, not a design
  call — see [adtech-standards.md](../adtech-standards.md).

## Consequences

- A template's interactive mechanic (slider, quiz, scratch, gate) is no longer at
  risk of a host player tearing it down mid-interaction on an arbitrary timer; it
  persists until the viewer is actually done.
- Tracking/billing quartile events keep firing on the old internal pace, so
  `get_creative_overview`'s funnel numbers are unaffected by this change — the
  timer is explicitly torn down (`_teardown()`, shared by `stopAd`/`skipAd`) the
  moment the ad ends any way (close click, host stop, a template's own early-end
  UI via `api.stop()`), so nothing fires late after `AdStopped`.
- One shared mount point means a future creative-wide UI requirement (a mute
  button, a companion badge) has an obvious, single place to add it, the same way
  this one did.
- SIMID parity is a known follow-up, not silently forgotten.
- **Known risk, not yet validated:** VAST `<Duration>` and `getAdRemainingTime()`
  still count down to a fixed internal value (`DEFAULT_DURATION_SECONDS`) even
  though the creative now intentionally stays mounted past it until closed. A
  strict outstream/instream player that treats declared `<Duration>` or
  `remainingTime === 0` as a hard reclaim signal could truncate a creative the
  viewer hasn't closed yet, or flag an "ad ended without AdStopped" anomaly.
  `docs/mvp-scope.md`'s outstanding "validate against target players" item should
  specifically exercise this now-open-ended-past-`Duration` scenario.

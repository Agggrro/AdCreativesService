# 0032. An ad the viewer is engaging with runs longer, up to 30 seconds more

- Status: Accepted
- Date: 2026-10-20
- Amends: the "`complete` means on screen for the injected duration" rule in
  [docs/adtech-standards.md](../adtech-standards.md), and the timer of
  [ADR-0030](0030-duel-template.md)

## Context

A video-less VPAID creative runs on a timer in the shared base
(`runtime/lib/vpaid-base.js`): `durationSeconds`, which `lib/vast/builder.ts` always
injects at 30, paces the quartiles and fires `AdVideoComplete` at the end. No template
schema exposes it, so every interactive creative in production is exactly 30 seconds,
counted from `AdStarted`, whatever the viewer is doing.

We had written that `complete` must stay "was on screen for the injected duration" and
must not wait for the mechanic, so the metric stays comparable across creatives. That
same paragraph named the cost and accepted it: players gate their own teardown on
`complete`. It became concrete on AdPlayer.Pro's test page, where a Step Builder
creative (three picks, each step's clips loading after the tap) was torn down at 30.0s,
`AdStarted` 22:31:49 to `AdVideoComplete` 22:32:19, before the viewer made the third
pick. The quiz had already hit this at 15s, and the fix then was a longer fixed
duration. A longer fixed duration makes every disengaged viewer sit through it, and VAST
`<Duration>` is what buyers and players plan slots by.

## Decision

The base extends a video-less ad while the viewer acts on it:

- **What counts:** a mouse or pen `pointerdown`, a `pointerup`, a `click` or a `keydown`
  anywhere in the slot, in the capture phase, so every template gets it with no code of
  its own and none can swallow it. A finger counts when it lifts, not when it lands:
  scrolling a feed past the slot starts with `touchstart` and a touch `pointerdown` too,
  and ends in `pointercancel` with no `click`, so a scroll never extends an ad. A drag on
  a `touch-action:none` surface (the scratch cover, the slider) ends in `pointerup` and
  counts. The listeners are passive, and the close control is excluded: its tap ends the
  ad.
- **How much:** each action moves the end to 15 seconds from now
  (`ADINTERACT_EXTEND_GRACE`), rounded up to a whole second, never past the served
  duration plus 30 (`ADINTERACT_EXTEND_MAX`), so 60 seconds at most with the default. An
  action that would add less than a second is not an extension.
- **What the player is told:** `getAdDuration` and `getAdRemainingTime` change, and the
  unit fires VPAID 2.0's `AdDurationChange` and, for a VPAID 1 host,
  `AdRemainingTimeChange`, both meaning "read them again". The telemetry channel gets an
  `extend` record with the new duration ([ADR-0019](0019-creative-telemetry-channel.md)).
- **What does not change:** an untouched ad completes at its served duration, to the
  quarter second, as before. The VAST `<Duration>` stays the served value. A paused
  stretch still does not count. A completed or stopped ad is never extended. A creative
  paced by a base video (Shoppable with `videoUrl`) is never extended: its video is its
  clock.

The quartiles follow the moving end only until they fire: each is computed against the
current duration on every tick and fires once, in order, but one that has fired stays
where it was measured. With the default 30 seconds an extension can only begin after
15 seconds (its end has to pass 30), so the first quartile and the midpoint always fire
against the served duration, and only the third quartile and `complete` can move: a
third quartile at 22.5s followed by an extension to 40s sits at about 56% of the ad's
real run. Read third-quartile and completion rates of interactive creatives as "reached
that point of the served duration", not as shares of the actual runtime.

## Consequences

- `AdVideoComplete` now means "was on screen for the served duration, plus however long
  the viewer kept acting on it, up to 30 seconds more". For a viewer who never touches
  the ad nothing changes. For an engaged viewer, `complete` comes later, and one who
  leaves in that stretch, or whose click-through makes the player end the ad, records no
  `complete` at all. The completion rate of interactive creatives can therefore drop a
  little, and it falls hardest on the viewers who engaged most. Clicks and the template's
  own records (`tpl:*`) are the metric for engagement, not the completion rate.
- Extension is a request to the player, not a guarantee. A player that ignores
  `AdDurationChange` and enforces the VAST `<Duration>` itself ends the ad at 30 seconds
  as before. Which players honour it has to be observed, not assumed: AdPlayer.Pro's and
  IMA's test pages are the first two to check after a deploy.
- A buyer may care about the real runtime even though the declared one fits: an
  engaged ad can run up to 60 seconds in a slot sold as 30 (OpenRTB `maxduration`,
  exchange slot rules). Only an engaged viewer causes it, and only by acting on the ad,
  but an advertiser on strict 30-second inventory should know.
- Duel's pacing is unaffected: it reads `durationSeconds` once, at start, and ends its
  vote at least 5 seconds before that. An extension only gives its winner more time.
- The two constants are not creative settings. Making either one configurable is a
  schema field plus one line in the base, and it should wait for an advertiser who asks
  for it.

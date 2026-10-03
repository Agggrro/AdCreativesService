# 0030. Duel: one round of a two-way vote, and a winner clip with its own sound

- Status: Accepted
- Date: 2026-10-03

## Context

Advertisers on adult and dating offers asked for the mechanic popularised by "AI girlfriend
duel" landings: two clips side by side, a round label, a countdown, a question, the viewer
votes, and the winner takes the screen. It fits our pipeline as a VPAID template — two
`<video>` layers in the slot, like the slider and Pick & Message already draw
([ADR-0005](0005-interactive-image-creatives.md)).

The landings it comes from dress the round as a **live broadcast**: a LIVE badge, a viewer
count, other people's votes, a scrolling chat of gifts. None of that exists inside an ad.
An ad that showed it would be inventing it — exactly the fabricated data ADR-0005's
deception boundary puts out of scope.

## Decision

Ship the mechanic as a new VPAID template, **Duel** (`duel`,
`runtime/templates/duel/vpaid.js`), as one round with no invented audience.

- **The round is the ad's own game, not a broadcast.** On screen: two clips, two names, an
  optional round label, a countdown, a question, a hint, and after the pick a winner line
  and a button. No viewer counts, no vote percentages, no chat, no "live" claim from the
  template. Every word is the advertiser's copy, and the defaults (`ROUND 1`,
  `Who do you pick?`, `Tap to vote`, `{name} wins!`, `Watch more`) claim nothing.
- **Each side has a vote clip and an optional winner clip.** The vote clips loop muted
  side by side (stacked on a portrait slot), fitted by height ([ADR-0025](0025-media-fit-by-height.md)).
  The pick folds the other side toward its edge, takes the slot, and plays its winner
  clip, or keeps the vote clip if none is given. An image works too.
- **Sound follows ADR-0024's rule.** The winner clip's own audio is unmuted only when the
  viewer's tap made the pick, inside that tap, at `api.volume()`, re-read while it plays,
  so a player that mutes the ad mid-clip is honoured mid-clip and an unmute brings the
  sound back. A clip that has not started within 800ms of the tap plays on muted, not late.
  The sound plays **once**: the winner clip runs through with its audio, then loops muted. A pick the countdown made
  plays muted, because no tap means no permission. `sound: off` keeps every clip muted.
  An unmuted `play()` that the browser refuses falls back to muted rather than freezing
  the winner.
- **The countdown ends in a pick, not in nothing.** If nobody taps within `voteSeconds`
  (4–30, default 10), the unit chooses a side at random. This is the ad's own resolution
  of its own round, and it is shown that way: no tick, and the winner line is the name
  alone rather than the advertiser's `{name} wins!`, which claims a vote. It means every impression reaches the end state and
  its button.
- **One click-through, from the end state only.** The button, or a tap on the winner, fires
  it once. The pick raises none, and a tap on the winner within 600ms of the pick counts as
  the same gesture.
- **The player's pause reaches the clips.** Every clip is the unit's own `<video>`, which
  the base's `pauseAd` (it pauses only the video slot) never touched — a player pausing
  the ad after a click-through would have left the winner sounding behind the landing
  page. The base gained `api.onPause(fn)` / `api.onResume(fn)`, run from `pauseAd` /
  `resumeAd`; Duel pauses its clips, freezes the countdown and takes no pick while paused.
  The same change stops the base's own timer-driven clock on `pauseAd`, so a paused ad no
  longer reaches its quartiles and `AdVideoComplete` meanwhile, and leaves the player's
  video slot alone unless the creative plays its base video there, which is the test
  `startAd` already used, on pause, resume, `setAdVolume` and the close control alike. A
  `resumeAd` used to call `play()` on that slot whatever it held: possibly the host's own
  video (Fluid Player's slot is the publisher's video, whose volume a creative without a
  base video also used to set), or an empty element whose rejection landed in the
  publisher's console. An ended ad answers neither `pauseAd` nor `resumeAd`.
- **The countdown ends at least 5s before the ad does** (`durationSeconds`), so the winner
  and its button are on screen before the timer-driven `AdVideoComplete`.
- **Bounded motion.** The rings blink only during the vote, the countdown bar empties with
  one `transform` transition, and only the clock text changes once a second. All of it
  stops with the ad (`api.onStop`).
- **Draft-first**, like every new template since ADR-0024: seeded with
  `is_published = false`, checked in `/dev/harness`, and published in the ship sequence
  after the deploy that knows `duel/vpaid.js`.

## Consequences

- **Chrome's heavy-ad intervention meters the vote clips.** It unloads an ad frame that
  downloads more than 4 MB before the viewer interacts with it. Both vote clips load and
  loop from the start; the winner clip loads after the tap and is not counted. The field
  help asks for the two vote clips under about 3.5 MB together, which a 720p H.264 encode
  meets and two 1080p uploads do not. The countdown's own range stops at 25 s, because
  the ad runs 30.
- **Two to four clips per impression.** The two vote clips load at mount, and the winner
  clip loads when the pick is made, so a 1080×1920 source costs real bandwidth. The
  configurator's help text recommends vertical video; compressing clips before upload
  (the 720p recipe the slider uses) is the advertiser's lever.
- **A winner clip that cannot start within 800ms of the tap plays muted.** A cold cache
  on a slow link, which is typical for a 1080p upload, skips the sound rather than playing
  it late. A compressed 720p clip starts in time far more often.
- **On muted outstream inventory the winner plays silently.** That is the cost of honouring
  the player's volume, the same one Pick & Message pays.
- **The template cannot stop an advertiser from typing "LIVE" or a viewer count into a
  text field.** That holds for every text field in every template. The template ships no
  such claim, and DSP creative review applies to what an advertiser writes.
- **iOS Safari treats `video.volume` as read-only**, so there only a full mute over VPAID
  is honoured, not a partial volume.
- Not yet validated beyond the harness. IMA and Fluid behaviour, and unmuted playback on
  iOS, belong to the open **Verification** item in [mvp-scope.md](../mvp-scope.md).

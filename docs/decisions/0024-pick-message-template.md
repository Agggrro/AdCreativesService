# 0024. Pick & Message: a message card inside the ad, and sound only on the viewer's tap

- Status: Accepted
- Date: 2026-09-27

## Context

We were asked to reproduce a third-party VPAID unit (`vpaidMsgDuo`, from an in-stream ad
manager) as a template. Its mechanic is simple and worth having: two pictures blink in
turn under a question, the viewer taps one, the other disappears, and a messenger-style
notification drops in with a "ding"; tapping through opens the offer.

Read closely, the unit does two different things, and only one of them is a mechanic:

- **The mechanic** — a choice between two pictures, answered by a message with a sound.
- **An impersonation** — the banner carries the Apple Messages app icon and iOS
  notification chrome, the sound is a bundled recording of an iPhone alert
  (`iphone_5s_ding.mp3`), and the hardcoded copy claims a real person nearby
  ("5 min away…"). That is exactly what [ADR-0005](0005-interactive-image-creatives.md)'s
  deception boundary puts out of scope: impersonating a real OS or app, and fabricated
  claims — policy-banned by ad networks and DSPs, and deceptive to the viewer.

It also has defects we have no reason to copy: it sizes itself to the *viewport*
(`100dvh`/`100dvw`), not the slot; the banner's slide-in never animates (it flips
`display:none` and the transform in the same frame); every tap on the picked picture adds
another click listener, so the third tap opens the offer twice and fires `AdClickThru`
twice; it ignores the player's volume; and it has no quartile timer at all — its VAST
declares a 10:40 duration and nothing ever completes.

## Decision

Ship the mechanic as a new VPAID template, **Pick & Message** (`pick_message`,
`runtime/templates/pick-message/vpaid.js`), inside ADR-0005's boundary rather than past it.

- **The card is a message inside the ad, not an operating-system notification.** A
  light speech bubble with a tail toward a round avatar — the shape of a message in a
  conversation — rather than the translucent dark banner of a system notification, in a
  plain web font rather than the OS's, and with no status-bar elements and no real
  messenger's logo. That was not the first draft: a review found the first card rebuilt
  iOS's notification material, system font and system red without any logo at all, and
  ad-quality scanners judge a fake notification by its look. Its avatar is the picture the
  viewer just chose (a video pick gets the sender's initial instead of a second decoder),
  so the card belongs visibly to the ad's own story. The sender line, the text and the
  optional time label are the advertiser's copy; the defaults claim nothing
  (`New message`, `Nice choice! Tap to see more`, `now`), and a cleared time label shows
  none.
- **No bundled third-party sound.** The default is a two-note chime synthesised with Web
  Audio — nobody's recording, and no audio file fetched on every impression. An advertiser
  may link their own file instead, or turn sound off.
- **Sound is user-initiated and follows the player's volume.** It starts inside the tap
  that makes the pick or not at all — an advertiser's file that has not begun within
  800ms is stopped, not played late — and never on load. It plays at `getAdVolume()`,
  exposed to templates as `api.volume()` in the shared base, re-read while a file plays:
  a player that mutes the ad (`setAdVolume(0)`) keeps it silent, and one that mutes it
  mid-file stops the file. A sound the viewer triggered is still the ad's audio, and VPAID
  gives the player, not the creative, the say over it.
- **Whatever the unit starts ends with the ad.** The base gained `api.onStop(fn)`, run
  from every terminal path, because neither a Web Animation nor an observer stops when its
  target leaves the DOM — and in a same-document player that DOM is the publisher's page.
  The same change makes `clickThrough()` a no-op after `AdStopped`, and keeps the close
  control from coming alive after it, for every template: a host may leave the slot up,
  and a tap on what is left is neither a click on a live ad nor a second end to it.
- **The sound link is a `text` field, not `url`.** Every `url`-typed field is a click
  destination ([ADR-0023](0023-conversion-postbacks.md)) that the VAST builder routes
  through `/r`, so a sound link typed `url` would record a click on every preload. The
  unit accepts only `https` — the file is fetched on every impression, and an http one is
  mixed content on an https page — and a file that will not load in time plays the chime
  instead.
- **One click-through, from the end state only.** The card and the picked picture both
  fire it, once; picking raises no `AdClickThru` (it is an intermediate interaction, and
  the delivery strip counts clicks that led somewhere — `lib/vast/builder.ts`); a tap on the
  picked picture within 500ms of the pick is the same gesture, not a click-through.
- **Laid out from the slot.** Pictures keep their own shape (probed on load, bounded
  9:16…16:9), side by side or stacked — whichever gives bigger pictures — relaid out on
  every resize, and nothing sits under the close control
  ([ADR-0009](0009-mandatory-close-control.md)).
- **Seeded as a draft, verified, then published.** A new template is inserted with
  `is_published = false`, which RLS and every app query hide — checkout included, which
  refuses a draft's id rather than sell a subscription to it
  ([billing.md](../billing.md)). `/dev/harness` lists drafts
  — it reads `templates` with the service role, on a page that 404s off the developer's
  machine — so the mandatory harness check happens *before* publication rather than after.
  `is_published` flips in the ship sequence, after the deploy that knows the template's
  unit key (`runtime/README.md`).

## Consequences

- **A muted placement shows the message silently.** On outstream inventory that
  autoplays muted, the viewer gets the card without the chime, where the reference would
  have played it anyway. That is the cost of honouring the player's volume, and the
  field's help text says so to the advertiser.
- **"Muted" means muted over VPAID.** Fluid Player never calls `setAdVolume` — its mute
  button mutes its own `<video>` — and our Sandbox, harness and Fluid tabs mute their
  element the same way, so in all of them the chime plays even though the tab looks muted.
  Treating the video slot's `muted` as the ad's volume was considered and rejected: that
  flag is how players get autoplay, not a viewer's choice, and it would silence the chime
  everywhere a video can autoplay.
- The chime needs Web Audio; a player without it gets no sound, reported on the telemetry
  channel as `no-webaudio` rather than failing.
- **Not yet validated beyond the harness.** Behaviour inside Google IMA and Fluid Player,
  and on real mobile devices — in particular how iOS treats Web Audio under the hardware
  silent switch — belongs to the open **Verification** item in
  [mvp-scope.md](../mvp-scope.md).
- **The template cannot stop an advertiser writing a fabricated claim into the message.**
  That is the position of every text field in every template; the template itself ships
  none, and DSP creative review applies to what an advertiser writes.
- Advertisers cannot *upload* a sound yet: the `creative-media` bucket takes images and
  video only ([ADR-0010](0010-advertiser-media-uploads.md)). If hosted sounds are needed,
  that is an audio field type plus the bucket's MIME list — its own change.
- The draft-first flow is now how every new template ships, not a one-off: it is the only
  way the harness gate can run before a template is visible in production.

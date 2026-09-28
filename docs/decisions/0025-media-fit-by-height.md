# 0025. Advertiser media fit by height, with a blurred fill

- Status: Accepted
- Date: 2026-09-28

## Context

Every template drew its picture fields — the slider's before/after, the scratch reveal,
the age-gate background, quiz options, pick-message tiles — through one base helper,
`adInteractMediaLayer`, which covered its frame (`object-fit: cover` for video, `cover`
backgrounds for images). Advertisers now upload true vertical media (720×1080, 720×1280
phone clips). In a landscape slot, `cover` scales such a clip to the slot's width and
throws away its top and bottom: the face goes first. An earlier upload had the opposite
problem — a 16:9 file with black bars baked into the frame — which no player-side rule
can see without reading pixels.

The advertiser asked for the social-feed look: a vertical video shown whole at full
height, with the empty sides filled by a blurred copy of itself, for video and images
alike, in every template.

## Decision

- **A medium always fits its frame's height.** Wider than the frame at that height, it is
  cropped at the sides, centred (the same pixels `cover` showed in a 16:9 slot); narrower,
  the space at its sides is filled by a blurred, darkened copy of the same medium.
- **One base helper, `adInteractFitMedia(url, api, name)`**, builds on
  `adInteractMediaLayer` and is what every template's picture fields use. The foreground is
  sized by CSS alone (height 100%, width from the medium's own ratio), so it follows any
  resize of the frame.
- **An image's copy is a second CSS background** — one decode, no script.
- **A video's copy is a small canvas repainted from the playing element**, about 15 times a
  second, on `requestVideoFrameCallback` (rAF of the element's own window where that is
  missing). It is drawn and never read, so it needs no CORS, and it costs no second
  download or decode. A second `<video>` was rejected for exactly those costs: two decoders
  per frame (four for a two-video slider) and, where the browser does not share the bytes,
  twice the download inside an ad frame that Chrome's heavy-ad intervention meters. The
  canvas is at least 144px on its short side, since some engines keep smaller canvases on
  the CPU, where every draw reads the whole decoded frame back from the GPU; the first ten
  draws are timed, and past 4ms the copy freezes on its last frame
  (`tpl:backdrop`). It is drawn only while it is visible, and stops when its video is
  emptied or the ad ends.
- **No pixel analysis.** Bars baked into a file are the file's; the fix for them is the
  file (export 16:9 with the blur in the picture, or the clip at its own shape).
- **Two exceptions.** pick-message's round avatar keeps `cover` — a face should fill a
  40px circle. Shoppable Video's clip is played by the player's own element, not drawn by
  the unit, so it keeps whatever the player does; giving it the fill would mean the unit
  playing the clip itself, which changes sound and autoplay, and was declined.

## Consequences

- Every unit is re-built and re-pushed: the base is part of each one.
- A narrower medium now shows whole where it used to be cropped top and bottom; a wider
  one is cropped exactly as before in 16:9 slots. In a portrait slot a landscape medium
  keeps only its centre — the height rule is absolute.
- The slider's two pictures line up only if they share a shape, as its premise
  ("same-framed images") always required; two clips of different proportions now differ
  in width where `cover` made them the same.
- `tpl:media` (per video: size, `blur` on/off, load `error`) and `tpl:backdrop` (draw cost)
  make the rule observable on the telemetry channel (ADR-0019).
- Checked in the Chromium harness at four slot sizes and in Fluid Player's loading model on
  current Chromium. Older Chromium also fires `emptied` when a video with a source moves
  to another document — every fitted video does, in Fluid — so only a video whose source
  was removed ends its copy; that case is reasoned, not run. Safari/iOS, Android WebView
  and IMA itself are not reachable from this machine and stay with the open
  **Verification** item in [mvp-scope.md](../mvp-scope.md).

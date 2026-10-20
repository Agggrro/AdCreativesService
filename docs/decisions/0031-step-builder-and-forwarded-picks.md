# 0031. Step Builder: the first steps of a landing's flow, and picks that travel with the click

- Status: Accepted
- Date: 2026-10-20

## Context

Advertisers on "create your own AI girl" offers asked for a preroll that does what their
landing does: a step-by-step builder. The first one we looked at (`xpeach.app/create`)
runs six steps: style (realistic or anime), ethnicity, hair and eye colour, body,
personality, and a summary that ends in sign-up. Each step is a row of looping clips, and
every pick is written to the page's query string: `/create/features?style=anime&
ethnicity=elf&hairStyle=buns` opens the hair step with buns already chosen, the stepper
at step three, and every later step defaulted. The clips of each step after the first
depend on the style picked at the first: `…/female/{realistic|anime}/asian.mp4`.

An ad that runs the first steps is worth having only if the landing carries on from
them. A viewer who picks three things in the ad and then lands on step one has been made
to repeat themselves, which is the opposite of the hook. But every click destination in
a served tag is our `/r` link ([ADR-0023](0023-conversion-postbacks.md)), and `/r` reads
the destination from the creative's config by field name, never from the request. That
is deliberate: it is what keeps the ad domain from being a redirect to anywhere. So the
picks had no way through. The quiz's answer to per-path destinations, one URL field per
path, does not scale: three steps of 2, 4 and 4 options are 32 paths.

## Decision

Ship a new VPAID template, **Step Builder** (`step_builder`,
`runtime/templates/step-builder/vpaid.js`), and let `/r` carry a viewer's picks on to the
destination.

### The template

- **Two or three steps, two to four tiles each.** A tile is a looping clip or a picture
  with a label, fitted by height ([ADR-0025](0025-media-fit-by-height.md)). The header
  shows a counter (`2/6`), the step's title and a progress bar, clear of the close
  control. A tap rings the tile, dims the others, and the next step replaces the row.
  After the last pick, that pick's clip takes the slot, under a line of every pick, the
  advertiser's title and a button.
- **Passing the picks on is the advertiser's switch** (`passPicks`, off by default).
  Only a landing built to read them gains from it. With it on, each step names a query
  parameter (`step<N>Key`) and each option a value, and the button opens the
  click-through with the picks appended as `key=value`. A parameter the URL already
  carries is never repeated. With it off, the name and value fields are hidden and the
  click-through is opened as written.
- **`{key}` in a media URL is an earlier pick.** `…/{style}/asian.mp4` resolves after
  the style step, so a later step can show the clips that match an earlier choice. The
  landing works the same way.
- **An uploaded clip has a second slot for step one's option B** (`step<N>Opt<I>MediaB`,
  steps 2–3). An upload's URL is `{owner}/{uuid}.mp4` (ADR-0028). It has no path to put
  `{key}` in, so a flow whose later clips depend on a two-way first pick (realistic or
  anime) names both clips outright. A pick of C or D at step one uses the plain clip.
- **The counter is the advertiser's count of their own flow** (`stepsTotal`, at least the
  ad's own steps). The ad's last screen shows `3/6` and a part-filled bar, and the
  landing's own stepper then shows step three. That is true of the flow as it exists, not
  a claim the ad makes up. The defaults (`Choose a style`, `Almost there`, `Continue`)
  claim nothing.
- **Nothing is picked for the viewer.** Duel resolves its round when the countdown ends
  ([ADR-0030](0030-duel-template.md)). A builder that picked for the viewer would be
  building someone else's choice, and loading every later step's clips without a touch
  would cross the heavy-ad budget (below). A viewer who never taps stays on step one, with
  its clips playing and the tiles taking turns to light up, until the ad ends. The
  player's own click on the video (the VAST `<ClickThrough>`) still reaches the landing,
  without picks.
- **One click-through, from the button only, once.** A tap within 600 ms of the last pick
  is the same gesture and is ignored. The tiles never click through. The button breathes
  and a ring ripples out of it, on `transform` and `opacity` only, until it is pressed or
  the ad ends.
- **The player's pause reaches the clips** (`api.onPause` / `api.onResume`). A paused ad
  takes no pick. Everything stops with the ad (`api.onStop`): the hint, the pending
  advance, the button's motion, the observer, and every clip's source.
- **No sound.** The clips play muted, as every tile in every template does.
- **Draft-first**, like every new template since [ADR-0024](0024-pick-message-template.md):
  seeded with `is_published = false`, checked, and published in the ship sequence after
  the deploy that knows `step-builder/vpaid.js`.

### Forwarded picks on `/r`

`/r` appends to the destination the query parameters on the click link that are not its
own (`cid`, `f`, `exp`, `sig`), under four rules (`appendForwardedParams` in
`lib/click-destination.ts`, pinned by `npm run test:click`):

- **Never over the owner's own parameters.** A name the destination already has,
  compared without case, is skipped. A crafted link cannot replace an affiliate id, a sub-id or the `{click_id}` a
  network attributes by.
- **Names match `^[A-Za-z][A-Za-z0-9_]{0,31}$`, values `^[A-Za-z0-9_-]{1,64}$`.** That is
  an option id, never free text, a URL or a macro, and none of it needs encoding.
- **At most eight**, the first of a repeated name.
- **Appended as text, after the `URL` normalization**, so the owner's query is sent as
  serialized there and none of it is re-encoded.

The host, path and every parameter the owner wrote stay the owner's. Whoever can craft a
link could already send a visitor straight to that landing with the same parameters, so
forwarding adds little reach. What it does add: a parameter the owner did not set (an
optional `aff_sub2`, say) can now arrive on a click that has a minted click id. A
per-template allow-list of forwardable names is the next step if that ever matters. It is also not specific to Step Builder: any unit that appends
picks to its click link gets them through.

## Consequences

- **Picks reach the landing only from the unit's own button.** The VAST `<ClickThrough>`
  is built once per tag, before anyone picks anything. A player that ignores the URL in
  `AdClickThru` and opens `<ClickThrough>` instead lands the viewer on the plain
  destination. They arrive at the right landing, at its first step.
- **A landing has to read the parameters for the picks to matter.** The advertiser
  chooses the names and values to match. A landing that ignores them still gets a normal
  visit, with harmless extra parameters.
- **Chrome's heavy-ad intervention meters step one.** It unloads an ad that downloads
  more than 4 MB before the viewer interacts with it. Only step one's tiles load at mount.
  Each later step loads after the tap that reached it, which Chrome no longer meters. The
  field help asks for step one's clips under about 3.5 MB together. The reference
  landing's two style clips are 1.0 and 1.2 MB, and a four-tile first step of its
  ethnicity clips (≈ 4 MB) would not fit.
- **Clips are loaded per step, not preloaded.** A later step's tiles appear with their
  labels and fill in as their clips arrive. Preloading would spend the heavy-ad budget on
  clips most viewers never see.
- **Up to 57 config fields, laid out as one compact table per step.** Each step's
  options are a `kind: "options"` group: one row per option (`A`–`D`), with the label
  (and the value, when picks are passed on) heading the row, and the clip (and, from step
  2, its variant for step 1's pick B) as upload tiles beside it, each named under it. It is the scenario table
  (docs/design-system.md §6) without the play-order numbers and chevrons, because an
  option's clips are variants, not stages. A three-step xpeach creative is 18 clips, and
  every one sits in view as a tile rather than behind a collapsed row.
- **Picks reach only the real query string.** The unit and `/r` both insert them before
  `#`, so a landing that routes in its fragment (`/#/create?style=…`) does not see them.
- **A key or value outside the patterns is dropped, not refused.** The configurator has
  no field patterns, so the help states the rules, and the unit's `finish` record shows
  the URL it built. A pick whose key the owner's destination already has is in that
  record and still dropped by `/r`, which is the only place that knows the destination.
- **The forwarded parameters are not recorded.** The click row keeps the field the viewer
  left through, as before. Which picks led to a conversion is the landing's own
  analytics, not ours.
- Not yet validated beyond a local VPAID host. Running it in `/dev/harness` (which needs
  the database) and in IMA and Fluid belongs to the open **Verification** item in
  [mvp-scope.md](../mvp-scope.md).

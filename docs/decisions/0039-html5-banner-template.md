# 0039. HTML5 Banner: an advertiser's own banner inside the video slot

- Status: Accepted
- Date: 2026-11-07

## Context

Media buyers already have HTML5 banners — exported from Google Web Designer, Adobe
Animate, or hand-written — and want to run them on video inventory through our tag,
without rebuilding the creative as one of our mechanics. Until now every template drew
its own interface; nothing let a buyer bring a creative of their own.

An HTML5 banner is a document with script in it. Run where the VPAID unit runs it would
execute in the player's document — in Fluid Player that is the publisher's page
([runtime/README.md](../../runtime/README.md), "Layout") — with every power a script there
has. That is the whole problem: the banner must run, and nothing of ours or the
publisher's may be reachable from it.

The banner also has to **click**. HTML5 display banners open their landing page
themselves — `window.open(clickTag)`, a link, `Enabler.exit()` — and a video player
learns of a click only through VPAID's `AdClickThru`. A banner that opens its own window
is a click the DSP never counts and a popup most browsers block.

## Decision

Ship **HTML5 Banner** (`html5_banner`, `runtime/templates/html5-banner/vpaid.js`), a VPAID
template whose configuration is the banner's HTML.

- **The banner runs in a sandboxed iframe of its own**, built by the unit inside the
  slot: `srcdoc` with `sandbox="allow-scripts"` and nothing else. The document gets an
  opaque origin: it can draw, animate, load its assets and post messages to its parent,
  and cannot read or script the document it sits in, navigate the top frame, submit a
  form, open a window, or reach storage and cookies. This is the browser's guarantee,
  not our discipline, and it holds wherever the unit runs — IMA's iframe, Fluid's host
  page, our own preview and harness pages.
- **A bootstrap runs ahead of the banner's code**, injected at the top of `<head>`. It
  defines `clickTag` (and the spellings `clickTAG`, `clickTag1`, `clickTag2`), replaces
  `window.open`, intercepts clicks on links to `http(s)` pages, and provides a minimal
  Studio `Enabler` with its `studio.events.StudioEvent` constants — initialised at once,
  exits through the same path — for a banner exported by Google Web Designer that never
  loads the real one. A banner that does load `Enabler.js` replaces the shim; its exits
  still end in `window.open`, which is still ours.
- **Every exit is one message to the unit, and the player opens the destination.** The
  unit raises `AdClickThru` with the creative's click-through URL — the `/r` link
  ([ADR-0023](0023-conversion-postbacks.md)) the builder already put into AdParameters. The
  banner cannot pick a different destination: the tag's `<ClickThrough>` and the click
  have to agree, and a DSP's creative review checks exactly that.
- **The banner never holds the real URL.** Its `clickTag` is a sentinel
  (`about:blank#clickTag`): a link to it is still a link and `window.open` of it still an
  open, both caught by the bootstrap, while a banner that navigates to it, fetches it or
  paints it into an `<img>` reaches nothing — in particular not `/r`, which mints a click
  id on any fresh GET and is handed to the player alone. The first draft gave the banner
  the real link; a review found that a self-navigation or a pixel would have recorded a
  click the gesture gate never saw. A blank page rather than an unresolvable host,
  because a navigation to it completes at once with no network, where DNS for a
  `.invalid` name took seconds with the banner hidden meanwhile.
  `window.open` returns a window-shaped stub rather than `null`, so a banner does not take
  the "popup blocked" road and navigate itself.
- **Only a gesture of the viewer's makes an exit a click, and the browser is asked, not
  the banner.** The bootstrap keeps the time of the last *trusted* pointer or key event in
  the banner and sends its age with every exit; the unit counts an exit as a click only
  when that age is under 1.5 s **and** `navigator.userActivation.isActive` holds in the
  slot's window — a gesture inside the frame activates every ancestor document whatever
  the origins, so a message that claims a gesture the browser has not seen is a forgery
  and is refused, as is a forged `engage`. The activation window is the browser's (about
  five seconds) and in a same-document player it is set by a gesture anywhere on the
  publisher's page, so the gate narrows a forged click to that window rather than
  removing it; a banner that cheats inside it is a creative-review matter, and its
  `tpl:exit` records show the pattern. The rest is reported as `tpl:exit-ignored`. A
  banner that opens its destination on a timer, or on load, reports a click nobody made —
  the auto-redirect creatives ad networks ban — and the player never hears of it. Where
  the activation API is absent, the bootstrap's own word stands.
- **A banner that navigates its own frame** (`location.href = clickTag`, from a banner
  that expected to be the page) is detected by the frame's second `load`; it navigated to
  the sentinel, so nothing was fetched, and the frame is hidden from the moment it leaves
  until the banner is back (or, after a navigation the browser cancelled, after 4 s). The
  bootstrap reports the gesture age from `beforeunload` — a message posted from
  `pagehide` or `unload` is dropped with the document — and where that event does not
  fire (WebKit) the unit falls back to the age of the last trusted gesture it was told of,
  allowing 2.5 s for the navigation. The same rule applies: on a gesture it is a
  click-through and the banner is reloaded for the next one; without one it is ignored,
  and the banner is reloaded once rather than for the whole ad.
- **Engagement crosses the frame.** Input inside the banner never reaches the slot, so
  the base's own engagement listeners ([ADR-0032](0032-engagement-extends-the-ad.md)) are
  blind to it. The bootstrap posts every trusted gesture, and the unit passes it to the
  new `api.engage()` in the shared base, which extends the ad exactly as a tap in the slot
  would (and, like one, moves the end at most once a second).
- **Fitted into the slot, not stretched.** The banner's own size is read from the
  `<meta name="ad.size">` convention Studio and the IAB share, else from the width and
  height fields (300×250 by default). *Scale to fit* — the default — scales the document as
  a whole to the slot, up or down, centred; *Actual size* keeps its pixels. The space
  around it is a colour, or a picture or clip fitted behind it
  ([ADR-0025](0025-media-fit-by-height.md)). The close control sits over the banner's
  corner as it does over every template ([ADR-0009](0009-mandatory-close-control.md)).
- **The HTML is a `textarea` field with a ceiling.** `config_json` is inlined into
  `<AdParameters>` on every ad request, so the field carries `maxLength: 153600` — 150 KB,
  the IAB HTML5 initial-load figure — and the schema layer enforces it at save and at
  preview, not only in the input. The field's default is a sample banner
  (`runtime/templates/html5-banner/sample.html`), which is what the catalog demo and the
  harness run. `maxLength` and `rows` are new, generic `config_schema` keys.
- **A preview past the token ceiling is kept in KV.** The configurator's preview carried
  the whole config in a signed URL token, which caps it at about 5.6 KB
  ([ADR-0011](0011-conditional-grouped-config-schemas.md), "Preview token ceiling"); that
  ADR named the answer for anything larger — a short opaque id backed by a row. The row is
  a Workers KV key (`preview/<pid>`, `lib/vast/preview-store.ts`) with a lifetime KV
  enforces itself, and the token then names the id alone. Configs that fit the token
  still travel in it; nothing changes for the other templates.
- **Seeded as a draft, verified, then published**, the order
  [ADR-0024](0024-pick-message-template.md) set.

## Consequences

- **VPAID only.** Like every image template, the banner has no base video, and SIMID
  layers over a playing one ([ADR-0005](0005-interactive-image-creatives.md)). A SIMID
  variant would be a second document of its own under `/c/s/:token`, whose CSP would
  have to admit a nested sandboxed frame; not built.
- **One file.** The banner is pasted as a single HTML document with its CSS and JS inline
  and its images and fonts by `https` URL. A zip export with sibling files is not
  accepted; the exporter's "inline everything" option, or hosting the assets, is the
  advertiser's step. Hosting them on our media domain is an upload type we do not take
  yet ([ADR-0010](0010-advertiser-media-uploads.md)).
- **The banner cannot be paused.** `pauseAd` stops the ad's clock; a banner's own
  animation runs on. A banner with sound of its own is outside the player's volume, and
  the field's help says so; nothing of ours makes a sound.
- **The VAST is as big as the banner.** `config_json` is inlined into `<AdParameters>` on
  every ad request, so a creative of this template answers with a document of up to
  150 KB of banner (more for a non-Latin script, which the 640 KB preview ceiling
  allows for) on every impression — from the KV snapshot and the ad Worker's cache,
  which hold it fine, but a DSP or SSP that caps the size of a VAST it fetches, or a
  slow mobile network, feels it. A light banner is the advertiser's lever; the field's
  help says to link images rather than inline them.
- **A stored preview is eventually consistent.** KV propagates a write between data
  centres within seconds; a player whose fetch lands elsewhere inside that window reads
  a miss, which the binding caches for 60 s, and the configurator shows an empty ad for
  that one launch. The stateless token had no such window. Launching again is the
  remedy; nothing is retried automatically.
- **Chrome's heavy-ad intervention meters the banner too.** An animation that repaints
  every frame for the whole ad is the advertiser's to keep light; the template adds the
  scaled frame and nothing else.
- **Inline scripts are subject to the host page's CSP.** A `srcdoc` document inherits the
  Content-Security-Policy of the document that embeds it. Inside IMA's iframe that is
  Google's policy, which runs VPAID creatives; in a same-document player it is the
  publisher's, and a page that forbids inline script would blank the banner. The
  telemetry channel reports a banner whose script threw (`tpl:banner-error`), which is
  the symptom.
- **Not yet validated beyond the harness and a real browser's clicks.** Behaviour inside
  Google IMA and Fluid Player, and on real mobile devices, belongs to the open
  **Verification** item in [mvp-scope.md](../mvp-scope.md).

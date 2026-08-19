# 0021. The validator's player runs on an isolated origin

- Status: Accepted
- Date: 2026-08-19

## Context

The VAST validator ([ADR-0013](0013-public-free-tools-section.md),
[ADR-0014](0014-vast-inspection-engine.md)) does not merely parse a tag — it plays it,
through Google IMA, with `VpaidMode.INSECURE`. That mode is correct and is not up for
debate: **every production player that runs VPAID at all runs it that way**, and a
validator that sandboxed the unit would report a success the tag will never actually
have. Fidelity is the entire product.

What INSECURE means is that IMA executes the VPAID JavaScript in the hosting document's
own origin rather than in its cross-origin bridge iframe. Until now the hosting document
was `/tools/vast-validator` on the app origin. So a tag someone pasted got same-origin
reach over the app: the DOM, `localStorage`, and `fetch()` against our own API routes
carrying whatever session cookies the visitor had. Dry-run does not touch this —
`neutralize.ts` deliberately leaves `MediaFile` intact, because rewriting the ad itself
would mean not testing the ad.

The realistic path is social, and it is the tool's advertised use: *"check this tag for
me."* A signed-in user checking a crafted tag ran it beside their own dashboard session.

The page used to offer a three-way VPAID mode control, which looked like mitigation and
was not: `insecure` was its default, the other two values report failures the tag will
never meet, and the choice asked a visitor to weigh a trade-off they have no way to see.
It was removed as part of the validator rebuild, which turned a bad default into an
unconditional one and made this decision unavoidable.

## Decision

**The player runs in an iframe on an origin that is not the app's.**

- `app/c/player` is a page whose whole job is to be that origin. It holds the IMA
  integration, the ad container, and the content clip; the app page holds no ad code at
  all any more.
- `getSandboxUrl()` (`lib/site.ts`) resolves it: `NEXT_PUBLIC_SANDBOX_URL`, else
  `NEXT_PUBLIC_CDN_URL` — the ad domain of [ADR-0018](0018-dedicated-ad-serving-domain.md),
  already a separate registrable domain that middleware refuses to write a cookie to —
  else, in local development only, the loopback twin (`localhost` ↔ `127.0.0.1` on the
  same dev server, which `next dev -H 127.0.0.1` makes reachable).
- **It fails closed.** When no cross-origin home resolves, the stage renders a refusal
  and the page says why. A boundary whose absence looks like success is worse than not
  having one, and "falls back to the app origin" is exactly that failure mode.
- The two sides speak over `postMessage` with `targetOrigin` pinned on both ends and
  every inbound message checked against **both** the expected origin and the expected
  `source` window. The only `*` in the protocol is the frame's opening `ready` ping,
  which carries no data and exists because a frame cannot know its parent's origin before
  being told. This is the discipline of [ADR-0019](0019-creative-telemetry-channel.md)
  applied one boundary out.
- `frame-ancestors` on `/c/player` restricts who may embed it, so the page cannot be
  reused as a VPAID execution surface pointed at our domain from someone else's.
- The iframe carries `allow="autoplay"`. Transient user activation does not cross into a
  cross-origin frame, so the click that starts a run has to be delegated explicitly or
  the ad cannot start itself.

## Consequences

The exposure is gone rather than accepted: a hostile unit now runs on an origin that
holds no session of ours, no `localStorage` of ours, and reaches no API of ours. INSECURE
stays, so does the fidelity, and the visitor is asked to decide nothing.

`/c/` was already the one prefix the ad domain serves besides the tag and the beacons, so
this needed no new route allowance there — but it does put an HTML page on that host for
the first time. The root layout's analytics gate already keys on the same host check, so
neither script loads there.

**We lost the ability to instrument the player from the parent page**, and that is the
control working as designed — the same-origin policy that stops a creative reading our
page also stops our tooling reading the frame. The replacement is better than what it
cost: the frame now reports what it *did* about each IMA request, not only that the
request arrived. `contentPlaying`, `contentPaused` and `contentBlocked` are emitted by our
own code with source `validator`, so the timeline reads "IMA asked / the page complied"
as two rows. That distinction is precisely what made the original content-resume bug look
like a mystery — the log said `contentResumeRequested` and the video sat still, because
nothing was listening. A timeline that shows only the request cannot tell those apart.

The loopback-twin fallback is a development affordance in shipped code, which is a cost.
It is bounded by construction: it can only ever produce a loopback host, so it cannot
resolve to anything reachable from a deployment. The alternative — requiring an env var
before the validator plays anything locally — would have meant the isolation was first
exercised in production, which is how boundaries get discovered to be broken.

A production deployment with `NEXT_PUBLIC_CDN_URL` unset now has a validator that
analyses but does not play. That is the intended behaviour and the notice says so, but it
does make the ad-domain configuration load-bearing for a second feature.

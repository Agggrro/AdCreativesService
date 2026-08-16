# 0018. A dedicated ad-serving domain, with neutral paths

- Status: Accepted
- Date: 2026-08-16

## Context

Two domains were bought: `creosmith.com` for the product and `smithcdn.net` for ad
delivery. Serving both from one Vercel project raises the question of what, exactly,
the ad domain should answer.

The ad domain is loaded inside other people's players on other people's pages. Three
things follow, and none of them are cosmetic:

- **Any cookie set there is a third-party cookie**, which browsers are removing anyway
  — and a session cookie on an ad host is a liability, not a feature.
- **Ad hosts get blocklisted.** A filter list that catches the delivery host must not
  take the domain that runs checkout and login with it.
- **A path announces itself.** `/api/vast?creative_id=…` tells every filter between the
  player and us what the request is for.

## Decision

**One Vercel project, two domains, separated by routing rather than by deployment.**
The serving code is the same code; duplicating the project would duplicate the
environment and let the two drift.

**Neutral public paths, registered on every host:** `/v` (VAST), `/t` (beacons),
`/c/s/…` (the SIMID document), `/c/u/…` (the VPAID unit). They are host-agnostic on
purpose — one URL shape for the code to emit, and local development exercises the same
routes as production. The `/api/*` originals keep resolving **forever**: tags already
pasted into a DSP point at them, and a tag that stops resolving is a campaign that
stops.

**The unit is served from our own host too.** `/c/u/:path*` is an *edge rewrite* to the
public blob store, not a proxy route: no function wakes, nothing reads Supabase, and
the object's year-long immutable cache still applies. This was initially left pointing
straight at `*.public.blob.vercel-storage.com`, which would have made a customer's ad
ops whitelist two hostnames to run one creative. The rewrite costs a hop inside
Vercel's network and, on the plan this runs on, nothing at all — [ADR-0017](0017-runtime-assets-on-public-cdn.md)'s
win was removing the *function*, not the hop.

**Nothing else answers on the ad domain.** A host-scoped `beforeFiles` lockdown sends
every path that is not an ad path or the domain's own information page to a 404. The
dashboard, auth, the Stripe webhook and the free tools are not reachable there.

**No cookie is ever set on it**, enforced in two places because one is not enough:
`middleware.ts` returns early on that host before `updateSession()` — the only code in
the app that writes cookies — and the hot ad paths are excluded from the matcher
entirely, so they never invoke middleware at all. The matcher lists them by their
public names (`v`, `t`, `c`), because middleware runs *before* rewrites and sees `/v`,
not `/api/vast`.

**`NEXT_PUBLIC_CDN_URL` is the switch.** Unset, `getCdnUrl()` falls back to the app URL
and nothing changes; set, every URL in the VAST moves to the ad domain. That is what
makes the cutover two steps and the rollback one.

**The root of the ad domain serves one page**, for the ad ops person who found the
hostname in a tag and has to decide whether to whitelist it. It renders **both locales
at once** — there is no language cookie on that host by design, and the audience is
international — which satisfies the bilingual rule without putting locale logic on a
public ad path.

## Consequences

- A blocklist that catches `smithcdn.net` costs delivery, not signups and checkout.
- The tag names one hostname. Ad ops whitelist one thing.
- CORS is `*` with **no `Vary: Origin`** on the ad paths: varying would shard the CDN
  cache per publisher, paying an origin miss for every new site a tag appears on.
- **Two more places that must stay in step.** The `beforeFiles` lockdown's negative
  lookahead has to list the rewrite *targets* as well as the ad paths, because
  `beforeFiles` entries are all evaluated in turn and can otherwise chain into one
  another. And the middleware matcher has to name the public paths. Both are the kind
  of thing that is only ever caught by a request, not by a type — verify them by
  fetching, not by reading.
- The `/c/u/` rewrite's destination is read out of `runtime/manifest.ts` at build time,
  since the blob store's id is part of its hostname and nothing else knows it. Before
  anything has been pushed the rewrite is not registered — and nothing resolves to it
  either, because `resolveInteractiveUrl` falls back to the proxy route in exactly that
  case.
- `next.config.ts` imports the manifest directly rather than through
  `lib/runtime-manifest.ts`: the config is transpiled and run outside the app's module
  resolution, so the `@/` alias does not resolve there.
- The old `.vercel.app` host keeps working. Vercel does not withdraw it, and the
  `/api/*` paths are untouched, so every tag issued before this change still serves.

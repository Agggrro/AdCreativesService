# 0029. Off Vercel: the ad path and the app on Cloudflare Workers

- Status: Accepted
- Date: 2026-10-03
- Amends: [ADR-0015](0015-serving-snapshots-on-cdn.md) (the snapshot store moves from
  Vercel Blob to Workers KV), [ADR-0017](0017-runtime-assets-on-public-cdn.md) (the runtime
  store moves from a public Vercel Blob store to R2 behind `media.smithcdn.net`) and
  [ADR-0018](0018-dedicated-ad-serving-domain.md) (the ad domain's routing moves from
  `next.config.ts` rewrites into a Worker). The *rules* those records set — snapshots read
  instead of Postgres, content-addressed units, neutral paths, nothing but ads on the ad
  domain — all stand.

## Context

Everything ran on one Vercel project on the Hobby plan, and the ad path is what broke the
fit.

- **The ad path is billed per request, and it is the product's hottest path.** An
  impression costs the tag (`/v`), the impression beacon and — for VPAID — the viewability
  beacon (`/t`), plus `/r` on a click: about three function invocations. The tag's 60-second
  CDN cache absorbs less than it looks, because DSPs append a cache-buster to every tag
  request, and a different query string is a different cache entry. Hobby's allowance runs
  out around a quarter of a million impressions a month — a single afternoon of the
  traffic the first buyer intends to run.
- **Hobby is non-commercial by its terms**, so the product could not stay on it either way.
  Pro moves the ceiling without changing the shape: every impression is still a metered
  invocation and a metered edge request.
- **Cloudflare already holds the rest.** Both zones are on Cloudflare (`smithcdn.net` since
  ADR-0028, `creosmith.com` since 2026-10-03) and advertiser media is on R2. Workers Paid is
  $5 a month with 10 million requests and 30 million CPU-milliseconds included, then
  $0.30 per million requests and $0.02 per million CPU-milliseconds. A lean Worker answers
  a tag or a beacon in about a millisecond of CPU, so an impression costs roughly a dollar
  per million on top of the base.

## Decision

**Two Workers, one repository: `creosmith-ads` answers the ad domain, `creosmith-web` is the
Next.js app. Supabase and Stripe stay where they are. Vercel ends up serving nothing.**

### 1. `creosmith-ads` — the ad domain, without a framework

A hand-written Worker (`workers/ads/`, bundled by wrangler) owns `smithcdn.net`:

| Path | Answer |
| --- | --- |
| `/v` | the VAST tag (GET, HEAD, OPTIONS preflight) |
| `/t` | the beacon (`204`, write after the response) |
| `/r` | the click redirect (GET, HEAD) |
| `/c/s/:token` | the SIMID document |
| `/c/u/runtime/….js` | forwards a runtime *script* to `media.smithcdn.net`, for tags already in flight — never the SIMID document, never an upload |
| `/robots.txt`, `/cdn-robots.txt` | `Disallow: /` |
| `/`, `/cdn`, `/cdn/*`, `/c/player`, `/_next/*` | forwarded unchanged to the app over a service binding, GET and HEAD only |
| `/.well-known/acme-challenge/*` | the zone's origin — Vercel, whose certificate a rollback needs — until Vercel is decommissioned |
| anything else | `404` |

- **One implementation of the ad path, not two.** The handlers move out of
  `app/api/*/route.ts` into `lib/serving/http/`, as functions of `(request, platform)`. The
  Next routes shrink to one-line wrappers — they still serve `npm run dev` and the legacy
  `/api/*` paths on the app domain — and the Worker imports the very same modules. The VAST
  builder, the CORS rule, the token modules and the entitlement port are imported, not
  ported; a fork of the code that decides whether a paid ad serves would be a drift waiting
  to happen.
- **The platform seam is two functions.** `waitUntil` (`ctx.waitUntil` in the Worker,
  Next's `after()` in a route) and `country` (`request.cf.country` in the Worker, the
  `x-vercel-ip-country` / `cf-ipcountry` header in a route). `@vercel/functions` goes.
- **The tag is cached per data centre, keyed on the creative alone.** The Cache API, with a
  key built from the creative id and nothing else, so a DSP's cache-buster no longer makes
  every request a miss. The body is stored without CORS headers and the VAST 4.2 headers
  are added per request (`lib/vast/cors.ts`, ADR-0026), so one copy serves every
  publisher. Sixty seconds, the same window `s-maxage` gave. The Cache API supports neither
  `stale-while-revalidate` nor `stale-if-error`, so the second one is rebuilt by hand: the
  last good document is kept for five minutes under a separate key and served when our own
  state cannot be read — and put back as the fresh copy for ten seconds, so an outage costs
  a data centre one failed read every ten seconds rather than one per request. A `503` is
  never stored, and the Postgres fallback is bounded at 2.5 s so a slow database still
  ends in one while the player is waiting. Players are told `public, max-age=0`: a bare
  `public` lets a downstream cache invent a lifetime the kill switch cannot reach.
- **The SIMID document's token lives ten minutes**, not two: a tag may now be handed out
  six minutes old (sixty seconds fresh, five more as the last good copy), and every URL
  inside it must still resolve. It guards an anonymous template.
- **Next's method matrix, kept.** GET and HEAD where Next answered them, the `/v` preflight
  from `lib/vast/cors.ts`, `405` with `Allow` for anything else.
- **Still no cookies on the ad domain.** `Set-Cookie` is stripped from every forwarded
  response, and HSTS goes on every answer, as Vercel sent it (`max-age=63072000`).
- **Logs that do not scale with impressions.** Workers Logs keep console output only —
  `observability.logs.invocation_logs = false` — so the `[serving-fallback]` and
  `[click-redirect]` lines are searchable while a log line per impression is not paid for.

### 2. `creosmith-web` — the app, through OpenNext

The Next.js app runs on Workers through `@opennextjs/cloudflare`: dashboard, auth, server
actions, the Stripe webhook, `/pb`, the free tools, the legacy ad paths, and the daily
snapshot audit as a cron trigger. OpenNext rather than vinext: it runs the real Next
build instead of a re-implementation of its API, and this app leans on the parts a
re-implementation gets wrong first — middleware, server actions, `next/og`, host-conditioned
rewrites. Its current adapter needs Next 16.3.8, which was also owed for twelve security
advisories against 16.2.9; the production build moved to webpack, because Turbopack's
fails on `next/font/google` in 16.3.8. What changes in the app is only what was Vercel's:

- `waitUntil` → `after()`; the geo header → `cf-ipcountry` (whichever header the running
  platform owns — the other one is client-supplied there); `vercel.json` crons → a
  `scheduled()` handler; `@vercel/analytics` and Speed Insights → Cloudflare Web Analytics
  (page views and Core Web Vitals, cookie-less, behind the same ad-domain gate).
- The Stripe client uses the fetch transport, and the webhook verifies with
  `constructEventAsync` and SubtleCrypto: the Workers build of `stripe` has no synchronous
  signature check, and the catch around it would have turned every event into a 400.
- The validator's outbound fetch guard keeps its socket-level DNS pinning on Node; on a
  Worker, whose `http.request` is a shim over `fetch` that refuses a custom `lookup`, it
  resolves through DNS-over-HTTPS, requires every address answer public, refuses IP
  literals and local names, then fetches — accepting a rebinding window docs/security.md
  describes.
- The developer-only gate refuses inside any Worker, the counterpart of its `VERCEL` check;
  `getRequestOrigin` reads the request URL there, since Cloudflare passes a client's own
  `X-Forwarded-*` through; Fluid Player loads on the client only, keeping three megabytes
  of player code out of the server bundle; the Blob SDK is imported only where Blob is
  configured; the sitemap is built per request, since nothing would revalidate it.
- **A custom entry** (`workers/web/index.ts`) wraps OpenNext's Worker: it registers the KV
  binding for the snapshot store, pins `__NEXT_PRIVATE_ORIGIN` to the app's origin — OpenNext
  takes it from the isolate's first request, which could be one forwarded from the ad
  domain — and runs the daily audit as the `scheduled()` handler.
- **Built in CI, never on a workstation.** `opennextjs-cloudflare build` copies any `.env*`
  file into the Worker, so a build next to `.env.local` would ship its secrets; the CI
  runner has none, and NEXT_PUBLIC_* come from the repository's Actions variables.
- The cache is OpenNext's read-only static-assets cache: `/icon`, `/opengraph-image` and
  `/robots.txt` are the only prerendered routes and nothing revalidates, so there is no R2
  bucket, queue or Durable Object to run for an incremental cache the app does not use.
- The ad domain's pages (`/cdn`, `/c/player`) reach the app through a service binding from
  `creosmith-ads`, so they keep arriving with the ad domain's `Host` and keep the rules
  `next.config.ts` and `middleware.ts` hang on it. A request over the binding meets the
  app's static assets before its script, as one from the internet does — checked with a
  throwaway Worker before the switch — so `/_next/static/*` needs nothing of its own.

### 3. State

- **Snapshots: Workers KV**, namespace `creosmith-snapshots`, with the keys ADR-0015 already
  used. Workers read through a binding with `cacheTtl: 60` — the same window the Blob
  cache gave, so the kill-switch budget (about two minutes) is unchanged. Node scripts
  write through the KV REST API. Until the app leaves Vercel it **writes both stores and
  reads Blob** — not KV, because over REST that is the Cloudflare API, whose rate limit
  is shared by everything the account does, deploys included. Afterwards KV is the only
  store and the Blob code goes. **The audit (`/api/cron/health`, `npm run check:snapshots`)
  checks every store**, for documents that are missing and for documents whose content no
  longer matches the rows — a cancellation that reached Blob but not KV would otherwise
  serve on the ad domain while every check read the store that was right. **A failed
  publish fails closed** — each store clears what it missed — and **the reconciler**
  (`/api/cron/reconcile`, every ten minutes on the app's Worker) republishes from
  Postgres whatever changed in the last four days and still drifts: the case where a
  store could neither take a write nor clear it. A missing document is still a miss. A *failed* read — new here — falls back to Postgres for the
  entitlement too. Before, it read as "not entitled" and cached an empty ad for a minute.
- **Runtime units: R2**, in the `creative-media` bucket under `runtime/`, public at
  `media.smithcdn.net/runtime/…`. A served tag points there directly. On Vercel `/c/u` was
  an edge rewrite that woke nothing; on Workers it would be an invocation per unit load,
  and the media host is already in every tag that carries an upload. `/c/u/*` stays, for
  scripts only: as a forward for documents already in flight, and for our own previews,
  which load the unit from the page's origin so its telemetry reaches the page
  ([ADR-0019](0019-creative-telemetry-channel.md), amended). The keys under `runtime/`
  cannot collide with advertiser media: `lib/r2.ts` only ever deletes `{uuid}/{uuid}.{ext}`.
- **`runtime/` is locked.** The app holds the bucket's key to sign uploads, so sharing
  the bucket would hand anyone who leaked that key every VPAID tag's code. An R2 bucket
  lock rule (`runtime-immutable`, indefinite, prefix `runtime/`) makes every existing
  unit impossible to overwrite or delete — verified: the key gets
  `409 ObjectLockedByBucketPolicy`. It can still add objects, which no tag names: the
  committed manifest decides which hashes are served, and `runtime:push` checks the bytes
  actually served against each hash.
- **Advertiser media**: unchanged (ADR-0028).

### 4. Cutover and rollback

- **KV current before anything reads it.** A missing entitlement document means "never
  subscribed", so the Worker would serve an empty ad to every subscriber KV had not heard
  of. Before the apex is proxied: the app deployed with the KV variables (so every write
  lands in both stores), then `npm run snapshot:backfill` with them, then a clean
  `npm run check:snapshots` for `kv` — the audit compares content, not just presence.
- **The ad domain first, behind a route.** The apex records become proxied — the origin is
  still Vercel — and a Workers Route `smithcdn.net/*` sends every request to
  `creosmith-ads`. Until `creosmith-web` exists the forwarded paths go to that origin, which
  is exactly what served them before. **Rollback is deleting the route**: traffic falls
  straight through to Vercel, which still serves everything.
- **The signing secrets rotate once, at that switch.** Vercel stores them write-only, so the
  Worker cannot be handed the values that are in production. A new `PREVIEW_TOKEN_SECRET`
  and a first, dedicated `TRACK_TOKEN_SECRET` go into both at the same moment. The cost:
  beacons and click links signed in the seconds before the switch stop verifying.
- **No challenge in front of the ad domain.** Once the apex is proxied, anything the zone
  adds after the Worker — Bot Fight Mode's `__cf_bm` cookie, a JS challenge — is beyond
  the Worker's reach: it would set a cookie on the ad domain and break every player's
  fetch of the tag. Security level stays "essentially off", Browser Integrity Check and
  Bot Fight Mode off; a rate limit here is a block rule, never a challenge.
- **Then the app**, the same way: a route on `creosmith.com` to `creosmith-web`, rollback by
  deleting it. The `SNAPSHOT_KV_*` variables **stay** in Vercel's environment until
  Vercel is decommissioned: a rolled-back app without them would refuse every
  snapshot write, every webhook included. And after the cutover only KV is written,
  so a rollback also runs `npm run snapshot:backfill` to bring Blob current for the
  legacy paths that read it there. Vercel is decommissioned after a quiet week, by
  the owner.

### 5. Deploys

A push to `main` is still what ships — the trunk-based rule does not change. GitHub Actions
runs the gates and then `wrangler deploy` for both Workers, with a deploy token in the
repository's secrets. Secrets live in the Workers (`wrangler secret put`), never in the
repository.

## Consequences

- **The cost of an impression is a few requests at a dollar a million**, not a function
  invocation each. At ten million impressions a month that is about $11 all in; at a
  hundred million, about $100. Media and units are served from R2 without a Worker in the
  path.
- **Kill-switch latency is unchanged**: KV's 60-second edge cache plus the tag's 60-second
  cache. Lower `cacheTtl` (30 s is KV's floor) if it ever needs to be tighter.
- **Caches are per data centre.** The first request in each location rebuilds the tag from
  KV. That is two KV reads, not a database round trip.
- **Each beacon is still one Supabase RPC.** At real volume that is the next ceiling, well
  before Workers is. The follow-up is to batch counter increments through Queues or
  Analytics Engine instead of writing per beacon.
- **Local development does not change.** `npm run dev` serves the same handlers through
  Next; `wrangler dev` runs the ad Worker when the Worker itself is what changed.
- **Two hostnames in a tag** — `smithcdn.net` and `media.smithcdn.net` — which ADR-0028
  already made true for any creative with an upload. Ad ops allow `*.smithcdn.net`.
- **Deploying is two artifacts.** The ad Worker is small and changes rarely; when it
  changes, `npm run test:cors` and the VAST golden test pin what it must still emit.

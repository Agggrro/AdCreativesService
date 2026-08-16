# 0015. Serving snapshots on the CDN, not a live database read

- Status: Accepted
- Date: 2026-08-16

## Context

`GET /api/vast` is the ad-serving path. Every request that missed the ~60s CDN cache
made a live round trip to Postgres (`get_creative_serving`), and for VPAID a second
network call to Supabase Storage to sign the asset URL. Vercel's cache is per-PoP, so a
globally distributed campaign produced roughly one database read per PoP per minute per
creative.

The consequence is the thing that matters: **Supabase being asleep, throttled, or down
meant every live campaign went dark at once.** On the free tier, projects sleep after
inactivity ([ADR-0004](0004-mvp-on-free-tiers.md)), so this was not a remote failure
mode. The dashboard has no such requirement — it is low-traffic, and a slow login is not
a lost impression.

Two smaller defects on the same path, both fixed here:

- The fail-closed empty VAST was returned with the *same* `s-maxage=60` as a successful
  ad, so a one-second database blip was amplified into a full minute of dark inventory
  on every PoP that happened to miss during it.
- `GET /api/track` awaited a Postgres `INSERT` before returning its 204, and a single
  impression fires up to seven beacons.

## Decision

Publish the serving state to CDN-backed object storage when it is **written**, and read
it on the serving path. Postgres remains the source of truth; the snapshots are a
projection of `private.creative_serving`.

**Two documents, not one.** `creative/<creative_id>` holds the creative and its
template's runtime facts; `entitlement/<user_id>` holds that user's subscription rows.
A subscription covers every creative a user owns (all-access) or every creative on one
template (single), so folding entitlement into the creative document would turn one
Stripe webhook into N writes. Keyed separately it is always one.

**The entitlement snapshot stores facts, not a verdict.** `private.is_entitled` reads

```sql
and (s.current_period_end is null or s.current_period_end > now())
```

— it is evaluated at read time, which is why a lapsed subscription stops serving today
without any event being delivered. Snapshotting a boolean `should_serve` would discard
that property and keep a paid payload serving indefinitely past the paid period whenever
a Stripe webhook was missed, delayed, or simply not yet due. So the snapshot carries
`status`, `plan_type`, `template_id` and `current_period_end`, and
`lib/serving/entitlement.ts` re-evaluates the predicate against the clock on every
request.

**Storage: Vercel Blob, private, behind a `SnapshotStore` interface.**

- *Not Global Config* (formerly Edge Config), despite being the lowest-latency option:
  it caps at **1 MB per store on every plan including Enterprise**, which is a few
  hundred creatives, and it *rejects the write* when full. A creative that saves
  successfully but never reaches the CDN is a worse failure than a slower read. Its
  documentation also advises against frequently-updated data, and ours changes on every
  creative edit and every subscription event.
- *Private, not public.* Keys derive from `creative_id`, and that id is published in
  every VAST tag URL a customer pastes into a DSP. A public store would let anyone
  holding a tag read the raw snapshot — `user_id` and the full creative config —
  without passing the entitlement gate at all.
- The interface exists because the ceiling that forces a move is a property of the
  store, not of the product.

**Rollout is fallback-first.** A snapshot miss (absent, or an unrecognised
`schema_version`) falls back to `get_creative_serving`. Reads fail soft; writes fail
hard.

**Both interactive formats resolve through our own proxy routes**, authorized by the
same HMAC token, instead of a Supabase Storage signed URL. Minting a Storage signed URL
is a network call, and leaving it on the VAST generation path would have kept Supabase
a hard dependency of every VPAID impression even after the database read was gone.

## Consequences

- **Building a VAST document touches no Supabase service at all**, in either format.
  Postgres left via the snapshots; Supabase Storage left with the second half of this
  decision, below.
- **VPAID's asset URL is now a first-party token too.** It used to be a Supabase
  Storage `createSignedUrl`, which is a *network call*, and it sat on the VAST
  generation path — so an asleep or throttled Supabase still darkened every VPAID
  campaign even after the database read was gone. It now resolves to
  `/api/creative/unit/[token]`, the pattern `/api/creative/simid/[token]` already used
  for its own reason (Storage mangles `.html`). ADR-0003's lever is unchanged: the URL
  is still signed and still 120s. Only the signer changed, from Supabase to our own
  HMAC.
  - The Storage read did not disappear, it moved to the proxy route, behind its own
    60s cache and off the critical path. A Supabase outage now degrades *asset
    fetches* — which serve from cache for a minute and fail per-asset — instead of
    failing VAST generation outright.
  - The token's kind is carried by the object path and re-checked against the calling
    route's own allow-list, so a SIMID token cannot be replayed against the VPAID
    route and re-served as executable JavaScript, or the reverse.
  - `resolveInteractiveUrl` consequently needs no Supabase client and is synchronous.
    The two preview routes stopped constructing a service-role client entirely.
  - Remaining Supabase dependency on the wider ad path: the runtime objects still live
    in the Supabase `creatives` bucket, so the *asset* request depends on Supabase even
    though the *VAST* request does not. Moving those objects to Blob would close it.
- **The entitlement predicate now has two implementations.** `supabase/schema.sql`
  insists on one definition because a drift "would either dark a live tag or tell a
  buyer their dead tag is fine". That warning now spans a language boundary. It is held
  by `npm run check:entitlement`, which compares the deployed SQL against the repo and
  then compares Postgres's own verdict against the TypeScript port over a matrix of
  cases, and by `npm run test:entitlement`. Any change to the SQL predicate must land in
  `lib/serving/entitlement.ts` in the same change.
- **Kill-switch latency grows** from ~60s (response cache) to ~60s + up to 60s of Blob
  propagation. Documented in [docs/billing.md](../billing.md); ADR-0004's "~1 min" is
  now "~2 min worst case".
- **The Stripe webhook is now a publisher.** A failed republish drops the stale
  entitlement document (forcing the correct-but-slower database fallback) and returns
  500 so Stripe retries. This is stricter than the creative writers, which degrade
  silently, and for a real reason: a stale *creative* snapshot serves an old
  configuration, a stale *entitlement* snapshot serves an unpaid ad.
- **`npm run db:seed` now requires `npm run snapshot:backfill` after it.** The seed
  rewrites `templates`, and creative snapshots copy `template_type`, `runtime_keys` and
  `supported_standards` from there. See [runtime/README.md](../../runtime/README.md).
- New failure mode to watch: snapshots and rows disagreeing. The backfill is idempotent
  and is the repair procedure.
- The fallback should be removed only once snapshot misses are observed to be zero.
  Until then every miss silently costs a database read, which is the old behaviour and
  therefore safe, but it also masks a broken publisher.

# 0017. Creative runtime assets on a public, content-addressed CDN

- Status: Accepted
- Date: 2026-08-16

## Context

[ADR-0015](0015-serving-snapshots-on-cdn.md) took Postgres and Supabase off the VAST
*generation* path. The asset fetch that follows was left behind, and it was not
actually being cached:

- The unit URL carried a 120s HMAC token in its path. The URL therefore changed every
  time a new VAST document was generated — about once a minute per creative. Every new
  token is a new CDN cache key, so nearly every asset fetch was a cache miss: a function
  invocation, plus a download from Supabase Storage, on the ad path.
- The bytes still lived in Supabase, so an asleep or throttled Supabase still darkened
  campaigns — the very failure ADR-0015 set out to remove.

The 120s window was inherited from [ADR-0003](0003-access-control-over-code-hiding.md)'s
"short-TTL signed URLs" layer. It is worth being precise about what it was protecting:
the unit is our own template code, identical for every advertiser using that template.
The advertiser's configuration — video, click-through, product data — is injected at
serve time through the VAST `<AdParameters>` element and is *not* in the file.

## Decision

Publish the built runtime to a **public Vercel Blob store under content-addressed
keys** (`runtime/<template>/<file>.<sha256[0..8]>.js`), cached for a year, and put the
resulting URL directly in `<MediaFile>`.

- `npm run runtime:push` hashes each built file, uploads it, and writes
  `runtime/manifest.ts` (logical key → public URL). The manifest is **committed** and
  imported at build time, so resolving a unit URL costs no network call and no lookup.
- `templates.runtime_keys` and the database schema are unchanged: they still hold the
  logical key, and the manifest is the only thing that knows about hashes.
- A **separate store from the private one holding serving snapshots.** Blob allows 100
  stores even on Hobby and its own documentation recommends splitting public from
  private content.
- **SIMID keeps its proxy route.** Public Blob sets `content-disposition: attachment` on
  HTML — its docs state this "prevents hosting HTML pages" — which stops a player's
  iframe from running the document. That is the same class of obstacle Supabase Storage
  presented (`text/plain` + `Content-Security-Policy: sandbox`), so the workaround
  survives the move. Its bytes come from the public store now; only the headers are ours.
- **Fallback:** a logical key with no manifest entry still resolves to the old proxy
  route, which still reads Supabase. That is what lets this ship before the public store
  exists, and it is how a checkout that has never run `runtime:push` behaves.

## Consequences

- The unit is served straight from Vercel's CDN with a year-long cache: no function
  invocation, no Supabase, and a cache key that is stable instead of rotating every
  minute.
- **The 120s window on the VPAID unit is gone.** Anyone holding the URL can fetch that
  file indefinitely. This costs nothing real, and saying why matters more than saying
  it is fine: the kill-switch operates on the VAST document, not the asset. When a
  subscription lapses the endpoint returns empty VAST, so no `<AdParameters>` are
  emitted, and the retained URL yields an anonymous template with no advertiser data in
  it. ADR-0003 already refuses to claim the code is unrecoverable.
- **New exposure: hotlinking.** A stable public URL can be embedded by a third party at
  our expense. This is the same risk [ADR-0010](0010-advertiser-media-uploads.md)
  accepted for the public `creative-media` bucket, and the mitigation is the same class
  of tool — Vercel WAF can be attached to a Blob store from its settings if abuse is
  ever observed. Not enabled speculatively.
- **A new way to ship a broken deploy:** pushing the runtime without committing the
  manifest. The deployed app then still points at the previous URLs — which keep
  working, because old hashes are never deleted — so the failure is silent and looks
  like "my template change did nothing". `runtime/README.md` now makes the commit an
  explicit numbered step, and `runtime:push` prints the reminder.
- Superseded hashed objects accumulate. They are small and immutable, and pruning them
  would risk breaking a VAST document still cached at an edge.
- `resolveInteractiveUrl` no longer signs anything for VPAID, so the signing seam is
  now SIMID-only. `SIMID`'s token, and the per-kind path allow-list that stops one
  format's token being replayed against the other's route, are unchanged.

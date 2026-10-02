# 0028. Creative media on Cloudflare R2, served from the ad domain

- Status: Accepted
- Date: 2026-10-02
- Amends: the storage location of [ADR-0010](0010-advertiser-media-uploads.md). Its upload
  model — straight from the browser, never through our server — the MIME allow-list and
  the 25 MB cap stand.

## Context

[ADR-0010](0010-advertiser-media-uploads.md) put advertiser media in a public Supabase
Storage bucket. That solved hotlinking, and it put the heaviest bytes on the ad path in
the one place that can least afford them.

- **Bytes per impression.** The first creative a buyer put traffic on carries two videos,
  3.4 MB and 3.9 MB, and both are fetched in full on every impression — they loop.
  Supabase's Free plan includes 5 GB of uncached and 5 GB of cached egress a month: on the
  order of a thousand impressions. Past the quota Supabase restricts the *whole project*
  (requests answer `402`), which takes click recording, postbacks and the dashboard down
  with the media.
- **Price at volume.** Any plan bills egress per GB, and per-GB delivery is dearest in
  Asia, Latin America and Africa — exactly where cheap worldwide traffic comes from. At the
  volumes buyers intend, delivery would cost a real share of the media it delivers.
- **A third hostname in every tag.** [ADR-0018](0018-dedicated-ad-serving-domain.md) put
  every ad URL on `smithcdn.net` so that ad ops whitelist one domain. The media still came
  from `<ref>.supabase.co`.

## Decision

**New uploads go to a Cloudflare R2 bucket, `creative-media`, served by Cloudflare's CDN at
`media.smithcdn.net`.** R2 has no egress charge at any volume, and Cloudflare's terms
explicitly allow video served from R2 through its CDN.

- **The same object keys.** `{userId}/{uuid}.{ext}`, exactly as ADR-0010 mints them. Moving
  an existing object is a copy under the same key, and a URL is `NEXT_PUBLIC_MEDIA_URL`
  followed by the key.
- **Upload: browser to R2, by a presigned PUT.** A server action checks the session, the
  MIME allow-list (unchanged — SVG stays out) and the declared size (25 MB at most), mints
  the key under the caller's own prefix, and returns a URL valid for five minutes that
  signs `content-type` and `content-length`. R2 refuses a body of any other length or type
  with `403 SignatureDoesNotMatch` — verified against the bucket, not assumed. The bytes
  never pass through a Vercel function, so the body limit ADR-0010 avoided stays avoided.
- **Delete: on the server, from both stores.** Objects are only ever deleted by
  `deleteCreative`, after the row is gone. Each of the creative's own keys is removed from
  R2 with the server's key *and* from the Storage bucket with the user's session: a
  migrated file keeps its Supabase original under the same key, and that original is as
  public as the copy. A key another of the user's creatives still references is kept —
  a buyer can paste one of their uploads into a second creative, and deleting it would
  break that tag — and if the other creatives cannot be read, nothing is deleted.
- **The guards live where the key is used.** R2 has no RLS, so what the Storage bucket's
  policies enforced is enforced in `lib/r2.ts` itself, not only by its callers:
  `deleteObjects` refuses any key outside the owner's prefix without sending a request,
  and `presignUpload` signs only a type we allow, matching the key's extension, within
  the size cap. Only a `2xx` counts as deleted — R2 answers `204` for a key already gone,
  so a `404` there would mean a wrong bucket, not a finished job. Requests retry twice,
  not aws4fetch's default ten, and a delete gives up after five seconds: it runs while
  the user waits on a redirect.
- **A least-privilege credential.** The token behind `R2_ACCESS_KEY_ID` /
  `R2_SECRET_ACCESS_KEY` holds object read and write on this one bucket and nothing else:
  not the account, not other buckets, not bucket settings. Only the secret is secret: the
  access key id rides in every presigned URL (`X-Amz-Credential`).
- **Caching for a day.** A cache rule on `media.smithcdn.net` keeps an object for a day at
  the edge and in the browser, with Smart Tiered Cache in front of the bucket. Keys are
  never reused, so a longer TTL would be safe for correctness — but not for deletion: a
  deleted creative's files must stop being served, and nothing purges the cache. A day
  bounds that, and R2 is still read about once a day per file per upper-tier data
  center. The zone's security level and Browser Integrity Check are relaxed so that a
  viewer behind a poor-reputation IP — common on mobile carrier NAT — gets the video, not
  a challenge page. The apex records stay DNS-only to Vercel, so those relaxations reach
  only the media host.
- **CORS.** `GET`/`HEAD` from any origin, for players on publishers' pages; `PUT` only from
  the app's own origins. CORS does not protect the upload — the signature does — it only
  lets the dashboard read the response.
- **The environment is the switch.** Without the `R2_*` variables and
  `NEXT_PUBLIC_MEDIA_URL`, uploads go to Supabase exactly as before. That is what lets the
  code ship before the infrastructure, and what a checkout without the keys does. But
  `NEXT_PUBLIC_MEDIA_URL` is also what makes an R2 URL recognizably ours, so **rolling
  back means unsetting the R2 credentials, not the media host**: with the host gone, the
  configurator would show saved R2 URLs raw and `deleteCreative` would no longer see them.
  It is inlined at build time, so it must be set before the build that should use it.
- **Only keys of the exact shape we mint are ours.** `parseOwnMediaUrl()` accepts a URL
  under either store's prefix only when the rest is exactly `{uuid}/{uuid}.{ext}`
  (`MEDIA_KEY_RE`), and `lib/r2.ts` refuses to sign or delete anything else. In R2 the
  prefix check is the whole delete guard, and a prefix check alone can be walked
  around: `{me}/../{you}/{file}` starts with my prefix, and the URL parser collapses the
  `..` into yours before the request is signed. For the same reason
  `isAllowedMediaMime()` now uses `Object.hasOwn` — `in` also accepted `"toString"` and
  the rest of Object's prototype, harmless while the Storage bucket's own MIME list was
  the gate, not once a browser-supplied type is signed into an upload.
- **A replaced file is not deleted.** ADR-0010 says a same-field replace deletes the old
  object. The code that would have done it could never run — Replace empties the field
  before the new file is chosen — and was wrong where it stood: it deleted the old
  object as soon as the new one landed, while the saved config, and so the live tag,
  still pointed at it. It is gone. A replaced file stays behind as an orphan until a
  save-time cleanup exists; at R2's storage price that is a cost of cents.
- **Existing media move by script.** `npm run media:migrate` (a dry run unless given
  `--apply`) copies every own Supabase object a creative references to R2 under the same
  key — downloading only what R2 does not already hold — fetches it back through
  `media.smithcdn.net` to prove the URL answers with the same size, and only then
  rewrites that creative's `config_json` — guarded by its `updated_at`, so a creative
  edited mid-run is skipped and reported — and republishes its snapshot, which is what
  moves the live tag. If that last step fails, the config already points at R2 and a
  re-run would find nothing to move, so the script clears the stale snapshot (the tag
  serves the new config from Postgres, as `publishOrClear()` arranges for the app) and
  names the repair, `npm run snapshot:backfill <id>`. The Supabase objects stay where they
  are as the rollback until the move is confirmed — and the script must be run once more
  right before they are removed, because an edit form opened before the move and saved
  after it writes the old URL back.

## Consequences

- Media bytes leave Supabase and Vercel. Supabase egress is back to API calls, and the
  limit that would have taken the whole project down at a thousand impressions is gone.
- `media.smithcdn.net` is one more hostname, but under the domain ad ops already
  whitelist — one fewer foreign host in the tag than before.
- **A leaked R2 key can overwrite or delete any advertiser's media**, though it reads
  nothing that is not already public and touches nothing else in the account. It is a
  server-only variable, like `SUPABASE_SERVICE_ROLE_KEY`, and the remedy is to roll it.
- Hotlinking stays the accepted risk ADR-0010 and ADR-0017 describe. Cloudflare can rate-
  limit the media host from its dashboard if abuse is ever observed; not enabled
  speculatively.
- **No per-user upload quota, and the bound changed shape.** Signing up is free and any
  signed-in user can mint 25 MB uploads without limit. On Supabase that ended in the
  project's storage quota — an outage for everyone. On R2 it ends in a bill: about
  $0.015 a month per GB stored and $4.50 per million uploads. A per-account cap on
  `requestMediaUpload` is the follow-up if signups are ever abused; a Cloudflare billing
  alert is the tripwire until then.
- A deleted creative's files can still be served from a cache for up to a day.
- On Cloudflare's Free plan some regions may be served from a farther data center than a
  paid plan would use. The `cf-ray` header names the data center that answered; a paid
  plan is a dashboard change if measurements say it matters.
- Until `npm run media:migrate` has run, configs hold both kinds of URL, and both work.
- `npm run test:media` pins the URL parsing (both stores, traversal, the exact key
  shape, prototype names, `ownMediaRefs` at any depth and never across owners), the
  presigned upload (a signature that changes with the declared size and type, a
  five-minute expiry, nothing signed for a key we did not mint or a type we do not
  allow) and the delete guard (a foreign key refused without a request), without
  touching the network.

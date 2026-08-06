# 0010. Advertiser media uploads via a public Storage bucket

- Status: Accepted
- Date: 2026-08-06

## Context

`"image"`-typed config fields (background, before/after, quiz option thumbnails,
scratch-reveal image) and Shoppable Video's `videoUrl` field asked advertisers to
paste an external URL. Testing with a real-world link
(`img11.joyreactor.cc/.../*.webm`) surfaced that many media hosts **block
hotlinking**: the host 301-redirects a cross-origin request to a URL that 404s, so
the player fetches nothing and the creative renders a black screen. This is not
fixable in our code — the source host is refusing the request — and it's not
specific to video; the same hosts typically block hotlinked images too.

Separately, a naive fix (proxy the upload through a Next.js API route) runs into
Vercel's serverless request-body size limit (~4.5MB), which a gif or short video
clip can easily exceed.

## Decision

Let advertisers **upload the file directly from the browser into a new, public-read
Supabase Storage bucket**, `creative-media` — as an alternative to pasting a URL,
not a replacement for it (some advertisers already have decent hosting).

- **Bucket**, declared in `supabase/schema.sql` (not manual dashboard setup, unlike
  the older `creatives` bucket): `public = true`, `file_size_limit = 25MB`,
  `allowed_mime_types` matching the image/video extensions
  `runtime/lib/vpaid-base.js`'s `adInteractIsVideoUrl()` already recognizes.
  Public-read because the resulting URL is baked into `<AdParameters>` and must
  keep resolving for the creative's lifetime — a short-TTL signed URL (the
  `creatives` bucket's model) is the wrong shape here, and this media carries none
  of that bucket's code-secrecy concern.
- **Upload path:** straight from the browser (`lib/supabase/client.ts`'s anon-key
  client, the user's own session) to Storage — never proxied through our server —
  specifically to avoid the Vercel body-size limit. RLS on `storage.objects` gates
  writes to `{auth.uid()}/...`, mirroring the existing `creatives_*_own` pattern.
- **No new field-type machinery.** `videoUrl`'s config-schema `type` was
  reclassified from `"url"` to `"image"` (`supabase/seed.sql` + the live DB) rather
  than inventing a `mediaAsset` flag or a new type: the runtime never branched on
  schema `type` for `videoUrl` (`_setupVideo()` reads `this._params.videoUrl` by
  literal field name) and `lib/template-demo.ts`'s `OVERRIDES` map already
  short-circuits the demo value before any type switch runs — so the reclassification
  is functionally inert everywhere except `ConfiguratorForm.tsx`'s field-type
  dispatch, exactly where the new upload widget needed to appear.
- Both upload and paste-URL resolve to the same plain string in the existing
  `values[field.name]` state, so `coerceFieldValue`, `config_json`,
  `lib/vast/builder.ts`'s `<AdParameters>` passthrough, and the runtime's media
  helpers need zero changes — they already treat these fields as opaque URLs.
  One real exception, surfaced by uploading a `.webm` to Shoppable Video's
  `videoUrl`: `lib/vast/shared.ts`'s `baseVideoMediaFile()` declared every video
  `<MediaFile type="...">` as `video/mp4` regardless of the actual file — no
  template exposes `videoMimeType` as a config field, so that hardcoded default
  was the only value ever used. A pasted `.mp4` link happened to match it; an
  uploaded `.webm` did not, leaving the VAST mis-declaring its own asset, which
  a strict player is entitled to reject. Fixed by sniffing the MIME type from
  the URL's extension (the same set `adInteractIsVideoUrl()` recognizes) before
  falling back to `video/mp4`. Note this was found by inspection, **not** by a
  reproduced player failure — the Google IMA error observed at the time
  (code 1005, `FAILED_TO_REQUEST_ADS`) turned out to be Chrome's Private Network
  Access blocking the SDK's public-origin bridge from reaching a `localhost`
  tag over plain http, a local-dev-only constraint unrelated to this or to the
  uploaded file; see the player-harness notes in `docs/architecture.md`.

## Consequences

- Advertisers get a hotlink-proof default without needing their own CDN — directly
  serving the stated goal of reliable delivery to lower-bandwidth regions, since a
  host we control behind Supabase's CDN is a strictly better guarantee than
  whatever server an advertiser happened to link to.
- `allowed_mime_types` checks the client-declared `Content-Type`, not real
  magic-byte content — a renamed file with a spoofed header is a theoretical
  bypass. Low blast radius (these URLs are only ever consumed as
  `background-image`/`<video src>`/`<img src>`, never executed), but worth
  revisiting if abuse is observed.
- **`/security-review` caught a real gap in the original allow-list: SVG.**
  It was initially included alongside the raster formats, on the reasoning that
  pasting an external SVG URL was already possible and therefore not new risk.
  That reasoning missed the actual shift: we're now the ones *hosting* the file.
  SVG is XML and can carry a `<script>`/`onload` payload that executes on direct
  navigation to the object's public URL — on our own Storage origin, not some
  external host's. Dropped from `allowed_mime_types` (`supabase/schema.sql`) and
  `lib/creative-media.ts`'s MIME map before this shipped.
- **Third-party hotlinking of our own bucket is an accepted, not eliminated, risk.**
  The object URL must stay genuinely public for ad players to fetch it — the same
  property that makes the whole feature work also means nothing stops someone
  from copying a URL and reusing it outside any actual creative (unrelated
  hotlinking of our storage/bandwidth). The configurator UI never displays the raw
  bucket URL after an upload (shows a generic "File uploaded" + filename instead,
  vs. showing pasted external URLs as-is) to avoid casually inviting reuse, but
  this is a UI nicety, not a control — the real URL is still visible via devtools,
  the saved VAST tag, and the API. No per-user quota or rate limiting exists yet;
  blast radius today is bounded by the 25MB/file cap and Supabase's own storage
  limits. Revisit (per-user quota, moving to longer-lived signed URLs, or a
  CDN/proxy layer) if abuse is actually observed — not speculatively now.
- No garbage collection beyond same-field replace (uploading a new file into a
  field that already held one of our own URLs best-effort deletes the old object).
  Abandoned mid-configuration uploads and delete-triggered cleanup are deferred —
  there is no `deleteCreative` action yet, and free-tier storage headroom makes a
  slow trickle of orphaned small files a non-issue at this stage. Revisit if usage
  data says otherwise.
- Two Storage buckets now exist with deliberately different trust models
  (`creatives`: private/signed/code; `creative-media`: public/RLS-gated-write/
  advertiser assets) — see `docs/data-model.md`'s "Storage buckets" section. Keep
  that distinction; don't merge them for convenience.

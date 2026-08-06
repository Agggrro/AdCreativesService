/**
 * Advertiser-uploaded creative media (ADR-0010) — the public `creative-media`
 * Storage bucket, distinct from the private `creatives` bucket in
 * `lib/storage.ts` (runtime VPAID/SIMID units, signed URLs). Client-safe: the
 * upload itself happens straight from the browser, so nothing here is
 * `server-only`.
 */

export const CREATIVE_MEDIA_BUCKET = "creative-media";

/** Matches the bucket's `file_size_limit` in supabase/schema.sql. */
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/** Matches the bucket's `allowed_mime_types` in supabase/schema.sql, and the
 * extensions runtime/lib/vpaid-base.js's `adInteractIsVideoUrl()` recognizes. */
// SVG deliberately excluded: it's XML and can carry a <script>/onload
// payload that executes on direct navigation to the object's public URL —
// unlike the other formats here, none of which can execute script.
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
};

export function isAllowedMediaMime(mime: string): boolean {
  return mime in MIME_EXTENSIONS;
}

/** `accept` attribute value for the upload `<input type="file">`. */
export const MEDIA_ACCEPT = Object.keys(MIME_EXTENSIONS).join(",");

/** Build the object path a fresh upload should use: `{userId}/{uuid}.{ext}`. Null for an unrecognized MIME type. */
export function buildMediaObjectPath(userId: string, mime: string): string | null {
  const ext = MIME_EXTENSIONS[mime];
  if (!ext) return null;
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}

function publicUrlPrefix(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${CREATIVE_MEDIA_BUCKET}/`;
}

/** True for one of our own creative-media public URLs, false for an externally pasted one. */
export function isOwnMediaUrl(url: string): boolean {
  return url.startsWith(publicUrlPrefix());
}

/** The bucket-relative object path for one of our own public URLs, or null if it isn't one. */
export function mediaObjectPath(url: string): string | null {
  const prefix = publicUrlPrefix();
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

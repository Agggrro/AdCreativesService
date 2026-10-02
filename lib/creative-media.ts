import { UUID_PATTERN } from "@/lib/uuid";

/**
 * Advertiser-uploaded creative media (ADR-0010; stored on R2 since ADR-0028).
 *
 * Two stores hold it. New uploads go to the Cloudflare R2 bucket served at
 * `NEXT_PUBLIC_MEDIA_URL` (media.smithcdn.net). Everything uploaded before
 * that — and everything uploaded on a deployment without the R2 variables —
 * sits in the public `creative-media` Supabase Storage bucket, distinct from
 * the private `creatives` bucket in `lib/storage.ts` (runtime units, signed
 * URLs). An object in either store was minted by `buildMediaObjectPath()`
 * under its uploader's own `{userId}/` prefix, and both count as ours.
 *
 * Client-safe: the upload itself happens straight from the browser, so nothing
 * here is `server-only`. The R2 credential is not here — `lib/r2.ts` holds it.
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

/**
 * Own keys only. `in` would also accept `"toString"` and every other name on
 * Object's prototype — harmless while the Storage bucket's own MIME list was
 * the real gate, not once a type from the browser is signed into an R2 upload.
 */
export function isAllowedMediaMime(mime: string): boolean {
  return Object.hasOwn(MIME_EXTENSIONS, mime);
}

/** The extension our keys carry for an allowed type; null for any other. */
export function mediaExtension(mime: string): string | null {
  return isAllowedMediaMime(mime) ? MIME_EXTENSIONS[mime] : null;
}

/** `accept` attribute value for the upload `<input type="file">`. */
export const MEDIA_ACCEPT = Object.keys(MIME_EXTENSIONS).join(",");

/**
 * The exact shape of a key `buildMediaObjectPath()` mints: the uploader's user
 * id, a random uuid, one of our extensions. Anything else is not one of our
 * objects and must never reach a delete. A prefix check alone is not enough:
 * `{me}/../{you}/{file}` starts with my prefix, and the URL parser collapses
 * the `..` into your prefix before the request is ever signed.
 */
export const MEDIA_KEY_RE = new RegExp(
  `^${UUID_PATTERN}/${UUID_PATTERN}\\.(?:${[...new Set(Object.values(MIME_EXTENSIONS))].join("|")})$`,
);

/** Build the object path a fresh upload should use: `{userId}/{uuid}.{ext}`. Null for an unrecognized MIME type. */
export function buildMediaObjectPath(userId: string, mime: string): string | null {
  const ext = mediaExtension(mime);
  return ext ? `${userId}/${crypto.randomUUID()}.${ext}` : null;
}

export type MediaStore = "r2" | "supabase";

/**
 * The media host — `NEXT_PUBLIC_MEDIA_URL`, trimmed, no trailing slash — or
 * null on a deployment without one. The one reading of that variable, shared
 * by URL parsing here and the R2 switch in `lib/r2.ts`.
 */
export function mediaHost(): string | null {
  const base = (process.env.NEXT_PUBLIC_MEDIA_URL ?? "").trim().replace(/\/+$/, "");
  return base || null;
}

function supabasePrefix(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${CREATIVE_MEDIA_BUCKET}/`;
}

/**
 * Which store one of our media URLs lives in, and its key — null for an
 * external URL, and for anything under our prefixes that is not a key we mint.
 */
export function parseOwnMediaUrl(url: string): { store: MediaStore; key: string } | null {
  const host = mediaHost();
  const candidates: [MediaStore, string | null][] = [
    ["r2", host ? `${host}/` : null],
    ["supabase", supabasePrefix()],
  ];
  for (const [store, prefix] of candidates) {
    if (prefix && url.startsWith(prefix)) {
      const key = url.slice(prefix.length);
      return MEDIA_KEY_RE.test(key) ? { store, key } : null;
    }
  }
  return null;
}

/** True for one of our own media URLs, in either store; false for an externally pasted one. */
export function isOwnMediaUrl(url: string): boolean {
  return parseOwnMediaUrl(url) !== null;
}

/** The public URL of an R2 object, or null on a deployment without a media host. */
export function r2MediaUrl(key: string): string | null {
  const host = mediaHost();
  return host ? `${host}/${key}` : null;
}

export interface MediaRef {
  url: string;
  store: MediaStore;
  key: string;
}

/**
 * Every one of `ownerId`'s media objects a creative's config references, once
 * per URL. `config_json` has no fixed shape (ADR-0011: templates author their
 * own schema, and the quiz nests per-path exits), so this recurses rather than
 * reading known field names.
 *
 * Only keys under the owner's own prefix are returned: a hand-edited config
 * pointing at someone else's public URL must never get their file deleted or
 * moved. For R2 there is no policy behind this — this and the exact key shape
 * `parseOwnMediaUrl` demands are the whole guard (`deleteObjects` re-checks).
 */
export function ownMediaRefs(config: unknown, ownerId: string): MediaRef[] {
  const refs = new Map<string, MediaRef>();
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      const own = parseOwnMediaUrl(value);
      if (own && own.key.startsWith(`${ownerId}/`)) refs.set(value, { url: value, ...own });
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };
  walk(config);
  return [...refs.values()];
}

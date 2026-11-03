/**
 * URL and MIME helpers the inspector's rules judge a tag with, kept free of the
 * XML tree so the VAST generator (lib/vast-gen, ADR-0035) can hold its own
 * trackers and media to exactly the same reading in the browser and the ad
 * Worker. `./rules/kit.ts` re-exports them, so every rule imports them as before.
 */
/** Every `[MACRO]` occurring in a string, by name. The one reading, for the rules and the generator alike. */
export function macrosIn(text: string): string[] {
  return [...text.matchAll(/\[([A-Z_]+)\]/g)].map((match) => match[1]);
}

export interface UrlVerdict {
  ok: boolean;
  url?: URL;
  /** Set when the string parses but is not http(s). */
  scheme?: string;
}

/**
 * VAST URIs must be absolute — a player has no base to resolve against, since
 * the document may have arrived through three redirects from another company.
 * Macros are stripped before parsing so `[CACHEBUSTING]` in a query string does
 * not make an otherwise valid URL look malformed.
 */
export function checkUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };
  const withoutMacros = trimmed.replace(/\[[A-Z_]+\]/g, "MACRO").replace(/%%[A-Z_]+%%/g, "MACRO");
  let url: URL;
  try {
    url = new URL(withoutMacros);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, url, scheme: url.protocol };
  }
  return { ok: true, url };
}

/** Extension → the MIME type a correctly-authored MediaFile would declare. */
const EXTENSION_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mov: "video/quicktime",
  m3u8: "application/x-mpegurl",
  mpd: "application/dash+xml",
  js: "application/javascript",
  html: "text/html",
  "3gp": "video/3gpp",
  flv: "video/x-flv",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

/**
 * The MIME type implied by a URL's extension, or undefined when the URL carries
 * no usable extension (which is common and not itself a defect — plenty of
 * CDNs serve `/media/12345` with a correct Content-Type).
 */
export function mimeFromUrl(raw: string): string | undefined {
  const verdict = checkUrl(raw);
  if (!verdict.ok || !verdict.url) return undefined;
  const match = /\.([a-z0-9]{2,5})$/i.exec(verdict.url.pathname);
  if (!match) return undefined;
  return EXTENSION_MIME[match[1].toLowerCase()];
}

/**
 * Whether a MediaFile's declared type is playable video.
 *
 * `video/*` is not sufficient: on CTV the base rendition is normally an HLS or
 * DASH manifest, whose MIME types are `application/…`. Testing for the `video/`
 * prefix alone reports a conformant streaming creative as having no video.
 */
export function isPlayableVideoType(type: string | undefined): boolean {
  const value = (type ?? "").toLowerCase().split(";")[0].trim();
  if (value.startsWith("video/")) return true;
  return [
    "application/x-mpegurl",
    "application/vnd.apple.mpegurl",
    "application/dash+xml",
    "application/mp4",
  ].includes(value);
}

/** Two MIME types that mean the same thing to a player. */
export function mimeEquivalent(a: string, b: string): boolean {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .split(";")[0]
      .trim()
      .replace("application/x-mpegurl", "application/vnd.apple.mpegurl")
      .replace("video/mpeg4", "video/mp4")
      .replace("text/javascript", "application/javascript")
      .replace("application/x-javascript", "application/javascript");
  return norm(a) === norm(b);
}

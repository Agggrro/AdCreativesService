import type { VastBuildContext } from "./types";
import { cdata, escapeXml } from "./xml";

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
const DEFAULT_VIDEO_MIME = "video/mp4";

/** Matches the video extensions runtime/lib/vpaid-base.js's `adInteractIsVideoUrl()` recognizes. */
const VIDEO_EXTENSION_MIME: Record<string, string> = {
  webm: "video/webm",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  ogv: "video/ogg",
};

/**
 * The declared `<MediaFile type="...">` must match the actual file, or a
 * strict player (Google IMA validates this; our Sandbox/Fluid harnesses
 * don't) rejects the whole ad as having no compatible asset. No template
 * exposes `videoMimeType` as a config field today, so relying on it alone
 * silently mis-declares every non-mp4 upload (e.g. a webm) as `video/mp4`.
 * Sniff the URL's extension first; `videoMimeType` (if a template ever adds
 * it) or the mp4 default only apply when the extension is unrecognized.
 */
function detectVideoMime(url: string, override: string | undefined): string {
  if (override) return override;
  const match = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url);
  const ext = match?.[1]?.toLowerCase();
  // `hasOwn`, not a bare index: the extension comes from an advertiser-supplied
  // URL, and a plain object literal would resolve `.../clip.constructor` to an
  // inherited function — truthy, so it survives the fallback and then throws
  // inside escapeXml. Own keys only.
  return ext && Object.hasOwn(VIDEO_EXTENSION_MIME, ext)
    ? VIDEO_EXTENSION_MIME[ext]
    : DEFAULT_VIDEO_MIME;
}

/**
 * The base (non-interactive) video <MediaFile>. Both adapters include it: for
 * SIMID it is the played video; for VPAID it doubles as a static fallback for
 * players that can't run the VPAID unit.
 */
export function baseVideoMediaFile(ctx: VastBuildContext): string {
  const { config } = ctx;
  const width = config.width ?? DEFAULT_WIDTH;
  const height = config.height ?? DEFAULT_HEIGHT;
  const type = escapeXml(detectVideoMime(config.videoUrl ?? "", config.videoMimeType));
  return (
    `<MediaFile delivery="progressive" type="${type}" ` +
    `width="${width}" height="${height}">` +
    `${cdata(config.videoUrl ?? "")}</MediaFile>`
  );
}

export { DEFAULT_WIDTH, DEFAULT_HEIGHT };

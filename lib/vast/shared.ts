import type { VastBuildContext } from "./types";
import { cdata, escapeXml } from "./xml";

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
const DEFAULT_VIDEO_MIME = "video/mp4";

/**
 * The base (non-interactive) video <MediaFile>. Both adapters include it: for
 * SIMID it is the played video; for VPAID it doubles as a static fallback for
 * players that can't run the VPAID unit.
 */
export function baseVideoMediaFile(ctx: VastBuildContext): string {
  const { config } = ctx;
  const width = config.width ?? DEFAULT_WIDTH;
  const height = config.height ?? DEFAULT_HEIGHT;
  const type = escapeXml(config.videoMimeType ?? DEFAULT_VIDEO_MIME);
  return (
    `<MediaFile delivery="progressive" type="${type}" ` +
    `width="${width}" height="${height}">` +
    `${cdata(config.videoUrl ?? "")}</MediaFile>`
  );
}

export { DEFAULT_WIDTH, DEFAULT_HEIGHT };

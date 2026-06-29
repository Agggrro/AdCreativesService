import type { FormatAdapter, VastBuildContext } from "../types";
import { cdata } from "../xml";
import { baseVideoMediaFile, DEFAULT_WIDTH, DEFAULT_HEIGHT } from "../shared";

/**
 * VPAID 2.0 (legacy) — the interactive unit is a JS <MediaFile> with
 * apiFramework="VPAID". A base video MediaFile is included first as a static
 * fallback for players that don't run VPAID. Marked legacy in the UI (ADR-0002).
 */
export const vpaidAdapter: FormatAdapter = {
  format: "vpaid",
  mediaFilesInner(ctx: VastBuildContext): string {
    const width = ctx.config.width ?? DEFAULT_WIDTH;
    const height = ctx.config.height ?? DEFAULT_HEIGHT;
    return [
      baseVideoMediaFile(ctx),
      `<MediaFile delivery="progressive" type="application/javascript" ` +
        `apiFramework="VPAID" width="${width}" height="${height}">` +
        `${cdata(ctx.interactiveUrl)}</MediaFile>`,
    ].join("\n");
  },
};

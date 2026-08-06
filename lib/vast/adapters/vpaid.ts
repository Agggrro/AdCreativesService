import type { FormatAdapter, VastBuildContext } from "../types";
import { cdata } from "../xml";
import { baseVideoMediaFile, DEFAULT_WIDTH, DEFAULT_HEIGHT } from "../shared";

/**
 * VPAID 2.0 (legacy) — the interactive unit is a JS <MediaFile> with
 * apiFramework="VPAID", plus a base video MediaFile as a static fallback for
 * players that don't run VPAID. Marked legacy in the UI (ADR-0002).
 *
 * The VPAID entry is emitted FIRST, and that ordering is load-bearing even
 * though VAST itself doesn't mandate one: Fluid Player decides whether an ad is
 * VPAID by testing only `mediaFileList[0].apiFramework` (see
 * `fluid-player/src/modules/vast.js`). With the base video first it silently
 * treats a VPAID creative as a plain linear video and never loads the unit —
 * which is what made Shoppable Video (the one template with a base video) fail
 * there while image-only templates, having no fallback entry, worked. Players
 * that select by capability rather than position are unaffected: a non-VPAID
 * player still can't play `application/javascript` and falls through to the
 * video below it.
 */
export const vpaidAdapter: FormatAdapter = {
  format: "vpaid",
  // The VPAID unit draws itself in the slot; no base video required.
  isServable(): boolean {
    return true;
  },
  mediaFilesInner(ctx: VastBuildContext): string {
    const width = ctx.config.width ?? DEFAULT_WIDTH;
    const height = ctx.config.height ?? DEFAULT_HEIGHT;
    const vpaidFile =
      `<MediaFile delivery="progressive" type="application/javascript" ` +
      `apiFramework="VPAID" width="${width}" height="${height}">` +
      `${cdata(ctx.interactiveUrl)}</MediaFile>`;
    // Include a static base video only when one is provided (fallback for
    // non-VPAID players). Image-only creatives omit it. VPAID stays first —
    // see the ordering note above.
    return ctx.config.videoUrl
      ? [vpaidFile, baseVideoMediaFile(ctx)].join("\n")
      : vpaidFile;
  },
};

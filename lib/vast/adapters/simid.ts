import type { FormatAdapter, VastBuildContext } from "../types";
import { cdata } from "../xml";
import { baseVideoMediaFile } from "../shared";
import { buildAdVerification } from "../verification";

/**
 * SIMID 1.1 — the interactive document is referenced via
 * <InteractiveCreativeFile apiFramework="SIMID"> alongside the base video.
 * The player renders the video and loads the SIMID doc in a sandboxed iframe.
 */
export const simidAdapter: FormatAdapter = {
  format: "simid",
  // SIMID layers over a playing linear video → requires a base video/loop.
  isServable(ctx: VastBuildContext): boolean {
    return !!ctx.config.videoUrl;
  },
  mediaFilesInner(ctx: VastBuildContext): string {
    return [
      baseVideoMediaFile(ctx),
      `<InteractiveCreativeFile apiFramework="SIMID" type="text/html">` +
        `${cdata(ctx.interactiveUrl)}</InteractiveCreativeFile>`,
    ].join("\n");
  },
  // OMID pass-through (ADR-0012): emits the advertiser-supplied verification
  // vendor's <Verification> node, or "" when none is configured.
  adVerificationsInner(ctx: VastBuildContext): string {
    return buildAdVerification(ctx);
  },
};

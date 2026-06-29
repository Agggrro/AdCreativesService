import type { FormatAdapter, VastBuildContext } from "../types";
import { cdata } from "../xml";
import { baseVideoMediaFile } from "../shared";

/**
 * SIMID 1.1 — the interactive document is referenced via
 * <InteractiveCreativeFile apiFramework="SIMID"> alongside the base video.
 * The player renders the video and loads the SIMID doc in a sandboxed iframe.
 */
export const simidAdapter: FormatAdapter = {
  format: "simid",
  mediaFilesInner(ctx: VastBuildContext): string {
    return [
      baseVideoMediaFile(ctx),
      `<InteractiveCreativeFile apiFramework="SIMID" type="text/html">` +
        `${cdata(ctx.interactiveUrl)}</InteractiveCreativeFile>`,
    ].join("\n");
  },
};

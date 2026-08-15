import { resolveChain } from "./chain";
import { neutralizeDocument } from "./neutralize";
import type { InspectReport, PixelMode, Playback } from "./model";
import { buildReport } from "./report";

/**
 * Public surface of the VAST inspection engine.
 *
 * One call does everything: resolve the wrapper chain, run the rule catalogue
 * against every document in it, detect features and interactive standards,
 * and prepare what the player should be handed.
 */

export type {
  Finding,
  FeatureHit,
  Hop,
  InspectReport,
  InteractiveHit,
  Msg,
  PixelMode,
  Placement,
  Playback,
  Recommendation,
  Severity,
  TrackerHit,
  VastVersion,
  Verdict,
} from "./model";
export { SEVERITY_ORDER, VAST_VERSIONS, normalizeVersion } from "./model";
export { describeIabError, lookupIabError, IAB_ERRORS } from "./errors-iab";
export { renderReportText } from "./render-text";
export { ALL_RULES } from "./rules";
export { MAX_HOPS } from "./chain";
export { MAX_BYTES, TIMEOUT_MS } from "./fetch-tag";

/** Largest document we will accept pasted into the form. */
export const MAX_PASTED_BYTES = 256 * 1024;

export interface InspectOptions {
  mode: "url" | "xml";
  value: string;
  pixelMode: PixelMode;
  /** Absolute origin of this deployment, used to build dry-run URLs. */
  origin: string;
}

/**
 * Decide what the player receives.
 *
 * In live mode the player gets the user's original tag and every pixel fires
 * for real — that is the point of the mode, and the CORS behaviour of a real
 * cross-origin ad request is itself part of what is being tested.
 *
 * In dry-run the player gets the neutralized first document as a string. Two
 * consequences worth being explicit about: no cross-origin request is made for
 * the tag itself, so a CORS fault that would break the live run cannot show up
 * here; and every wrapper hop is redirected through our proxy, so the chain has
 * the right shape without any third party being contacted.
 */
function planPlayback(
  options: InspectOptions,
  firstDocument: string | undefined,
): Playback {
  if (options.pixelMode === "live") {
    return options.mode === "url"
      ? { mode: "live", adTagUrl: options.value.trim() }
      : { mode: "live", adsResponse: options.value };
  }
  if (!firstDocument) return { mode: "dryRun" };
  return {
    mode: "dryRun",
    adsResponse: neutralizeDocument(firstDocument, { origin: options.origin }),
  };
}

export async function inspect(options: InspectOptions): Promise<InspectReport> {
  const chain = await resolveChain({ mode: options.mode, value: options.value });
  const firstDocument = chain.documents.find((doc) => doc.hop === 0)?.source;

  return buildReport({
    mode: options.mode,
    url: options.mode === "url" ? options.value.trim() : "",
    chain,
    playback: planPlayback(options, firstDocument),
  });
}

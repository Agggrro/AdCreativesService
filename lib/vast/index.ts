// Public API of the VAST layer.
export type {
  CreativeConfig,
  VastBuildContext,
  FormatAdapter,
} from "./types";
export {
  generateVast,
  buildInlineVast,
  emptyVast,
  formatDuration,
  trackingUrl,
} from "./builder";
export { getAdapter, supportedFormats } from "./adapters";
export { parseCreativeConfig } from "./config";

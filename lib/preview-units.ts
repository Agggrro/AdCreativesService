/**
 * Built VPAID units that may be served to the in-browser demo harness, keyed by
 * the first path segment of a template's `runtime_keys.vpaid`.
 *
 * This is an allow-list on purpose. `/api/preview-unit/[template]` is public and
 * unauthenticated; resolving an arbitrary Storage path from a DB row instead
 * would trade that guarantee for tidiness on a path that needs no DB read.
 */
export const PREVIEW_UNIT_PATHS: Record<string, string> = {
  "scratch-reveal": "scratch-reveal/vpaid.js",
  slider: "slider/vpaid.js",
  quiz: "quiz/vpaid.js",
  "age-gate": "age-gate/vpaid.js",
  shoppable: "shoppable/vpaid/unit.js",
};

export function isPreviewUnitKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(PREVIEW_UNIT_PATHS, key);
}

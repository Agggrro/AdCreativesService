import { RUNTIME_MANIFEST } from "@/runtime/manifest";

/**
 * Where each runtime object actually lives on the CDN.
 *
 * Written by `npm run runtime:push` and committed (see runtime/README.md), so it
 * is a build-time constant here — resolving a unit URL costs no network call and
 * no lookup on the ad path.
 *
 * Keys are the logical paths stored in `templates.runtime_keys`
 * (`shoppable/vpaid/unit.js`, `quiz/vpaid.js`, …). Values point at
 * content-addressed objects, so a URL changes only when the bytes change and can
 * be cached for a year.
 */
export interface RuntimeAsset {
  /** Absolute, public, immutable URL. */
  url: string;
  /** Full sha256 of the bytes; the URL embeds its first 8 characters. */
  sha256: string;
}

/**
 * Returns null when the key has not been pushed yet. Callers must treat that as
 * "fall back", not "fail" — an empty manifest is the normal state of a checkout
 * that has never run `runtime:push`, and the serving path still has the proxy
 * route to fall back to.
 */
export function runtimeAsset(logicalKey: string): RuntimeAsset | null {
  return RUNTIME_MANIFEST.assets[logicalKey] ?? null;
}

/** True once anything has been pushed. Used by the health check and by scripts. */
export function hasRuntimeManifest(): boolean {
  return Object.keys(RUNTIME_MANIFEST.assets).length > 0;
}

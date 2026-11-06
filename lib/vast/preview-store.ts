import "server-only";
import { snapshotNamespace } from "@/lib/serving";
import { isUuid } from "@/lib/uuid";
import type { PreviewServingInput } from "./preview-context";

/**
 * Where a preview's config goes when it does not fit the token (ADR-0039).
 *
 * The preview token is stateless by design: the whole config rides inside it,
 * as a URL path segment, which caps it at about 5.6 KB (lib/vast/preview-token.ts,
 * ADR-0011). An HTML5 banner is up to 150 KB. ADR-0011 named the answer for
 * anything past the ceiling — a short opaque id backed by a row — and since
 * ADR-0029 the row can be a KV key: the config is written under the preview id
 * with a lifetime KV enforces itself, and the token carries the id alone.
 *
 * Same guarantees as the stateless token. The id is a random UUID that only the
 * signed token names; the config is the caller's own unsaved form state, which
 * the token already exposed in full to whoever held it; and it is gone of its
 * own accord a minute after the token expires, with no row to clean up.
 */

const KEY_PREFIX = "preview/";

/**
 * Past the token's lifetime (PREVIEW_TTL_SECONDS, 120), so a token presented in
 * its last second still finds its config; the token's expiry is the gate.
 */
export const PREVIEW_STORE_TTL_SECONDS = 180;

function keyFor(pid: string): string {
  return `${KEY_PREFIX}${pid}`;
}

/** Whether this process can keep a config outside the token at all. */
export function canStorePreview(): boolean {
  return snapshotNamespace() !== null;
}

/** Throws when the write failed: the mint then answers with an error, never a token that will find nothing. */
export async function storePreviewInput(input: PreviewServingInput): Promise<void> {
  const namespace = snapshotNamespace();
  if (!namespace) throw new Error("no store for a preview config");
  await namespace.put(keyFor(input.pid), JSON.stringify(input), {
    expirationTtl: PREVIEW_STORE_TTL_SECONDS,
  });
}

/**
 * The stored config, or null: expired, never stored, a malformed id, or a store
 * this process cannot reach — every one of which the preview route answers with
 * an empty VAST, exactly as it answers a bad token.
 */
export async function loadPreviewInput(pid: string): Promise<PreviewServingInput | null> {
  if (!isUuid(pid)) return null;
  const namespace = snapshotNamespace();
  if (!namespace) return null;
  let text: string | null;
  try {
    text = await namespace.get(keyFor(pid));
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<PreviewServingInput>;
    if (
      !parsed ||
      parsed.pid !== pid ||
      typeof parsed.tid !== "string" ||
      typeof parsed.fmt !== "string" ||
      !parsed.cfg ||
      typeof parsed.cfg !== "object" ||
      Array.isArray(parsed.cfg)
    ) {
      return null;
    }
    return parsed as PreviewServingInput;
  } catch {
    return null;
  }
}

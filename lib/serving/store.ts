import { isUuid } from "@/lib/uuid";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types";

/**
 * Storage port for serving snapshots (ADR-0015).
 *
 * The interface exists so the backing store can change without touching the
 * serving path: the ceiling that forces a move is a property of the store, not
 * of the product. Vercel's Global Config (formerly Edge Config) was the obvious
 * first choice and is the reason this seam is here — it caps at 1 MB on every
 * plan, which is a few hundred creatives, and *rejects the write* when full.
 * A creative that saves successfully but never reaches the CDN is a worse
 * failure than a slower read, so the shipped implementation is Vercel Blob.
 *
 * Contract, and it differs by direction on purpose:
 *
 *   - **Reads fail soft.** Any problem — missing object, unreadable body,
 *     unknown schema version — returns `null`, and the caller falls back to
 *     Postgres. A snapshot miss must degrade to today's behaviour, never to a
 *     dark ad.
 *   - **Writes fail hard.** `put*`/`delete*` throw, so the caller can refuse to
 *     report success. A writer that swallows a failed publish leaves the CDN
 *     serving stale entitlement, which is the one thing this design must not do.
 */
export interface SnapshotStore {
  putCreative(snapshot: CreativeSnapshot): Promise<void>;
  deleteCreative(creativeId: string): Promise<void>;
  getCreative(creativeId: string): Promise<CreativeSnapshot | null>;

  putEntitlement(snapshot: EntitlementSnapshot): Promise<void>;
  /**
   * Used as a fail-safe, not as part of normal operation: dropping the document
   * forces the serving path back to Postgres, which is slower but correct. The
   * Stripe webhook reaches for this when a republish fails, so a finite number
   * of retries cannot leave stale entitlement serving forever.
   */
  deleteEntitlement(userId: string): Promise<void>;
  getEntitlement(userId: string): Promise<EntitlementSnapshot | null>;
}

/**
 * How long a snapshot may sit in the CDN cache. 60s is Vercel Blob's floor for
 * `cacheControlMaxAge`, and it is also the window `GET /api/vast` already
 * caches its own response for — so this adds no new order of magnitude to how
 * long a subscription change takes to bite.
 *
 * Budget for the kill-switch is now cache(60s) + blob propagation(up to 60s):
 * worst case ~2 min rather than the ~1 min in docs/mvp-scope.md. That is a real
 * change and it is written down in docs/billing.md and ADR-0015 rather than
 * left for someone to discover.
 */
export const SNAPSHOT_CACHE_SECONDS = 60;

/**
 * Object keys are derived from ids that arrive on a public, unauthenticated
 * endpoint, so they are shape-checked here as well as at the route. `isUuid`
 * makes a traversal segment or a wildcard unrepresentable rather than merely
 * unlikely — the same "validate before the round trip" rule docs/security.md
 * applies to database reads.
 */
export function creativeKey(creativeId: string): string {
  if (!isUuid(creativeId)) {
    throw new Error("Refusing to build a snapshot key from a non-uuid creative id");
  }
  return `serving/creative/${creativeId}.json`;
}

export function entitlementKey(userId: string): string {
  if (!isUuid(userId)) {
    throw new Error("Refusing to build a snapshot key from a non-uuid user id");
  }
  return `serving/entitlement/${userId}.json`;
}

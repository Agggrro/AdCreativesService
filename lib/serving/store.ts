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
 * Since ADR-0029 the store is Workers KV (`store-kv.ts`). Blob was written
 * alongside it for the move off Vercel and went with Vercel.
 *
 * Contract, and it differs by direction on purpose:
 *
 *   - **Reads tell a miss from a failure.** `null` means there is no such
 *     document. A read that could not be answered — the store did not respond,
 *     or the document is unusable (unparseable, or a schema version this build
 *     does not know) — throws {@link SnapshotReadError}. For a creative both end
 *     in the Postgres fallback. For entitlement they must not: no document is a
 *     user who never subscribed, while a failed read is "we do not know". Before
 *     ADR-0029 both came back as `null`, so one failed read served an empty ad
 *     that the CDN then kept for a minute.
 *   - **Writes fail hard, and fail closed.** `put*`/`delete*` throw, so the
 *     caller can refuse to report success. A writer that swallows a failed
 *     publish leaves a store serving stale entitlement, which is the one thing
 *     this design must not do — so a `put*` that fails also clears that store's
 *     document before it throws (`putOrClear` in store-kv.ts): a creative then
 *     falls back to Postgres, an entitlement serves nothing. Callers neither need
 *     nor should clear other stores themselves; a store whose put succeeded
 *     holds the one document that is right.
 */
export interface SnapshotStore {
  putCreative(snapshot: CreativeSnapshot): Promise<void>;
  deleteCreative(creativeId: string): Promise<void>;
  getCreative(creativeId: string): Promise<CreativeSnapshot | null>;

  putEntitlement(snapshot: EntitlementSnapshot): Promise<void>;
  /**
   * Used as a fail-safe, not as part of normal operation. Dropping the document
   * **fails closed**: with no entitlement document the serving path treats the
   * user as unsubscribed, so their tags serve empty until the next successful
   * publish — it does not read Postgres for them. A failed put clears its own
   * store this way (`putOrClear`), and a publish that cannot even read the rows
   * clears every store (lib/serving/publish.ts), so a finite number of retries
   * cannot leave stale entitlement serving forever; the price is that a *new*
   * subscription whose publish failed stays dark until a retry or the reconciler
   * lands it.
   */
  deleteEntitlement(userId: string): Promise<void>;
  getEntitlement(userId: string): Promise<EntitlementSnapshot | null>;
}

/**
 * A snapshot read that could not be answered — as opposed to a document that
 * does not exist, which is `null`. See the contract above.
 */
export class SnapshotReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SnapshotReadError";
  }
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
 *
 * On Workers KV (ADR-0029) the same number is the binding's `cacheTtl`: how long
 * a data centre may answer a read — a miss included — from its own cache before
 * it asks again. The budget does not move.
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

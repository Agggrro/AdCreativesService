import { isUuid } from "@/lib/uuid";
import {
  creativeKey,
  entitlementKey,
  SnapshotReadError,
  type SnapshotStore,
} from "./store";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types";
import type { SnapshotNamespace } from "./kv";

/**
 * Workers KV implementation of the snapshot store (ADR-0029).
 *
 * **The namespace is private by construction.** KV has no public URL at all: a
 * document is only readable through a binding or an API token, so the reason
 * ADR-0015 insisted on a *private* Blob store — keys are derived from the
 * creative id printed in every tag, and a document carries `user_id` and the
 * full config — is met without a setting anyone could flip.
 *
 * The namespace is resolved per call, not captured: inside a Worker the binding
 * is registered once the isolate has its `env`, which can be after this module
 * was evaluated.
 */
export function kvSnapshotStore(namespace: () => SnapshotNamespace): SnapshotStore {
  async function read<T extends { schema_version: number }>(
    key: string,
  ): Promise<T | null> {
    let text: string | null;
    try {
      text = await namespace().get(key);
    } catch (err) {
      throw new SnapshotReadError(`snapshot read failed: ${key}`, { cause: err });
    }
    if (text === null) return null;

    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch (err) {
      throw new SnapshotReadError(`snapshot is not JSON: ${key}`, { cause: err });
    }
    // An unknown version is "we cannot read this", not "there is nothing here":
    // the caller goes to Postgres, which can always answer. Without this, the
    // first incompatible shape change would be an outage instead of a migration.
    if (parsed?.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
      throw new SnapshotReadError(`snapshot has an unknown schema version: ${key}`);
    }
    return parsed;
  }

  async function write(key: string, snapshot: unknown): Promise<void> {
    // Writes fail hard, and fail closed (store.ts): a put that did not land
    // clears this store's document before the error goes up.
    await putOrClear(
      () => namespace().put(key, JSON.stringify(snapshot)),
      () => namespace().delete(key),
      key,
    );
  }

  return {
    // Async, so a refused key arrives as a rejection like every other write
    // failure rather than as a throw before the caller holds a promise.
    async putCreative(snapshot: CreativeSnapshot) {
      await write(creativeKey(snapshot.creative_id), snapshot);
    },

    async deleteCreative(creativeId: string) {
      await namespace().delete(creativeKey(creativeId));
    },

    async getCreative(creativeId: string) {
      // An id that is not a uuid cannot name a document: a miss, not a failure.
      // The routes validate first; this keeps the store safe on its own.
      if (!isUuid(creativeId)) return null;
      return read<CreativeSnapshot>(creativeKey(creativeId));
    },

    async putEntitlement(snapshot: EntitlementSnapshot) {
      await write(entitlementKey(snapshot.user_id), snapshot);
    },

    async deleteEntitlement(userId: string) {
      await namespace().delete(entitlementKey(userId));
    },

    async getEntitlement(userId: string) {
      if (!isUuid(userId)) return null;
      return read<EntitlementSnapshot>(entitlementKey(userId));
    },
  };
}

/**
 * A put that failed leaves whatever the store held before — for an entitlement,
 * possibly the subscription before its cancellation. So the store clears its
 * own document before reporting the failure: a creative then falls back to
 * Postgres, which is right; an entitlement then serves nothing, which is safe.
 * The clear is this store's alone. Clearing a store whose put succeeded would
 * only throw away the one document that was correct.
 *
 * If the clear fails too — the same outage, or the same one-write-per-second
 * limit — the previous document stays, and only a later publish repairs it: a
 * retried webhook, or the reconciler (`/api/cron/reconcile`). It is logged
 * under a stable prefix so that case is never silent.
 */
export async function putOrClear(
  put: () => Promise<void>,
  clear: () => Promise<void>,
  key: string,
): Promise<void> {
  try {
    await put();
  } catch (err) {
    try {
      await clear();
      // Said out loud: a clear fails closed, and for an entitlement that means a
      // subscriber's tags are dark until the next publish lands.
      console.warn("[snapshot-cleared] a publish failed; this store's copy was removed", {
        key,
        err: String(err),
      });
    } catch (clearErr) {
      console.error("[snapshot-stale] a failed publish could not be cleared", {
        key,
        err: String(clearErr),
      });
    }
    throw err;
  }
}

/**
 * Reads from `primary`, writes to both — the shape of the move between stores
 * (ADR-0029 §3). A write counts only when both stores took it: reporting success
 * with one of them stale would let the two serving paths disagree about whether
 * a tag may serve. Each store fails closed on its own (`putOrClear`), so a
 * partial failure clears only the store that missed the write.
 */
export function dualWriteStore(primary: SnapshotStore, secondary: SnapshotStore): SnapshotStore {
  async function both(a: Promise<void>, b: Promise<void>): Promise<void> {
    // Settled rather than raced: the second write is not abandoned mid-flight
    // because the first one failed.
    const results = await Promise.allSettled([a, b]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
  }

  return {
    putCreative: (s) => both(primary.putCreative(s), secondary.putCreative(s)),
    deleteCreative: (id) => both(primary.deleteCreative(id), secondary.deleteCreative(id)),
    getCreative: (id) => primary.getCreative(id),
    putEntitlement: (s) => both(primary.putEntitlement(s), secondary.putEntitlement(s)),
    deleteEntitlement: (id) =>
      both(primary.deleteEntitlement(id), secondary.deleteEntitlement(id)),
    getEntitlement: (id) => primary.getEntitlement(id),
  };
}

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
    // No try/catch: writes fail hard, by contract.
    await namespace().put(key, JSON.stringify(snapshot));
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
 * Reads from `primary`, writes to both — the shape of the move between stores
 * (ADR-0029 §3). A write counts only when both stores took it: reporting success
 * with one of them stale would let the two serving paths disagree about whether
 * a tag may serve.
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

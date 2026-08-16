// Public API of the serving-snapshot layer (ADR-0015).
//
// Call sites import `snapshots` from here and never name a storage vendor.
// Swapping the backing store is meant to be an edit to this file plus one new
// implementation module — see lib/serving/store.ts for why that seam exists.
import { blobSnapshotStore } from "./store-blob";
import type { SnapshotStore } from "./store";

export const snapshots: SnapshotStore = blobSnapshotStore;

export type { SnapshotStore } from "./store";
export { SNAPSHOT_CACHE_SECONDS, creativeKey, entitlementKey } from "./store";
export { isEntitled, shouldServe } from "./entitlement";
export { snapshotToServing } from "./row";
export { SNAPSHOT_SCHEMA_VERSION } from "./types";
export type {
  CreativeSnapshot,
  EntitlementSnapshot,
  EntitlementRecord,
} from "./types";

// Public API of the serving-snapshot layer (ADR-0015, ADR-0029).
//
// Call sites import `snapshots` from here and never name a storage vendor.
// Swapping the backing store is meant to be an edit to this file plus one new
// implementation module — see lib/serving/store.ts for why that seam exists.
//
// The ad Worker (workers/ads) does not come through here: it builds its store
// from its own KV binding and hands it to the handlers in lib/serving/http,
// which keeps the Blob SDK out of its bundle.
import { blobSnapshotStore } from "./store-blob";
import { dualWriteStore, kvSnapshotStore } from "./store-kv";
import { restNamespaceFromEnv, type SnapshotNamespace } from "./kv";
import { SnapshotReadError, type SnapshotStore } from "./store";

/**
 * A KV binding registered by a Worker entry. Kept on a global symbol rather than
 * in a module variable: a Worker can hold more than one copy of this module (the
 * Next server bundle and the entry that wraps it are compiled separately), and
 * all of them must see the registration.
 */
const NAMESPACE_SLOT = Symbol.for("creosmith.serving.snapshot-namespace");

type Slots = Record<symbol, SnapshotNamespace | undefined>;

/** Called by a Worker entry, with its KV binding, before it serves. */
export function registerSnapshotNamespace(namespace: SnapshotNamespace): void {
  (globalThis as unknown as Slots)[NAMESPACE_SLOT] = namespace;
}

function blobConfigured(): boolean {
  // On Vercel a connected store injects BLOB_STORE_ID (and authenticates by
  // OIDC); everywhere else the SDK needs the static token.
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** `undefined` until first asked; `null` once the environment has said "no KV". */
let restStore: SnapshotStore | null | undefined;

/** Throws on a partial or malformed configuration — see restNamespaceFromEnv. */
function kvOverRest(): SnapshotStore | null {
  if (restStore === undefined) {
    const namespace = restNamespaceFromEnv();
    restStore = namespace ? kvSnapshotStore(() => namespace) : null;
  }
  return restStore;
}

/**
 * A process that cannot reach KV. Since ADR-0029 the ad domain serves from KV,
 * so such a process must not pretend to publish: a write that lands in Blob
 * alone is a change the ad Worker never sees — a cancellation that keeps
 * serving. Writes refuse, loudly; reads come from Blob if there is one, and are
 * otherwise "could not read" (the Postgres fallback).
 */
function withoutKv(readBlob: boolean): SnapshotStore {
  const refuse = async (): Promise<never> => {
    throw new Error(
      "Snapshot KV is not configured (no binding, no SNAPSHOT_KV_* variables): " +
        "refusing a write the ad domain would never see (ADR-0029).",
    );
  };
  const unreadable = async (): Promise<never> => {
    throw new SnapshotReadError("no snapshot store is configured");
  };
  return {
    putCreative: refuse,
    deleteCreative: refuse,
    putEntitlement: refuse,
    deleteEntitlement: refuse,
    getCreative: readBlob ? (id) => blobSnapshotStore.getCreative(id) : unreadable,
    getEntitlement: readBlob ? (id) => blobSnapshotStore.getEntitlement(id) : unreadable,
  };
}

/**
 * Which store this process talks to, decided per call (the environment and the
 * registration can both arrive after this module loads):
 *
 *   1. A registered binding — inside a Worker. KV only.
 *   2. KV over REST *and* Blob configured — the Vercel deployment and the
 *      scripts during the move: write both, read Blob. Not KV: over REST it is
 *      the Cloudflare API, whose rate limit (1,200 requests per 5 minutes) is
 *      shared by everything the account does — a serving path reading it would
 *      starve deploys the moment traffic arrived. The audit, which must see
 *      the store the ad Worker actually serves from, asks for every store by
 *      name instead (`auditableSnapshotStores`, ADR-0029 §3).
 *   3. KV over REST only — scripts once Blob is gone.
 *   4. No KV at all — writes refuse (`withoutKv`). The pre-ADR-0029 "Blob
 *      only" configuration is no longer a valid one to publish from.
 */
function currentStore(): SnapshotStore {
  const bound = (globalThis as unknown as Slots)[NAMESPACE_SLOT];
  if (bound) return kvSnapshotStore(() => bound);

  const rest = kvOverRest();
  const blob = blobConfigured();
  if (rest) return blob ? dualWriteStore(blobSnapshotStore, rest) : rest;
  return withoutKv(blob);
}

/**
 * Every store this process should keep current, by name, for the audit
 * (lib/serving/health.ts). KV is always on the list: when this process cannot
 * reach it, the entry still appears and every probe of it fails, so a
 * deployment missing its KV configuration reports as drift instead of passing a
 * check of the one store it can see. During the move Blob is listed too: the ad
 * Worker serves from KV while everything on Vercel reads Blob, and a document
 * current in one and stale in the other is exactly the drift that would
 * otherwise go unseen.
 */
export function auditableSnapshotStores(): { name: string; store: SnapshotStore }[] {
  const bound = (globalThis as unknown as Slots)[NAMESPACE_SLOT];
  if (bound) return [{ name: "kv", store: kvSnapshotStore(() => bound) }];

  const stores = [{ name: "kv", store: kvOverRest() ?? withoutKv(false) }];
  if (blobConfigured()) stores.push({ name: "blob", store: blobSnapshotStore });
  return stores;
}

// Async on purpose: resolving the store can throw (a malformed KV
// configuration), and that must reach callers as a rejected promise — the
// serving path's `.catch` turns a failed read into the Postgres fallback, and a
// synchronous throw would skip it.
export const snapshots: SnapshotStore = {
  putCreative: async (snapshot) => currentStore().putCreative(snapshot),
  deleteCreative: async (creativeId) => currentStore().deleteCreative(creativeId),
  getCreative: async (creativeId) => currentStore().getCreative(creativeId),
  putEntitlement: async (snapshot) => currentStore().putEntitlement(snapshot),
  deleteEntitlement: async (userId) => currentStore().deleteEntitlement(userId),
  getEntitlement: async (userId) => currentStore().getEntitlement(userId),
};

export type { SnapshotStore } from "./store";
export { SNAPSHOT_CACHE_SECONDS, SnapshotReadError, creativeKey, entitlementKey } from "./store";
export { isEntitled, shouldServe } from "./entitlement";
export { snapshotToServing } from "./row";
export { SNAPSHOT_SCHEMA_VERSION } from "./types";
export type {
  CreativeSnapshot,
  EntitlementSnapshot,
  EntitlementRecord,
} from "./types";

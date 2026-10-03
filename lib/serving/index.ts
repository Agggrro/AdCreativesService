// Public API of the serving-snapshot layer (ADR-0015, ADR-0029).
//
// Call sites import `snapshots` from here and never name a storage vendor.
// Swapping the backing store is meant to be an edit to this file plus one new
// implementation module — see lib/serving/store.ts for why that seam exists.
//
// The ad Worker (workers/ads) does not come through here: it builds its store
// from its own KV binding and hands it to the handlers in lib/serving/http,
// which keeps the Blob SDK out of its bundle.
import { dualWriteStore, kvSnapshotStore } from "./store-kv";
import { restNamespaceFromEnv } from "./kv";
import { registeredSnapshotNamespace } from "./registry";
import { SnapshotReadError, type SnapshotStore } from "./store";

export { registerSnapshotNamespace } from "./registry";

/**
 * The Blob store, loaded only when it is configured. A static import would put
 * `@vercel/blob` — and the undici and jose it carries — into every runtime the
 * app runs on, evaluated at startup, including a Worker that never touches it
 * (ADR-0029). It goes entirely once the app has left Vercel.
 */
async function blobStore(): Promise<SnapshotStore> {
  return (await import("./store-blob")).blobSnapshotStore;
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
function withoutKv(blob: SnapshotStore | null): SnapshotStore {
  // Refused, but not before the Blob copy is cleared: the legacy paths on the
  // app domain still read it, and a write that failed must not leave it serving
  // the previous state there either (store.ts, "fail closed").
  const refuse = (clear?: () => Promise<void>) => async (): Promise<never> => {
    await clear?.().catch(() => undefined);
    throw new Error(
      "Snapshot KV is not configured (no binding, no SNAPSHOT_KV_* variables): " +
        "refusing a write the ad domain would never see (ADR-0029).",
    );
  };
  const unreadable = async (): Promise<never> => {
    throw new SnapshotReadError("no snapshot store is configured");
  };
  return {
    putCreative: (s) => refuse(blob ? () => blob.deleteCreative(s.creative_id) : undefined)(),
    deleteCreative: (id) => refuse(blob ? () => blob.deleteCreative(id) : undefined)(),
    putEntitlement: (s) => refuse(blob ? () => blob.deleteEntitlement(s.user_id) : undefined)(),
    deleteEntitlement: (id) => refuse(blob ? () => blob.deleteEntitlement(id) : undefined)(),
    getCreative: blob ? (id) => blob.getCreative(id) : unreadable,
    getEntitlement: blob ? (id) => blob.getEntitlement(id) : unreadable,
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
async function currentStore(): Promise<SnapshotStore> {
  const bound = registeredSnapshotNamespace();
  if (bound) return kvSnapshotStore(() => bound);

  const rest = kvOverRest();
  const blob = blobConfigured() ? await blobStore() : null;
  if (rest) return blob ? dualWriteStore(blob, rest) : rest;
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
export async function auditableSnapshotStores(): Promise<{ name: string; store: SnapshotStore }[]> {
  const bound = registeredSnapshotNamespace();
  if (bound) return [{ name: "kv", store: kvSnapshotStore(() => bound) }];

  const stores = [{ name: "kv", store: kvOverRest() ?? withoutKv(null) }];
  if (blobConfigured()) stores.push({ name: "blob", store: await blobStore() });
  return stores;
}

// Async on purpose: resolving the store can throw (a malformed KV
// configuration), and that must reach callers as a rejected promise — the
// serving path's `.catch` turns a failed read into the Postgres fallback, and a
// synchronous throw would skip it.
export const snapshots: SnapshotStore = {
  putCreative: async (snapshot) => (await currentStore()).putCreative(snapshot),
  deleteCreative: async (creativeId) => (await currentStore()).deleteCreative(creativeId),
  getCreative: async (creativeId) => (await currentStore()).getCreative(creativeId),
  putEntitlement: async (snapshot) => (await currentStore()).putEntitlement(snapshot),
  deleteEntitlement: async (userId) => (await currentStore()).deleteEntitlement(userId),
  getEntitlement: async (userId) => (await currentStore()).getEntitlement(userId),
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

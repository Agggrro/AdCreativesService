// Public API of the serving-snapshot layer (ADR-0015, ADR-0029).
//
// Call sites import `snapshots` from here and never name a storage vendor.
// Swapping the backing store is meant to be an edit to this file plus one new
// implementation module — see lib/serving/store.ts for why that seam exists.
//
// The ad Worker (workers/ads) does not come through here: it builds its store
// from its own KV binding and hands it to the handlers in lib/serving/http.
import { kvSnapshotStore } from "./store-kv";
import { restNamespaceFromEnv } from "./kv";
import { registeredSnapshotNamespace } from "./registry";
import { SnapshotReadError, type SnapshotStore } from "./store";

export { registerSnapshotNamespace } from "./registry";

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
 * A process that cannot reach KV — `npm run dev` without the SNAPSHOT_KV_*
 * variables, say. The ad domain serves from KV, so such a process must not
 * pretend to publish: a write it reported as done would be a change the ad
 * Worker never sees — a cancellation that keeps serving. Writes refuse, loudly;
 * reads are "could not read", which the serving path answers from Postgres.
 */
const withoutKv: SnapshotStore = (() => {
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
    getCreative: unreadable,
    getEntitlement: unreadable,
  };
})();

/**
 * Which store this process talks to, decided per call (the environment and the
 * registration can both arrive after this module loads):
 *
 *   1. A registered binding — inside the app's Worker (workers/web).
 *   2. KV over REST — the Node scripts, and `npm run dev`. Never a serving path
 *      in production: over REST KV is the Cloudflare API, whose rate limit
 *      (1,200 requests per 5 minutes) is shared by everything the account
 *      does, deploys included.
 *   3. Neither — writes refuse (`withoutKv`).
 */
function currentStore(): SnapshotStore {
  const bound = registeredSnapshotNamespace();
  if (bound) return kvSnapshotStore(() => bound);
  return kvOverRest() ?? withoutKv;
}

/**
 * Every store this process should keep current, by name, for the audit
 * (lib/serving/health.ts). One since Vercel Blob went (ADR-0029); a list so the
 * next move between stores can audit both sides again, as this one did. KV is
 * there even when this process cannot reach it: every probe of it then fails,
 * so a deployment missing its KV configuration reports drift instead of passing.
 */
export async function auditableSnapshotStores(): Promise<{ name: string; store: SnapshotStore }[]> {
  return [{ name: "kv", store: currentStore() }];
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

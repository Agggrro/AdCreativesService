import { put, del, get } from "@vercel/blob";
import {
  creativeKey,
  entitlementKey,
  SNAPSHOT_CACHE_SECONDS,
  type SnapshotStore,
} from "./store";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types";

/**
 * Vercel Blob implementation of the snapshot store.
 *
 * **The store must be private.** Keys are derived from `creative_id`, and that
 * id is published in every VAST tag URL a customer pastes into a DSP — so a
 * public store would let anyone holding a tag fetch the raw snapshot, including
 * `user_id` and the full creative config, without going through the entitlement
 * gate at all. Private delivery routes the read through our own function, which
 * is where `shouldServe()` is applied. See docs/security.md.
 *
 * Reads still come off the CDN (a private `get()` is fetched through it), so
 * this keeps the property the whole design is for: the player's request touches
 * no Postgres.
 */

/** `access: "private"` on every call — see the note above; this is not a default to inherit. */
const ACCESS = "private" as const;

/**
 * `buildKey` is called inside the try rather than by the caller: key building
 * rejects a non-uuid id by throwing, and on the read side the contract is to
 * fail soft. A junk id becomes a miss (and then a database fallback), not a 500
 * on the public serving path.
 */
async function readSnapshot<T extends { schema_version: number }>(
  buildKey: () => string,
): Promise<T | null> {
  try {
    const result = await get(buildKey(), { access: ACCESS });
    // `null` is "no such blob" — a normal miss for a creative that has never
    // been published. 304 cannot occur here: we send no `ifNoneMatch`.
    if (!result || result.statusCode !== 200) return null;

    const parsed = (await new Response(result.stream).json()) as T;

    // An unknown version is treated as a miss so the caller falls back to
    // Postgres. Without this, the first incompatible shape change would be an
    // outage instead of a migration (see SNAPSHOT_SCHEMA_VERSION).
    if (parsed?.schema_version !== SNAPSHOT_SCHEMA_VERSION) return null;

    return parsed;
  } catch {
    // Reads fail soft, by contract: the caller falls back to the database.
    return null;
  }
}

async function writeSnapshot(key: string, snapshot: unknown): Promise<void> {
  // No try/catch: writes fail hard, by contract. The caller must be able to
  // refuse to report success when the publish did not land.
  await put(key, JSON.stringify(snapshot), {
    access: ACCESS,
    contentType: "application/json",
    // Republishing is the whole point of these objects, and Blob refuses to
    // overwrite unless asked. `addRandomSuffix` is already false by default;
    // stated explicitly because a random suffix would make the deterministic
    // key unresolvable and break every read.
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: SNAPSHOT_CACHE_SECONDS,
  });
}

export const blobSnapshotStore: SnapshotStore = {
  putCreative(snapshot: CreativeSnapshot) {
    return writeSnapshot(creativeKey(snapshot.creative_id), snapshot);
  },

  async deleteCreative(creativeId: string) {
    // `del` is idempotent: deleting an object that is not there is not an error,
    // which is what makes the "remove the snapshot before the row" ordering in
    // deleteCreative safe to retry. It takes no `access` — the store's own mode
    // governs it.
    await del(creativeKey(creativeId));
  },

  getCreative(creativeId: string) {
    return readSnapshot<CreativeSnapshot>(() => creativeKey(creativeId));
  },

  putEntitlement(snapshot: EntitlementSnapshot) {
    return writeSnapshot(entitlementKey(snapshot.user_id), snapshot);
  },

  async deleteEntitlement(userId: string) {
    await del(entitlementKey(userId));
  },

  getEntitlement(userId: string) {
    return readSnapshot<EntitlementSnapshot>(() => entitlementKey(userId));
  },
};

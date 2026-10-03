import { put, del, get } from "@vercel/blob";
import {
  creativeKey,
  entitlementKey,
  SNAPSHOT_CACHE_SECONDS,
  SnapshotReadError,
  type SnapshotStore,
} from "./store";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import { putOrClear } from "./store-kv";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types";

/**
 * Vercel Blob implementation of the snapshot store — the one the app is leaving
 * (ADR-0029). While it still runs on Vercel it reads here and writes here and to
 * Workers KV (`dualWriteStore` in store-kv.ts); afterwards this file goes.
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
 * A non-uuid id cannot name a document, so key building's refusal is a miss
 * here, not a failure — the routes validate first, and this keeps the store
 * safe on its own. Everything else that goes wrong is a {@link SnapshotReadError}
 * (lib/serving/store.ts).
 */
async function readSnapshot<T extends { schema_version: number }>(
  buildKey: () => string,
): Promise<T | null> {
  let key: string;
  try {
    key = buildKey();
  } catch {
    return null;
  }

  let parsed: T;
  try {
    const result = await get(key, { access: ACCESS });
    // `null` is "no such blob" — a normal miss for a creative that has never
    // been published. 304 cannot occur here: we send no `ifNoneMatch`.
    if (!result) return null;
    if (result.statusCode !== 200) {
      throw new Error(`unexpected status ${result.statusCode}`);
    }
    parsed = (await new Response(result.stream).json()) as T;
  } catch (err) {
    throw new SnapshotReadError(`snapshot read failed: ${key}`, { cause: err });
  }

  // An unknown version is "cannot read", so the caller falls back to Postgres.
  // Without this, the first incompatible shape change would be an outage
  // instead of a migration (see SNAPSHOT_SCHEMA_VERSION).
  if (parsed?.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotReadError(`snapshot has an unknown schema version: ${key}`);
  }
  return parsed;
}

async function writeSnapshot(key: string, snapshot: unknown): Promise<void> {
  // Writes fail hard, and fail closed: a put that did not land clears this
  // store's document before the error goes up (`putOrClear`, store-kv.ts).
  await putOrClear(
    async () => {
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
    },
    () => del(key),
    key,
  );
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

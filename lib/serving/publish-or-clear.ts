import { publishCreativeSnapshot, unpublishCreativeSnapshot } from "./publish";

/**
 * Publish the creative's serving snapshot, and on failure make sure no *stale*
 * snapshot is left behind (ADR-0015).
 *
 * A save is not rolled back when publishing fails, and the user is not shown an
 * error: the row is already committed, and `GET /api/vast` falls back to
 * Postgres whenever a snapshot is missing — so the tag keeps serving, correctly,
 * off the database. Telling a media buyer their save failed when it did not
 * would only produce duplicate creatives.
 *
 * Deleting on failure is the part that matters. A stale snapshot is worse than
 * no snapshot: it would serve the *previous* configuration indefinitely, while
 * its absence degrades to the fallback, which is right by construction.
 * `npm run snapshot:backfill` repairs the missing object afterwards.
 *
 * Lives here rather than in a `"use server"` file because two action modules
 * share it (the configurator's and the VAST generator's, ADR-0035), and every
 * function a `"use server"` module exports is a callable endpoint: exported from
 * there, this would let anyone republish or clear the snapshot of any creative
 * id they could name.
 */
export async function publishOrClear(creativeId: string): Promise<void> {
  try {
    await publishCreativeSnapshot(creativeId);
  } catch (err) {
    console.error("snapshot publish failed; clearing to force DB fallback", {
      creativeId,
      err,
    });
    try {
      await unpublishCreativeSnapshot(creativeId);
    } catch (clearErr) {
      // Both legs failed: the CDN may still hold an older configuration. Loud,
      // because only a backfill run will fix it.
      console.error("snapshot clear ALSO failed; stale snapshot may be serving", {
        creativeId,
        clearErr,
      });
    }
  }
}

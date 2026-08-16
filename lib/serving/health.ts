import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hasRuntimeManifest } from "@/lib/runtime-manifest";
import { snapshots } from "./index";

/**
 * Does the CDN still agree with the database?
 *
 * The serving path falls back to Postgres whenever a snapshot is missing
 * (ADR-0015), which is what makes the migration safe — and also what makes a
 * broken publisher invisible: everything keeps working, just slower and against
 * the database we were trying to get off. Nothing else would ever report it, so
 * this check exists to make the silence audible.
 *
 * Sampling, not a full sweep: the failure mode being watched for is systemic (a
 * writer that stopped publishing, a seed applied without a backfill), and a
 * systemic failure shows up in any sample. A full pass would cost one object
 * read per creative on every run.
 */

/** How many creatives and subscribers to probe per run. */
const SAMPLE_SIZE = 50;

/**
 * Upper bound on subscription rows scanned to build the distinct-subscriber set.
 * Generous relative to SAMPLE_SIZE, and explicit so the cap is a decision rather
 * than whatever page size the API happens to default to.
 */
const SUBSCRIBER_SCAN_LIMIT = 5000;

export interface SnapshotHealth {
  healthy: boolean;
  creatives: { total: number; sampled: number; missing: string[] };
  entitlements: { total: number; sampled: number; missing: string[] };
  /** False until `npm run runtime:push` has run and the manifest is committed. */
  runtimeManifestPopulated: boolean;
  checkedAt: string;
}

export async function checkSnapshotHealth(
  sampleSize: number = SAMPLE_SIZE,
): Promise<SnapshotHealth> {
  const supabase = createServiceClient();

  const [{ count: creativeTotal }, { data: creativeRows }] = await Promise.all([
    supabase.from("creatives").select("id", { count: "exact", head: true }),
    // Newest first: a publish that started failing shows up here before it shows
    // up anywhere else, because the newest rows are the ones a broken writer
    // would have missed.
    supabase
      .from("creatives")
      .select("id, user_id")
      .order("created_at", { ascending: false })
      .limit(sampleSize),
  ]);

  const creatives = creativeRows ?? [];

  // One document per subscriber, so the set to probe is the distinct users with
  // a subscription — not the subscription rows themselves. `range` because the
  // API caps an unbounded select at its default page, which would silently
  // truncate the set this samples from and report healthy for a cohort it never
  // looked at.
  const { data: subscriptionRows } = await supabase
    .from("subscriptions")
    .select("user_id")
    .order("user_id")
    .range(0, SUBSCRIBER_SCAN_LIMIT - 1);
  const subscriberIds = [...new Set((subscriptionRows ?? []).map((s) => s.user_id))];
  const sampledSubscribers = subscriberIds.slice(0, sampleSize);

  // Concurrent, not sequential. Each probe is a network read; run serially, 50
  // creatives plus 50 subscribers is 100 round trips end to end, which is enough
  // to exceed the function's time limit and make the health check itself the
  // thing that looks broken.
  const [creativeHits, entitlementHits] = await Promise.all([
    Promise.all(creatives.map((row) => snapshots.getCreative(row.id))),
    Promise.all(sampledSubscribers.map((id) => snapshots.getEntitlement(id))),
  ]);

  const missingCreatives = creatives
    .filter((_, i) => !creativeHits[i])
    .map((row) => row.id);
  const missingEntitlements = sampledSubscribers.filter((_, i) => !entitlementHits[i]);

  return {
    healthy: missingCreatives.length === 0 && missingEntitlements.length === 0,
    creatives: {
      total: creativeTotal ?? 0,
      sampled: creatives.length,
      missing: missingCreatives,
    },
    entitlements: {
      total: subscriberIds.length,
      sampled: sampledSubscribers.length,
      missing: missingEntitlements,
    },
    runtimeManifestPopulated: hasRuntimeManifest(),
    checkedAt: new Date().toISOString(),
  };
}

/** One-line summary for a log entry or a terminal. */
export function describeSnapshotHealth(health: SnapshotHealth): string {
  const c = health.creatives;
  const e = health.entitlements;
  return (
    `creatives ${c.sampled - c.missing.length}/${c.sampled} of ${c.total} present, ` +
    `entitlements ${e.sampled - e.missing.length}/${e.sampled} of ${e.total} present, ` +
    `runtime manifest ${health.runtimeManifestPopulated ? "populated" : "EMPTY"}`
  );
}

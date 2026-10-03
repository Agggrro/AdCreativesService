import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { checkDrift } from "./health";
import { publishCreativeSnapshot, publishEntitlementSnapshot } from "./publish";

/**
 * Republish, from Postgres, whatever changed recently and no longer matches a
 * store (ADR-0029).
 *
 * The writers publish as they go, and a publish that fails clears what it
 * missed (store.ts, "fail closed"). This is for what that leaves: a store that
 * could neither take a write nor clear it — the same outage, the same
 * one-write-per-second limit — so it still holds the previous document; a
 * webhook whose retries ran out; two publishes that crossed. Postgres is right
 * in every one of those cases, because the rows are written before the
 * snapshot, so the repair is to project it again.
 *
 * Only what is out of step is written: every document in the window is read and
 * compared first, so a run where nothing drifted costs reads and no writes.
 */

/** Four days: past the three days Stripe keeps retrying a live-mode event. */
export const RECONCILE_WINDOW_HOURS = 96;

/** How many ids one run looks at, each way — a bound on one run's reads. */
const MAX_IDS = 500;

export interface ReconcileResult {
  window: string;
  checked: { creatives: number; users: number };
  republished: { creatives: string[]; users: string[] };
  failed: { creatives: string[]; users: string[] };
}

export async function reconcileRecentSnapshots(
  windowHours: number = RECONCILE_WINDOW_HOURS,
): Promise<ReconcileResult> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  const [creativeRows, subscriptionRows] = await Promise.all([
    supabase
      .from("creatives")
      .select("id")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(MAX_IDS),
    supabase
      .from("subscriptions")
      .select("user_id")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(MAX_IDS),
  ]);
  if (creativeRows.error) throw new Error(`creatives read failed: ${creativeRows.error.message}`);
  if (subscriptionRows.error) {
    throw new Error(`subscriptions read failed: ${subscriptionRows.error.message}`);
  }

  const creativeIds = (creativeRows.data ?? []).map((row) => row.id);
  const userIds = [...new Set((subscriptionRows.data ?? []).map((row) => row.user_id))];

  const result: ReconcileResult = {
    window: `${windowHours}h`,
    checked: { creatives: creativeIds.length, users: userIds.length },
    republished: { creatives: [], users: [] },
    failed: { creatives: [], users: [] },
  };
  const drifted = (stores: Awaited<ReturnType<typeof checkDrift>>, kind: "creatives" | "entitlements") => [
    ...new Set(stores.flatMap((s) => [...s[kind].missing, ...s[kind].stale])),
  ];

  // Entitlements first, and on their own: they decide whether a tag serves at
  // all, and a creative that cannot be checked must not stop them being
  // repaired. One at a time — the Node side writes KV through the Cloudflare
  // API, whose rate limit the whole account shares, and KV takes one write per
  // second per key; a repair has no deadline worth spending either on.
  const usersToFix = drifted(await checkDrift([], userIds), "entitlements");
  for (const userId of usersToFix) {
    try {
      await publishEntitlementSnapshot(userId, supabase);
      result.republished.users.push(userId);
    } catch (err) {
      console.error("[snapshot-reconcile] entitlement not republished", { userId, err: String(err) });
      result.failed.users.push(userId);
    }
  }

  let creativesToFix: string[] = [];
  try {
    creativesToFix = drifted(await checkDrift(creativeIds, []), "creatives");
  } catch (err) {
    console.error("[snapshot-reconcile] creatives could not be checked", { err: String(err) });
    result.failed.creatives.push("(check failed)");
  }
  for (const creativeId of creativesToFix) {
    try {
      await publishCreativeSnapshot(creativeId, supabase);
      result.republished.creatives.push(creativeId);
    } catch (err) {
      console.error("[snapshot-reconcile] creative not republished", { creativeId, err: String(err) });
      result.failed.creatives.push(creativeId);
    }
  }
  return result;
}

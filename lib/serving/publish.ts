import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database.types";
import { snapshots } from "./index";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import type { CreativeSnapshot, EntitlementRecord, EntitlementSnapshot } from "./types";

/**
 * Publishing serving snapshots to the CDN (ADR-0015).
 *
 * Postgres stays the source of truth; these functions project it. Every writer
 * that changes a row behind `private.creative_serving` calls one of them in the
 * same unit of work — see app/dashboard/creatives/actions.ts and
 * app/api/stripe/webhook/route.ts.
 *
 * The creative snapshot is built from `get_creative_serving`, the very RPC the
 * serving path used to call, rather than from a hand-written join. That is
 * deliberate: the snapshot is then the view's own output by construction and
 * cannot drift from it in shape. Only the two computed columns are dropped, and
 * for the reason set out in lib/serving/entitlement.ts.
 *
 * Server-only: it needs the service role, which bypasses RLS.
 */

type DB = SupabaseClient<Database>;

/**
 * Read one creative's serving row and publish it.
 *
 * Throws on any failure — a caller must not report success for a save whose
 * snapshot never reached the CDN, because the tag would then keep serving the
 * previous configuration until something else republished it.
 */
export async function publishCreativeSnapshot(
  creativeId: string,
  client?: DB,
): Promise<void> {
  const supabase = client ?? createServiceClient();

  const { data, error } = await supabase.rpc("get_creative_serving", {
    p_creative_id: creativeId,
  });
  if (error) throw new Error(`get_creative_serving failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`no serving row for creative ${creativeId}`);
  }

  const row = data[0];
  const snapshot: CreativeSnapshot = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    creative_id: row.creative_id,
    user_id: row.user_id,
    template_id: row.template_id,
    selected_format: row.selected_format,
    config_json: row.config_json,
    creative_status: row.creative_status,
    template_type: row.template_type,
    runtime_keys: row.runtime_keys,
    supported_standards: row.supported_standards,
    click_fields: row.click_fields,
    published_at: new Date().toISOString(),
  };

  await snapshots.putCreative(snapshot);

  // The row may have been deleted between the read above and the write: a
  // delete removes the snapshot first and the row second, so this write can
  // land after its removal and resurrect a creative with no row — one that
  // serves until its owner's subscription lapses, invisible to everything that
  // starts from the rows. Checked again, and undone if so; deleteCreative
  // removes the snapshot a second time from its side.
  const { data: still, error: recheckError } = await supabase.rpc("get_creative_serving", {
    p_creative_id: creativeId,
  });
  if (!recheckError && (!still || still.length === 0)) {
    await snapshots.deleteCreative(creativeId);
  }
}

/**
 * Republish one user's entitlement document.
 *
 * Keyed by user rather than by creative on purpose: an all-access plan covers
 * every creative the user owns and a single plan covers every creative on one
 * template, so keying by creative would turn one Stripe event into N writes.
 * This is one write regardless of how many creatives exist.
 *
 * Note what is *not* stored: no boolean verdict. The rows carry
 * `current_period_end`, and the serving path compares it against the clock, so
 * a subscription still lapses on time when no webhook arrives to say it did.
 *
 * Read, write, then read again: two publishes for one user can run at once — the
 * events of one checkout arrive together, and the reconciler can overlap a
 * webhook — and the one that read first can write last. Nothing would then
 * correct it, since both reported success. So the facts are read again after
 * the write, and a publish that is already out of date is redone. A store that
 * refuses the write clears its copy and this throws (store.ts, "fail closed").
 */
export async function publishEntitlementSnapshot(
  userId: string,
  client?: DB,
): Promise<void> {
  const supabase = client ?? createServiceClient();

  const readFacts = async (): Promise<EntitlementRecord[]> => {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan_type, template_id, status, current_period_end")
      .eq("user_id", userId)
      .order("stripe_subscription_id")
      .order("id")
      // Not retried: this runs under a webhook's ceiling, and the failure path
      // (clear every store) must get to run before that ceiling cuts it off.
      .retry(false);
    if (error) throw new Error(`subscriptions read failed: ${error.message}`);
    return (data ?? []).map((s) => ({
      plan_type: s.plan_type,
      template_id: s.template_id,
      status: s.status,
      current_period_end: s.current_period_end,
    }));
  };
  const put = (subscriptions: EntitlementRecord[]) =>
    snapshots.putEntitlement({
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      user_id: userId,
      subscriptions,
      published_at: new Date().toISOString(),
    } satisfies EntitlementSnapshot);

  let subscriptions: EntitlementRecord[];
  try {
    subscriptions = await readFacts();
  } catch (err) {
    // The caller has usually just changed the rows (a webhook's upsert has
    // committed), so the stores' copies are already out of date — and no put
    // will run to clear them on failure. Cleared here instead: fail closed.
    await snapshots.deleteEntitlement(userId).catch((clearErr: unknown) => {
      console.error("[snapshot-stale] an unpublishable entitlement could not be cleared", {
        userId,
        err: String(clearErr),
      });
    });
    throw err;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await put(subscriptions);
    const now = await readFacts();
    if (JSON.stringify(now) === JSON.stringify(subscriptions)) return;
    subscriptions = now;
  }
  // Still moving after three rounds. The last put may have landed after a newer
  // one another publisher already reported — so the latest facts go in once
  // more before this gives up, rather than leaving a copy known to be stale.
  await put(subscriptions);
  throw new Error(`entitlement for ${userId} kept changing while it was published`);
}

/** Remove a creative's snapshot. See the ordering note in deleteCreative. */
export async function unpublishCreativeSnapshot(creativeId: string): Promise<void> {
  await snapshots.deleteCreative(creativeId);
}


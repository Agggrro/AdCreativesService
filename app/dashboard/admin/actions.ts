"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { publishEntitlementSnapshot } from "@/lib/serving/publish";
import { requireAdminUser } from "@/lib/admin";
import type { AdminError } from "@/lib/admin-errors";
import { isUuid } from "@/lib/uuid";

/**
 * The closed-beta grant (ADR-0034) — the one writer of `subscriptions` now
 * that the Stripe webhook is gone, and like it a service-role write followed
 * by a snapshot publish in the same unit of work (lib/serving/publish.ts).
 *
 * A participant is a row `{all_access, active, no period end, no Stripe id}`.
 * Revoking marks the manual rows `canceled` — an UPDATE, never a DELETE — and a
 * later grant is a new row beside the dead one, exactly as a resubscription was
 * in the Stripe era. The reason is the reconciler: it finds the users it checks
 * through `subscriptions.updated_at`, so a user whose rows were deleted would
 * vanish from its window, and a revoke whose publish *and* fail-closed clear
 * both failed (one KV outage covers both) would leave an entitled document on
 * air with nothing left to repair it. A cancelled row bumps `updated_at` and
 * keeps the user in the window; `subscriptions_keep_canceled` then makes the
 * cancellation final, which is also what we want. Rows with a
 * `stripe_subscription_id` are not touched by either action: they are a billing
 * provider's, and this is not its writer.
 *
 * The publish runs after the row change, not instead of it: Postgres is the
 * source of truth, the snapshot a projection. If the publish fails, the store
 * has already cleared its copy (fail closed — a missing document serves
 * nothing) and the reconciler republishes the row within ten minutes; the admin
 * is told that is where it stands rather than shown a success.
 */

function back(error?: AdminError): never {
  redirect(error ? `/dashboard/admin?error=${error}` : "/dashboard/admin");
}

/** Publish after a row change; the caller has already written. */
async function republish(userId: string, client: ReturnType<typeof createServiceClient>) {
  try {
    await publishEntitlementSnapshot(userId, client);
  } catch (err) {
    console.error("[beta-access] row written, snapshot not published", {
      userId,
      err: String(err),
    });
    return false;
  }
  return true;
}

export async function grantBetaAccess(formData: FormData): Promise<void> {
  await requireAdminUser();
  const userId = String(formData.get("user_id") ?? "");
  // Shape-check before any DB call, the house rule in docs/security.md.
  if (!isUuid(userId)) back("grant");

  const service = createServiceClient();

  // `.select()` so a write that affected no row is visible: a user id that
  // names nobody fails the foreign key, and that must not read as success.
  // Idempotent through `subscriptions_one_manual_grant_idx` (schema.sql): a
  // second grant, raced or repeated, is a 23505, and the grant it collided
  // with is the one we wanted — so that is success, and the publish still runs.
  const { data: inserted, error } = await service
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_type: "all_access",
      status: "active",
      template_id: null,
      current_period_end: null,
    })
    .select("id");
  const raced = error?.code === "23505";
  if (!raced && (error || !inserted || inserted.length === 0)) {
    console.error("[beta-access] grant wrote no row", { userId, error });
    back("grant");
  }

  const published = await republish(userId, service);
  back(published ? undefined : "publish");
}

export async function revokeBetaAccess(formData: FormData): Promise<void> {
  await requireAdminUser();
  const userId = String(formData.get("user_id") ?? "");
  if (!isUuid(userId)) back("revoke");

  const service = createServiceClient();

  // Every live manual row of the user. Zero rows is not an error — the access
  // may already be gone — but a refused update is. An UPDATE, not a DELETE:
  // see the note at the top of this file.
  const { error } = await service
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("user_id", userId)
    .is("stripe_subscription_id", null)
    .neq("status", "canceled");
  if (error) {
    console.error("[beta-access] revoke could not cancel", { userId, error });
    back("revoke");
  }

  const published = await republish(userId, service);
  back(published ? undefined : "publish");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { recordIsLive } from "@/lib/serving/entitlement";

/**
 * Closed-beta access, as the dashboard reads it (ADR-0034).
 *
 * A participant is an account holding an `all_access` row in `subscriptions`
 * that `private.is_entitled` would accept: status `active` (or `trialing`, which
 * a manual grant never writes but a billing provider once did) and a period end
 * that is null or still ahead. The row test is the serving path's own
 * (`recordIsLive`, lib/serving/entitlement.ts), so this file cannot drift from
 * it; what it adds is only the all-access branch — "access to every template?".
 * The serving path does not import this file: the dependency runs one way,
 * dashboard → serving, and serving learns nothing about auth or admins.
 */

/** The admin's Telegram, where closed-beta terms are agreed. */
export const TELEGRAM_HANDLE = "agggrro";
export const TELEGRAM_URL = `https://t.me/${TELEGRAM_HANDLE}`;

export interface AccessRow {
  plan_type: Database["public"]["Enums"]["plan_type"];
  status: Database["public"]["Enums"]["subscription_status"];
  current_period_end: string | null;
  created_at: string;
}

/** `status in (active, trialing)` and not expired — the predicate's row test, whatever the plan. */
export function isLive(row: AccessRow, now: Date = new Date()): boolean {
  return recordIsLive(row, now);
}

/** The earliest live all-access row, or null: access to every template, and since when. */
export function allAccessSince(rows: AccessRow[], now: Date = new Date()): string | null {
  const live = rows
    .filter((row) => row.plan_type === "all_access" && isLive(row, now))
    .map((row) => row.created_at)
    .sort();
  return live[0] ?? null;
}

export function hasAllAccess(rows: AccessRow[], now: Date = new Date()): boolean {
  return allAccessSince(rows, now) !== null;
}

/**
 * The signed-in viewer's own access, read on their session so RLS
 * (`subscriptions_select_own`) scopes the rows; the explicit `user_id` filter
 * is defence in depth, so a policy change could widen nothing here. A failed
 * read answers "no access": the only thing that decision controls is whether
 * the account menu and the Creatives list show the way to ask for it
 * (ADR-0037), and showing that to a participant costs a glance, while hiding
 * it from a non-participant hides the one way to ask.
 */
export async function readOwnAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ granted: boolean; since: string | null }> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_type, status, current_period_end, created_at")
    .eq("user_id", userId);
  if (error || !data) return { granted: false, since: null };
  const since = allAccessSince(data);
  return { granted: since !== null, since };
}

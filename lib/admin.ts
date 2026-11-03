import "server-only";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Who may grant closed-beta access (ADR-0034).
 *
 * The product has no role column: the one privileged surface, `/dashboard/admin`,
 * is reachable by the accounts named in `ADMIN_EMAILS` and nobody else. An email
 * is enough to *name* the account because Supabase Auth keeps emails unique and
 * confirms a change of address before it takes effect — a second account cannot
 * sign up as, or move itself onto, the admin's address. It still only names it:
 * the caller is identified by `supabase.auth.getUser()` on their own session, and
 * this function is asked about that user's email, never about one from a request.
 *
 * Callers answer a failed gate with **404, not 403** — the same rule as
 * `lib/dev-only.ts`: in production the page should not exist as something to
 * probe for.
 *
 * An empty or missing `ADMIN_EMAILS` means nobody is an admin, which is the safe
 * default for a deployment that forgot to set it. The one operational rule:
 * **every address here must already be a registered account.** The uniqueness
 * argument above protects an address that exists; an address listed before
 * anyone registers it belongs to whoever registers it first.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  return admins.includes(email.trim().toLowerCase());
}

/**
 * The gate itself, shared by the admin page and its server actions so the two
 * cannot drift: signed out → `/login` (the dashboard's own rule); signed in but
 * not an admin → 404. Returns the admin's user for the caller's own use.
 *
 * Both throw, so nothing after this line runs for anyone else — which is what
 * lets every service-role call in the admin code sit after it without a second
 * check.
 */
export async function requireAdminUser(): Promise<User> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

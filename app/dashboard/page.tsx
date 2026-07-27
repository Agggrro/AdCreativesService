import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * `/dashboard` is no longer a page — the sections are Каталог / Мои креативы /
 * Подписки (ADR-0008). It stays as a redirect because old links, and Stripe's
 * older `success_url`, still point here.
 *
 * A user with no creatives gets the catalog instead of an empty table: an empty
 * list is a bad first screen, and the catalog is where the first creative
 * actually starts.
 */
export default async function DashboardIndex() {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("creatives")
    .select("id", { count: "exact", head: true });

  redirect(count && count > 0 ? "/dashboard/creatives" : "/catalog");
}

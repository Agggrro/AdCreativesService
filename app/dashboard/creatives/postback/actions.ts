"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Replace the account's postback key (ADR-0023).
 *
 * The session client, not the service role: rotate_postback_key() is scoped to
 * auth.uid() inside, so the only key this can ever touch is the caller's own.
 * The outcome travels as a query flag, the same way the delete and checkout
 * flows report theirs, so the page can say it after the navigation.
 */
export async function rotatePostbackKey(): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("rotate_postback_key");
  if (error) {
    console.error("rotate_postback_key failed", { message: error.message });
    redirect("/dashboard/creatives/postback?rotate=failed");
  }
  redirect("/dashboard/creatives/postback?rotate=done");
}

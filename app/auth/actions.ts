"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { authErrorCode } from "@/lib/auth-errors";
import { safeNext, withNext } from "@/lib/safe-next";
import { getSiteUrl } from "@/lib/site";

// `next` (ADR-0036): where a visitor who signed in from the VAST generator goes
// back to. Re-checked here rather than trusted from the page, because a form
// post is as attacker-shaped as a link — `safeNext` is the open-redirect guard.
//
// `error` carries a code of ours, never Supabase's message (lib/auth-errors.ts):
// the page prints a sentence from the dictionary for it, in the visitor's
// language, and nothing a link could write.

export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(withNext(`/login?error=${authErrorCode(error, "signin")}`, next));
  }
  redirect(next ?? "/dashboard");
}

export async function signUp(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The confirmation link comes back through the callback, which re-checks
    // `next` itself. Supabase only follows a redirect its allow-list matches, so
    // the query string needs `/auth/callback**` there, not the bare path.
    options: { emailRedirectTo: withNext(`${getSiteUrl()}/auth/callback`, next) },
  });
  if (error) {
    redirect(withNext(`/signup?error=${authErrorCode(error, "signup")}`, next));
  }
  // If email confirmation is enabled, there's no active session yet.
  if (!data.session) {
    redirect(withNext("/login?message=check-email", next));
  }
  redirect(next ?? "/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

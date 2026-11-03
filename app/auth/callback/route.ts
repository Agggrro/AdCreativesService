import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

// Handles the email-confirmation / OAuth redirect: exchange the code for a session,
// then go where the visitor was headed (ADR-0036) — checked by safeNext, since a
// confirmation link is a URL anyone could have shaped.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const next = safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(`${url.origin}${next ?? "/dashboard"}`);
}

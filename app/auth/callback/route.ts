import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Handles the email-confirmation / OAuth redirect: exchange the code for a session.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${url.origin}/dashboard`);
}

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on everything except static assets and the public ad-serving / webhook
  // paths (no auth session there — skip the overhead).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/vast|api/track|api/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

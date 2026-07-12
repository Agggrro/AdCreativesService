import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on everything except static assets and the public ad-serving / webhook
  // paths (no auth session there — skip the overhead).
  //
  // "api/vast(?!/preview)" excludes the real /api/vast serving endpoint but NOT
  // its /preview subpath (a plain "api/vast" alternative would otherwise also
  // swallow /api/vast/preview as a prefix match). "api/vast/preview/" (with the
  // trailing slash) separately excludes only the GET .../[token] fetch leg,
  // which is public/self-authorizing by design — the bare POST /api/vast/preview
  // mint endpoint needs the session and must stay inside the matcher.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/vast(?!/preview)|api/vast/preview/|api/track|api/stripe|api/preview-unit|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

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
  //
  // "api/tools" is the free VAST validator: public, unauthenticated, and with a
  // latency budget of its own — /hop sits inside the player's wrapper-resolution
  // timeout, so a Supabase getUser() round trip per hop is pure cost. The /tools
  // *pages* stay inside the matcher, since they render the top bar and need to
  // know whether the visitor is signed in.
  //
  // "api/creative" is the asset path a player fetches for the SIMID document and
  // the VPAID fallback unit. It was missing from this list, so every one of
  // those fetches was paying a Supabase auth.getUser() round trip before serving
  // a byte — on a request that has no session by construction, so the call could
  // only ever return null. That is a Supabase dependency on exactly the path
  // ADR-0015 and ADR-0017 set out to make Supabase-free.
  //
  // "api/cron" is invoked by Vercel's scheduler with a bearer token, never a
  // session cookie; the route does its own authorization.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/vast(?!/preview)|api/vast/preview/|api/track|api/stripe|api/creative|api/cron|api/preview-unit|api/tools|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

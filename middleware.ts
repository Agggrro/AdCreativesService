import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getCdnHost } from "@/lib/site";

export async function middleware(request: NextRequest) {
  // Nothing may set a cookie on the ad domain (ADR-0018). It loads inside other
  // people's players on other people's pages, so any cookie there is a
  // third-party cookie that browsers are busy killing anyway — and this is the
  // one function in the app that writes them (lib/supabase/middleware.ts calls
  // auth.getUser(), which rotates the session cookie onto the response).
  //
  // The hot ad paths never reach here at all: `v`, `t` and `c` are excluded by
  // the matcher below, because middleware runs *before* the rewrites and so sees
  // the public path, not `/api/vast`. This check covers everything else that
  // arrives on that host — a stray crawler, a probe, the ad-ops page — and makes
  // "no cookies" a property of the code rather than of the routing table.
  const cdnHost = getCdnHost();
  if (cdnHost && request.headers.get("host") === cdnHost) {
    return NextResponse.next();
  }

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
  //
  // "v", "t" and "c" are the neutral public paths from next.config.ts. They must
  // be listed by those names, not by what they rewrite to: middleware runs
  // before beforeFiles/afterFiles rewrites, so it sees `/v`, and the `api/vast`
  // exclusion above would not cover it. Without them every impression would pay
  // an edge invocation and an auth round trip.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|v$|t$|c/|api/vast(?!/preview)|api/vast/preview/|api/track|api/stripe|api/creative|api/cron|api/preview-unit|api/tools|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

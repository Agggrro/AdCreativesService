import { createServerSupabase } from "@/lib/supabase/server";
import { isLocalRequest } from "@/lib/dev-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in a local development account without anyone typing a password into a
 * form — visit this once per browser session and land on the dashboard.
 *
 * It exists because the dashboard is behind `signInWithPassword`
 * (`app/auth/actions.ts`), which makes every authenticated surface unreachable
 * to an automated browser that has no session and must not handle credentials.
 * Everything downstream of it — the configurator, the preview panel, the
 * creative harness — was only verifiable by asking a human to click through the
 * login form first.
 *
 * This is emphatically **not** an auth bypass. It calls the same
 * `signInWithPassword` a real visitor's form submission calls, against a real
 * account the developer created themselves, and the resulting session is an
 * ordinary one: same cookie, same RLS, same expiry. The only thing skipped is
 * the typing. That matters — a bypass that minted a session some other way
 * would let bugs in the real login path go unnoticed here.
 *
 * Gated three ways, failing closed on each: `isDevOnlyEnabled()` (not
 * production, not any Vercel deployment) and the presence of both env vars. The
 * credentials are the developer's own, live only in `.env.local`, and are never
 * committed — see `.env.example`.
 */
export async function GET(request: Request): Promise<Response> {
  // `isLocalRequest`, not `isDevOnlyEnabled`: a development *build* is not the
  // same thing as an unreachable one. `next dev` binds 0.0.0.0, and this route
  // grants a session to whoever asks.
  if (!isLocalRequest(request)) return new Response(null, { status: 404 });

  // This is a GET that changes state, so it is reachable by plain navigation —
  // which means any page on the internet can send a developer's browser here
  // and silently swap the session they are testing under (a top-level
  // navigation carries cookies regardless of SameSite=Lax). `none` is a typed
  // or bookmarked URL, which is the intended way in; `cross-site` never is.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return new Response(null, { status: 404 });
  }

  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) return new Response(null, { status: 404 });

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Deliberately explicit: the overwhelmingly likely cause is that the account
    // named by DEV_LOGIN_EMAIL does not exist yet, and a bare 401 would send the
    // reader hunting through auth code for a problem that is a sign-up away.
    // Safe to spell out — this response only ever renders on localhost.
    return Response.json(
      {
        error: error.message,
        hint:
          `Could not sign in as ${email}. Create that account once via /signup ` +
          `(or the Supabase dashboard), then set DEV_LOGIN_PASSWORD in .env.local.`,
      },
      { status: 401 },
    );
  }

  // A 303 with no session cookie would bounce between here and /login forever.
  // `setAll` in lib/supabase/server.ts swallows cookie-write failures by design,
  // so success has to be read off the result rather than assumed from `!error`.
  if (!data.session) {
    return Response.json({ error: "no session was established" }, { status: 500 });
  }

  // Relative destinations only, resolved rather than pattern-matched. `next`
  // lands in a Location header, so anything that resolves off-origin is an open
  // redirect — on the one endpoint that also hands out a session, which makes
  // "log in and bounce somewhere hostile" a single URL. Prefix checks are the
  // wrong tool: `//host` is protocol-relative, and `/\host` is too, because
  // WHATWG treats `\` as `/` in a special scheme. Resolving against a base and
  // comparing origins covers both, plus absolute URLs and anything unparseable,
  // without maintaining a list of tricks.
  const requested = new URL(request.url).searchParams.get("next");
  let destination = "/dashboard";
  if (requested) {
    try {
      const base = "http://dev.invalid";
      const resolved = new URL(requested, base);
      if (resolved.origin === base) {
        destination = resolved.pathname + resolved.search + resolved.hash;
      }
    } catch {
      /* unparseable — keep the default */
    }
  }

  return new Response(null, { status: 303, headers: { Location: destination } });
}

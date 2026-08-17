/**
 * The gate for every developer-only surface in the app — today the password-less
 * session route (`/api/dev/session`) and the creative harness (`/dev/harness`).
 *
 * Three independent conditions rather than one, and every one of them must hold.
 * `NODE_ENV` alone is a single point of failure, and it is not even sufficient:
 * a Vercel *preview* deployment runs with `NODE_ENV=production` but is still a
 * publicly reachable URL, so `VERCEL` excludes every deployment regardless of
 * which environment it claims to be. The third condition lives at each call
 * site — the route also refuses unless its own env vars are present — so
 * forgetting to set them fails closed rather than opening a surface.
 *
 * Callers must answer a failure with **404, not 403**: in production these
 * routes should not exist even as something to probe for.
 */
export function isDevOnlyEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL) return false;
  return true;
}

/** Hostnames that are genuinely this machine. `host` arrives with its port attached. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * `example.com:3000` → `example.com`, leaving IPv6 literals intact in both the
 * forms these headers actually carry.
 *
 * A `Host` header brackets IPv6 (`[::1]:3000`), but `x-forwarded-for` does not
 * — it carries the bare address, and Next puts `::1` there for a local request.
 * Splitting that on `:` yields the empty string, not an address, which is what
 * made the first version of this reject every request it was meant to allow.
 */
function hostname(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) return trimmed.slice(0, trimmed.indexOf("]") + 1);
  // More than one colon means a bare IPv6 address; there is no port to strip.
  if (trimmed.indexOf(":") !== trimmed.lastIndexOf(":")) return trimmed;
  return trimmed.split(":")[0];
}

/**
 * Loopback by name or by address, in every spelling these headers carry.
 *
 * The IPv4-mapped form is not hypothetical: a dual-stack Node listener reports
 * a `curl http://127.0.0.1:3000` client as `::ffff:127.0.0.1`, so leaving it
 * out rejected connections to the loopback address while allowing the
 * identical ones to `localhost` (verified against the running server).
 */
function isLoopback(value: string): boolean {
  let host = hostname(value);
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host === "0:0:0:0:0:0:0:1" || host === "[0:0:0:0:0:0:0:1]") return true;
  // ::ffff:127.0.0.1 — an IPv4 address wearing IPv6 clothes.
  const mapped = /^\[?::ffff:(\d{1,3}(?:\.\d{1,3}){3})\]?$/i.exec(host);
  if (mapped) host = mapped[1];
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * The gate above, plus the condition it cannot see: that the request actually
 * came from this machine.
 *
 * `isDevOnlyEnabled()` answers "is this a development *build*", which is not the
 * same question as "is this reachable by someone else". `next dev` binds
 * `0.0.0.0` and prints a LAN address on startup; `npm run dev:https` exists
 * precisely so other devices can reach it; and this product routinely needs a
 * public tunnel so a third-party player or DSP can fetch a VAST tag. In every
 * one of those cases the build is still "development" while the port is open to
 * the coworking space — and `/api/dev/session` hands out a real session.
 *
 * So: every hostname and address the request carries must be loopback.
 *
 * **This is defence in depth, not the control.** Every value it reads is a
 * request header, and Next passes client-supplied `Host` and `X-Forwarded-For`
 * through rather than overwriting them — verified against the running server:
 * `curl -H "Host: localhost:3000" -H "X-Forwarded-For: ::1"` satisfies every
 * check below no matter where it came from. Anyone who can open a socket to the
 * dev server can therefore pass this. What actually keeps them out is that
 * **`npm run dev` binds 127.0.0.1** (`-H` in package.json), so there is no
 * socket to open from anywhere else.
 *
 * What this function is genuinely worth: it stops the *accidental* case — a
 * browser opened at the LAN address, a proxy or tunnel in front — where the
 * headers are honest. Treat it as a second lock, and never re-expose the dev
 * server to a network on the strength of it. Running `next dev -H 0.0.0.0`
 * makes `/api/dev/session` reachable by anyone who can route to the port.
 *
 * Judged by the *values* of the forwarding headers, not by their presence:
 * Next synthesises `x-forwarded-host`, `x-forwarded-for`, `x-forwarded-proto`
 * and `x-forwarded-port` on every request, direct ones included (verified — a
 * plain `curl http://localhost:3000` arrives carrying
 * `x-forwarded-for: ::1`). Rejecting on presence therefore rejects everything,
 * which is how the first version of this check 404'd its own developer.
 */
export function isLocalHeaders(headers: Headers): boolean {
  if (!isDevOnlyEnabled()) return false;

  const host = headers.get("host");
  if (!host || !isLoopback(host)) return false;

  // A real proxy or tunnel rewrites Host to its own name and puts the original
  // here; a local hop leaves both pointing at loopback.
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost && !isLoopback(forwardedHost)) return false;

  // The left-most entry is the original client. A LAN peer or a tunnel visitor
  // shows up here as a routable address even when Host survived intact.
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const client = forwardedFor.split(",")[0];
    if (!client || !isLoopback(client)) return false;
  }

  return true;
}

/** {@link isLocalHeaders} for a Route Handler, which has the whole request. */
export function isLocalRequest(request: Request): boolean {
  return isLocalHeaders(request.headers);
}

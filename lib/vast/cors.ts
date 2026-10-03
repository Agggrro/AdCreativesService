/**
 * CORS for a VAST response — the rule VAST 4.2 sets in "Browser Security →
 * Cross Origin Resource Sharing (CORS) for JavaScript". Google's IMA docs ask
 * for the same two headers:
 *
 *   Access-Control-Allow-Origin: <the request's Origin>
 *   Access-Control-Allow-Credentials: true
 *
 * The spec adds one carve-out of its own: a request whose Origin is `null` or
 * absent gets `*` with no credentials header, so originless requests (iOS
 * WKWebView, a `file:` page) still read it.
 *
 * Why not simply `*`: whether a request carries credentials is the *player's*
 * choice (`XMLHttpRequest.withCredentials`, `fetch`'s `credentials: "include"`),
 * not ours, and having no cookies to send does not make it uncredentialed. A
 * player that asks for credentials is handed a response the browser refuses to
 * expose unless it names the exact origin and allows credentials — the tag
 * arrives, 200 and all, and the player is told it failed. `*` was the rule here
 * until a partner's player did exactly that (ADR-0026).
 *
 * Echoing any origin with credentials is safe on these routes because nothing
 * in the response depends on credentials: they read no cookie and no session,
 * and the ad domain never sets one (ADR-0018). A credentialed reader gets
 * exactly what `curl` already gets.
 *
 * `Vary: Origin` goes on every response, the `*` ones included. The body is
 * shared but this header is not, and a shared cache that ignored the difference
 * would hand one publisher's `Access-Control-Allow-Origin` to the next —
 * breaking every site but the first. Caches downstream of us key on it; the ad
 * Worker's own stores the body without CORS headers at all (ADR-0029).
 */

/**
 * A serialized origin, `scheme://host[:port]` — what a browser sends. The
 * literal `null` (an opaque origin: a sandboxed frame, `file:`, `data:`) does
 * not match and gets the originless answer, as the spec asks. Non-http schemes
 * are allowed on purpose: an app webview's `capacitor://localhost` is a real
 * origin a player runs on.
 *
 * Control characters and commas are refused as well as whitespace. Node's
 * parser already rejects the bytes that would make `new Response` throw, but
 * this value is echoed into a header, and it should not take the parser's word
 * for that: a throw here happens before the handler's `try`, and would turn the
 * designed empty VAST into Next's bare 500. A comma means several origins were
 * merged into one value, which is not an origin either.
 */
const SERIALIZED_ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^\s\p{Cc}/?#,]+$/iu;

export function vastCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin && SERIALIZED_ORIGIN.test(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    };
  }
  return { "Access-Control-Allow-Origin": "*", Vary: "Origin" };
}

/**
 * The preflight answer. A plain VAST fetch is a simple request and never sends
 * one; a player that adds a header, or calls `fetch` with custom options, does.
 *
 * Allowed headers are echoed from the request rather than answered with `*`:
 * on a credentialed request `*` is not a wildcard but a header literally named
 * "*", which allows nothing. Echoing is safe for the reason the origin is —
 * there is nothing behind these routes that a credential could unlock.
 */
export function vastPreflightHeaders(request: Request): Record<string, string> {
  const requested = request.headers.get("access-control-request-headers");
  return {
    ...vastCorsHeaders(request),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    ...(requested ? { "Access-Control-Allow-Headers": requested } : {}),
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

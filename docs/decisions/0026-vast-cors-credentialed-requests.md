# 0026. VAST responses answer credentialed requests, as VAST 4.2 requires

- Status: Accepted
- Date: 2026-09-28
- Supersedes: the CORS consequence of [ADR-0018](0018-dedicated-ad-serving-domain.md)
  (the rest of 0018 stands)

## Context

ADR-0018 put `Access-Control-Allow-Origin: *` on the tag with no `Vary: Origin`: the
response carries no credentials, and varying on origin would shard the CDN cache per
publisher. The route's own comment went further — `Access-Control-Allow-Credentials`
"must never be added here", since there are no cookies on this path to want it for.

That reasoning had the direction wrong. Whether a request carries credentials is decided
by the **player** — `XMLHttpRequest.withCredentials = true`, or `fetch` with
`credentials: "include"` — not by the server, and having no cookies to receive does not
make a request uncredentialed. For a credentialed request the browser exposes the
response only if `Access-Control-Allow-Origin` names the request's exact origin and
`Access-Control-Allow-Credentials: true` is present. Against `*` it receives the bytes,
200 and all, and tells the player the load failed.

On 2026-09-28 a partner ran our production tag through the player on a live tube site and
it did not play: the value of `Access-Control-Allow-Origin` "must not be the wildcard '*'
when the request's credentials mode is 'include'". Reproduced from a neutral page: the same
XHR with `withCredentials = true` is refused, and with `false` it reads the full document.
Google IMA — the player behind the validator and most of our testing — fetches the tag
without credentials and was unaffected (checked on IMA 3.791), which is how this went
unnoticed.

It is not one player's quirk. VAST 4.2 — the version every tag declares — says, in
"Browser Security → Cross Origin Resource Sharing (CORS) for JavaScript", that ad servers
must answer `Access-Control-Allow-Origin: <origin header value>` with
`Access-Control-Allow-Credentials: true`, and that only a request whose `Origin` is null
gets `*` with no credentials header. Google's IMA documentation states the same
requirement. Our own preview route ([ADR-0006](0006-live-preview-token.md)) already echoed
the origin, so the configurator's preview passed where the served tag failed.

## Decision

**Every VAST response answers by the VAST 4.2 rule, from one implementation:**
[`lib/vast/cors.ts`](../../lib/vast/cors.ts), used by `/v` (≡ `/api/vast`) and
`/api/vast/preview/[token]`.

- A request carrying a serialized origin (`scheme://host[:port]`) gets it echoed, with
  `Access-Control-Allow-Credentials: true`.
- A request with no `Origin`, `Origin: null`, or a value that is not a serialized origin
  gets `*` and no credentials header — the spec's carve-out for originless requests such
  as iOS WKWebView.
- **Every response carries `Vary: Origin`, the `*` ones included**, so a shared cache keeps
  one copy per origin instead of handing one publisher's header to the next.
- The preflight echoes `Access-Control-Request-Headers`: on a credentialed request `*` is
  a header literally named "*", not a wildcard.

**`next.config.ts` sets no CORS on `/v`.** The handler is the only source; a static rule
beside it could only override or duplicate it.

**The other ad paths keep `*`.** `/t` is a simple GET that lands whether or not its
response is readable; `/c/s/…` and `/c/u/…` load by navigation and `<script src>`, which
never read a response through CORS. None of them is a VAST document. The validator's
wrapper proxy (`/api/tools/vast/hop`) keeps its own origin echo without credentials: it
answers only our IMA player.

## Consequences

- **The tag's CDN cache is keyed by origin** — one copy per region × creative × requesting
  origin, where there was one per region × creative. Vercel's CDN keys on any `Vary` header
  except `Cookie`. The cost is a function invocation per new origin per minute per region:
  negligible at today's volume. If that stops being true, the lever is to attach the headers
  after the cache (the routing layer, or a CDN worker) — not to return to `*`.
- **Cache-busting through `Origin` opens nothing new.** The query string already keys the
  cache, so anyone who wants a miss can already have one.
- **Echoing any origin with credentials is safe here, and only because the response does
  not depend on credentials.** `/v` reads no cookie and no session on any host, the ad
  domain never sets one ([ADR-0018](0018-dedicated-ad-serving-domain.md)), and the preview's
  access control is the token in its URL. A credentialed reader gets exactly what `curl`
  gets. A route that did read a session or a cookie cannot use this helper — that is the
  line to hold.
- **`Origin: null` is no longer echoed with credentials** by the preview route, which it
  used to be. Per the spec — and every sandboxed frame shares that origin.
- Checked by fetching, not by reading: a credentialed XHR and `fetch` from another origin,
  a preflighted request with a custom header, the `null` and absent cases, and — after
  deploy — two origins in turn against one CDN entry.

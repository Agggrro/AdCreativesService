import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import nextConfig from "../../next.config.ts";
import { vastCorsHeaders, vastPreflightHeaders } from "./cors.ts";

/**
 * Run with `npm run test:cors`.
 *
 * Pins the VAST 4.2 CORS rule (ADR-0026). Nothing else would notice it
 * regressing: Google IMA fetches the tag without credentials, so a tag that
 * answers `*` passes every IMA-based check and fails only in players that fetch
 * with credentials — which is exactly how the rule this replaced shipped.
 */

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://smithcdn.net/v?creative_id=x", { headers });
}

test("no Origin gets `*`, no credentials, and still varies on Origin", () => {
  assert.deepEqual(vastCorsHeaders(request()), {
    "Access-Control-Allow-Origin": "*",
    Vary: "Origin",
  });
});

test("`Origin: null` is never echoed — the spec's carve-out answers `*`", () => {
  assert.deepEqual(vastCorsHeaders(request({ Origin: "null" })), {
    "Access-Control-Allow-Origin": "*",
    Vary: "Origin",
  });
});

test("a value that is not a serialized origin is treated as absent", () => {
  for (const origin of [
    "https://txxx.com/",
    "https://txxx.com/path",
    "https://a.example, https://b.example",
    "https://a.example,https://b.example",
    "txxx.com",
    "javascript:alert(1)",
    "https://txxx.com\u0001",
    "https://txxx.com\u007f",
  ]) {
    assert.deepEqual(
      vastCorsHeaders(request({ Origin: origin })),
      { "Access-Control-Allow-Origin": "*", Vary: "Origin" },
      origin,
    );
  }
});

test("a real origin is echoed with credentials — the header VAST 4.2 requires", () => {
  for (const origin of [
    "https://txxx.com",
    "http://localhost:3000",
    "https://[::1]:8443",
    "https://xn--80ak6aa92e.com",
    "capacitor://localhost",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
  ]) {
    assert.deepEqual(
      vastCorsHeaders(request({ Origin: origin })),
      {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      },
      origin,
    );
  }
});

test("the preflight echoes the requested headers, since `*` is literal with credentials", () => {
  assert.deepEqual(
    vastPreflightHeaders(
      request({
        Origin: "https://txxx.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-player-id, content-type",
      }),
    ),
    {
      "Access-Control-Allow-Origin": "https://txxx.com",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "x-player-id, content-type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin, Access-Control-Request-Headers",
    },
  );
});

test("a preflight that requests no headers is allowed none", () => {
  const headers = vastPreflightHeaders(request({ Origin: "https://txxx.com" }));
  assert.equal(headers["Access-Control-Allow-Headers"], undefined);
  assert.equal(headers["Access-Control-Allow-Credentials"], "true");
});

/**
 * The handler must be the only source of CORS on the tag. A static rule in
 * next.config.ts beside it does not merge: under `next dev` the config's value
 * wins over the handler's, so a leftover `*` would sit next to
 * `Access-Control-Allow-Credentials: true` — a pair browsers reject — while on
 * Vercel the handler won, so local and production disagreed.
 */
test("no next.config.ts header rule sets CORS on the tag", async () => {
  const require = createRequire(import.meta.url);
  const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as {
    getPathMatch: (path: string) => (pathname: string) => false | object;
  };
  const rules = (await nextConfig.headers?.()) ?? [];
  const corsRules = rules.filter((rule) =>
    rule.headers.some((header) => header.key.toLowerCase().startsWith("access-control-")),
  );

  // Not vacuous: the beacons and the assets still get their static `*`.
  assert.ok(corsRules.some((rule) => getPathMatch(rule.source)("/t")));
  assert.ok(corsRules.some((rule) => getPathMatch(rule.source)("/c/u/runtime/x.js")));

  for (const path of ["/v", "/v/", "/api/vast", "/api/vast/preview/token"]) {
    for (const rule of corsRules) {
      assert.equal(getPathMatch(rule.source)(path), false, `${rule.source} matches ${path}`);
    }
  }
});

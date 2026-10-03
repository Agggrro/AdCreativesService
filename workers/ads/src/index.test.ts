import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker, { type Env } from "./index.ts";
import { SNAPSHOT_SCHEMA_VERSION } from "../../../lib/serving/types.ts";

/**
 * Run with `npm run test:ads`.
 *
 * The ad Worker's own behaviour — routing, the tag cache, the last good copy,
 * the forwards and the headers it adds — run in Node against fakes of the
 * Workers APIs it touches (the Cache API, a KV binding, `ctx.waitUntil`, a
 * service binding) and of Supabase's REST endpoint. The handlers inside are the
 * shared ones the golden tests pin; this pins what the Worker wraps around them.
 */

const CID = "94000a35-1fcc-43f2-9ce8-d6781f98cd0d";
const OWNER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const TEMPLATE = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const SUPABASE = "https://supabase.test";

process.env.PREVIEW_TOKEN_SECRET = "test-preview-secret";
process.env.TRACK_TOKEN_SECRET = "test-track-secret";
process.env.NEXT_PUBLIC_CDN_URL = "https://smithcdn.net";
process.env.NEXT_PUBLIC_SITE_URL = "https://creosmith.com";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

/** The Cache API, in memory, with a switch to make it fail. */
class FakeCache {
  entries = new Map<string, { body: string; headers: [string, string][] }>();
  broken = false;
  async match(key: Request): Promise<Response | undefined> {
    if (this.broken) throw new Error("cache unavailable");
    const hit = this.entries.get(key.url);
    return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
  }
  async put(key: Request, value: Response): Promise<void> {
    if (this.broken) throw new Error("cache unavailable");
    this.entries.set(key.url, { body: await value.text(), headers: [...value.headers] });
  }
}

/** A KV binding, in memory, with a switch to make it fail. */
class FakeKv {
  data = new Map<string, string>();
  broken = false;
  async get(key: string): Promise<string | null> {
    if (this.broken) throw new Error("kv unavailable");
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

let cache: FakeCache;
let kv: FakeKv;
let pending: Promise<unknown>[];
let forwarded: Request[];
/** What the fake Supabase answers for the serving RPC: a row, nothing, or failure. */
let database: "row" | "empty" | "down";

const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };

function env(): Env {
  return {
    SNAPSHOTS: kv,
    CF_VERSION_METADATA: { id: "test-version" },
    NEXT_PUBLIC_MEDIA_URL: "https://media.smithcdn.net",
    WEB: {
      fetch: async (request: Request) => {
        forwarded.push(request);
        return new Response("<html>app</html>", {
          headers: { "Content-Type": "text/html", "Set-Cookie": "sb=1; Path=/" },
        });
      },
    },
  };
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await worker.fetch(new Request(`https://smithcdn.net${path}`, init), env(), ctx);
  await Promise.all(pending.splice(0));
  return response;
}

const creative = {
  schema_version: SNAPSHOT_SCHEMA_VERSION,
  creative_id: CID,
  user_id: OWNER,
  template_id: TEMPLATE,
  selected_format: "vpaid",
  config_json: { durationSeconds: 15 },
  creative_status: "active",
  template_type: "quiz",
  runtime_keys: { vpaid: "quiz/vpaid.js" },
  supported_standards: ["vpaid"],
  click_fields: [],
  published_at: "2026-10-03T12:00:00.000Z",
};

function publish(entitled = true): void {
  kv.data.set(`serving/creative/${CID}.json`, JSON.stringify(creative));
  kv.data.set(
    `serving/entitlement/${OWNER}.json`,
    JSON.stringify({
      schema_version: SNAPSHOT_SCHEMA_VERSION,
      user_id: OWNER,
      subscriptions: entitled
        ? [{ plan_type: "all_access", template_id: null, status: "active", current_period_end: null }]
        : [],
      published_at: "2026-10-03T12:00:00.000Z",
    }),
  );
}

const fetchMock = mock.method(globalThis, "fetch", async (input: Request | string) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith(`${SUPABASE}/rest/v1/rpc/get_creative_serving`)) {
    if (database === "down") return new Response("boom", { status: 500 });
    return new Response(database === "row" ? JSON.stringify([{ ...creative, is_entitled: true, should_serve: true }]) : "[]", {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.startsWith("https://media.smithcdn.net/runtime/")) {
    return new Response("/* unit */", {
      headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  throw new Error(`unexpected fetch ${url}`);
});

beforeEach(() => {
  cache = new FakeCache();
  kv = new FakeKv();
  pending = [];
  forwarded = [];
  database = "down";
  fetchMock.mock.resetCalls();
  (globalThis as unknown as { caches: unknown }).caches = { default: cache };
});

const ORIGIN = { Origin: "https://publisher.example" };

test("a miss builds the tag from KV, caches a fresh and a last-good copy, and answers with VAST 4.2 CORS", async () => {
  publish();
  const res = await call(`/v?creative_id=${CID}&cb=1`, { headers: ORIGIN });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://publisher.example");
  assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(res.headers.get("Vary"), "Origin");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=0");
  assert.equal(res.headers.get("Strict-Transport-Security"), "max-age=63072000");
  const body = await res.text();
  assert.match(body, /<MediaFile[^>]*apiFramework="VPAID"[^>]*><!\[CDATA\[https:\/\/media\.smithcdn\.net\/runtime\/quiz\/vpaid\.[0-9a-f]{8}\.js\]\]>/);
  // Nothing went to Postgres: the snapshots answered.
  assert.equal(fetchMock.mock.callCount(), 0);

  const stored = [...cache.entries.keys()].sort();
  assert.deepEqual(stored, [
    `https://smithcdn.net/__tag-last/test-version/${CID}`,
    `https://smithcdn.net/__tag/test-version/${CID}`,
  ]);
  const fresh = cache.entries.get(`https://smithcdn.net/__tag/test-version/${CID}`)!;
  assert.ok(fresh.headers.some(([k, v]) => k === "cache-control" && v === "public, max-age=60"));
  assert.ok(!fresh.headers.some(([k]) => k.startsWith("access-control")), "CORS must not be cached");
});

test("a hit ignores the cache-buster and echoes each requester's own origin", async () => {
  publish();
  const first = await (await call(`/v?creative_id=${CID}&cb=1`)).text();
  kv.broken = true; // a hit must not need the store at all
  const res = await call(`/v?creative_id=${CID}&cb=2`, { headers: { Origin: "https://other.example" } });
  assert.equal(await res.text(), first);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://other.example");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=0");
});

test("unreadable state with no copy is a 503 VAST that nothing stores", async () => {
  kv.broken = true;
  database = "down";
  const res = await call(`/v?creative_id=${CID}`, { headers: ORIGIN });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://publisher.example");
  assert.match(await res.text(), /<VAST version="4.2"><\/VAST>/);
  assert.equal(cache.entries.size, 0);
});

test("unreadable state with a last good copy serves it, and backs off for a few seconds", async () => {
  publish();
  const good = await (await call(`/v?creative_id=${CID}`)).text();
  cache.entries.delete(`https://smithcdn.net/__tag/test-version/${CID}`); // the fresh copy expired
  kv.broken = true;
  database = "down";

  const res = await call(`/v?creative_id=${CID}`, { headers: ORIGIN });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), good);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://publisher.example");
  const refilled = cache.entries.get(`https://smithcdn.net/__tag/test-version/${CID}`);
  assert.ok(refilled?.headers.some(([k, v]) => k === "cache-control" && v === "public, max-age=10"));
});

test("an entitlement that cannot be read goes to Postgres instead of serving an empty ad", async () => {
  publish();
  kv.data.set(`serving/entitlement/${OWNER}.json`, "{corrupt");
  database = "row";
  const res = await call(`/v?creative_id=${CID}`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<InLine>/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a missing entitlement is an unsubscribed user: an empty ad, cached", async () => {
  publish();
  kv.data.delete(`serving/entitlement/${OWNER}.json`);
  const res = await call(`/v?creative_id=${CID}`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="4.2"></VAST>');
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("a cache that cannot be read is a miss, not an error", async () => {
  publish();
  cache.broken = true;
  const res = await call(`/v?creative_id=${CID}`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<InLine>/);
});

test("a fault in the routing itself still answers the tag as VAST, with CORS", async () => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
  const res = await call(`/v?creative_id=${CID}`, { headers: ORIGIN });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://publisher.example");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.match(await res.text(), /<VAST version="4.2"><\/VAST>/);
});

test("a junk id is an empty tag, read from nothing and stored nowhere", async () => {
  const res = await call("/v?creative_id=not-a-uuid");
  assert.equal(res.status, 200);
  assert.equal(cache.entries.size, 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("method matrix: preflight, 405 with Allow, HEAD without a body, 308 off a trailing slash", async () => {
  const pre = await call("/v", {
    method: "OPTIONS",
    headers: { ...ORIGIN, "Access-Control-Request-Headers": "x-a" },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Headers"), "x-a");

  const post = await call("/v", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD, OPTIONS");

  publish();
  const head = await call(`/v?creative_id=${CID}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const slash = await call(`/v/?creative_id=${CID}`);
  assert.equal(slash.status, 308);
  assert.equal(slash.headers.get("Location"), `https://smithcdn.net/v?creative_id=${CID}`);

  const beacon = await call("/t", { method: "OPTIONS" });
  assert.equal(beacon.status, 204);
  assert.equal(beacon.headers.get("Access-Control-Allow-Origin"), "*");
});

test("/c/u forwards a runtime script only — never the SIMID document, never a media upload", async () => {
  const unit = await call("/c/u/runtime/quiz/vpaid.8eeec37b.js");
  assert.equal(unit.status, 200);
  assert.equal(unit.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(unit.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(fetchMock.mock.callCount(), 1);

  for (const path of [
    "/c/u/runtime/shoppable/simid/index.ede9a3a6.html",
    `/c/u/${OWNER}/${CID}.mp4`,
    "/c/u/runtime/quiz/vpaid.js",
  ]) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("the app's pages are forwarded on GET only, and never with a cookie", async () => {
  const page = await call("/c/player");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Set-Cookie"), null);
  assert.equal(page.headers.get("Strict-Transport-Security"), "max-age=63072000");
  assert.equal(forwarded.length, 1);

  const action = await call("/", { method: "POST", headers: { "Next-Action": "x" } });
  assert.equal(action.status, 405);
  assert.equal(forwarded.length, 1);

  for (const path of ["/dashboard", "/api/vast", "/login", "/pb"]) {
    assert.equal((await call(path)).status, 404, path);
  }
  assert.equal(forwarded.length, 1);
});

test("nothing reaches the zone's origin — there is none — and ACME paths are a 404", async () => {
  assert.equal((await call("/.well-known/acme-challenge/token-1")).status, 404);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(forwarded.length, 0);
});

test("a forged beacon is a 204 that writes nothing", async () => {
  const res = await call(`/t?cid=${CID}&e=impression&exp=9999999999&sig=AAAA`);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(fetchMock.mock.callCount(), 0);
});

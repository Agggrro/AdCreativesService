import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { kvSnapshotStore } from "./store-kv.ts";
import { bindingNamespace, restNamespace, type SnapshotNamespace } from "./kv.ts";
import { SnapshotReadError } from "./store.ts";
import { SNAPSHOT_SCHEMA_VERSION, type CreativeSnapshot, type EntitlementSnapshot } from "./types.ts";

/**
 * Run with `npm run test:snapshots`.
 *
 * Pins the snapshot store's contract on Workers KV (ADR-0029), and in particular
 * the one distinction the serving path now depends on: a document that does not
 * exist is `null`, while a read that could not be answered throws. Collapsing
 * the two again would bring back the empty ad a failed entitlement read used to
 * serve and cache for a minute.
 */

const CREATIVE_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const CREATIVE: CreativeSnapshot = {
  schema_version: SNAPSHOT_SCHEMA_VERSION,
  creative_id: CREATIVE_ID,
  user_id: USER_ID,
  template_id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  selected_format: "vpaid",
  config_json: { videoUrl: "https://media.smithcdn.net/u/clip.mp4" },
  creative_status: "active",
  template_type: "quiz",
  runtime_keys: { vpaid: "quiz/vpaid.js" },
  supported_standards: ["vpaid"],
  click_fields: [],
  published_at: "2026-10-03T12:00:00.000Z",
};

const ENTITLEMENT: EntitlementSnapshot = {
  schema_version: SNAPSHOT_SCHEMA_VERSION,
  user_id: USER_ID,
  subscriptions: [
    { plan_type: "all_access", template_id: null, status: "active", current_period_end: null },
  ],
  published_at: "2026-10-03T12:00:00.000Z",
};

/** An in-memory namespace that can be told to fail. */
function memory(): SnapshotNamespace & { data: Map<string, string>; broken: boolean } {
  const data = new Map<string, string>();
  const ns = {
    data,
    broken: false,
    async get(key: string) {
      if (ns.broken) throw new Error("namespace unavailable");
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      if (ns.broken) throw new Error("namespace unavailable");
      data.set(key, value);
    },
    async delete(key: string) {
      if (ns.broken) throw new Error("namespace unavailable");
      data.delete(key);
    },
  };
  return ns;
}

test("a published snapshot reads back under the keys ADR-0015 already used", async () => {
  const ns = memory();
  const store = kvSnapshotStore(() => ns);
  await store.putCreative(CREATIVE);
  await store.putEntitlement(ENTITLEMENT);
  assert.deepEqual([...ns.data.keys()].sort(), [
    `serving/creative/${CREATIVE_ID}.json`,
    `serving/entitlement/${USER_ID}.json`,
  ]);
  assert.deepEqual(await store.getCreative(CREATIVE_ID), CREATIVE);
  assert.deepEqual(await store.getEntitlement(USER_ID), ENTITLEMENT);

  await store.deleteCreative(CREATIVE_ID);
  await store.deleteCreative(CREATIVE_ID); // idempotent
  assert.equal(await store.getCreative(CREATIVE_ID), null);
});

test("no document is null; an unanswerable read throws", async () => {
  const ns = memory();
  const store = kvSnapshotStore(() => ns);
  assert.equal(await store.getEntitlement(USER_ID), null);

  ns.broken = true;
  await assert.rejects(store.getEntitlement(USER_ID), SnapshotReadError);
  await assert.rejects(store.getCreative(CREATIVE_ID), SnapshotReadError);
});

test("an unreadable or foreign-version document is a failure, never a miss", async () => {
  const ns = memory();
  const store = kvSnapshotStore(() => ns);
  ns.data.set(`serving/entitlement/${USER_ID}.json`, "{not json");
  await assert.rejects(store.getEntitlement(USER_ID), SnapshotReadError);

  ns.data.set(
    `serving/entitlement/${USER_ID}.json`,
    JSON.stringify({ ...ENTITLEMENT, schema_version: SNAPSHOT_SCHEMA_VERSION + 1 }),
  );
  await assert.rejects(store.getEntitlement(USER_ID), SnapshotReadError);
});

test("a junk id is a miss without a read, and a junk key is never written", async () => {
  const ns = memory();
  const get = mock.method(ns, "get");
  const store = kvSnapshotStore(() => ns);
  assert.equal(await store.getCreative("../../etc"), null);
  assert.equal(await store.getEntitlement("*"), null);
  assert.equal(get.mock.callCount(), 0);
  await assert.rejects(store.putCreative({ ...CREATIVE, creative_id: "../x" }));
  assert.equal(ns.data.size, 0);
});

test("writes fail hard", async () => {
  const ns = memory();
  ns.broken = true;
  const store = kvSnapshotStore(() => ns);
  await assert.rejects(store.putCreative(CREATIVE));
  await assert.rejects(store.deleteEntitlement(USER_ID));
});

test("the binding reads with the cache window it is given", async () => {
  const calls: unknown[][] = [];
  const binding = {
    get: async (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
    put: async () => {},
    delete: async () => {},
  };
  await bindingNamespace(binding, 60).get("serving/creative/x.json");
  assert.deepEqual(calls, [["serving/creative/x.json", { type: "text", cacheTtl: 60 }]]);
});

test("REST: one percent-encoded key per call, the token in a header, 404 as a miss", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const responses = [
    new Response("not found", { status: 404 }),
    new Response(JSON.stringify(CREATIVE), { status: 200 }),
    new Response("{}", { status: 200 }),
    new Response("{}", { status: 404 }),
    new Response("boom", { status: 500 }),
  ];
  const ns = restNamespace({
    accountId: "acct",
    namespaceId: "ns",
    apiToken: "test-token",
    fetch: (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return responses.shift()!;
    }) as typeof fetch,
  });
  const key = `serving/creative/${CREATIVE_ID}.json`;
  const url =
    "https://api.cloudflare.com/client/v4/accounts/acct/storage/kv/namespaces/ns/values/" +
    `serving%2Fcreative%2F${CREATIVE_ID}.json`;

  assert.equal(await ns.get(key), null);
  assert.equal(await ns.get(key), JSON.stringify(CREATIVE));
  await ns.put(key, "v");
  await ns.delete(key); // a 404 on delete is the outcome a delete wants
  await assert.rejects(ns.get(key), /500/);

  assert.ok(seen.every((s) => s.url === url));
  assert.ok(
    seen.every(
      (s) => (s.init.headers as Record<string, string>).Authorization === "Bearer test-token",
    ),
  );
  assert.deepEqual(
    seen.map((s) => s.init.method ?? "GET"),
    ["GET", "GET", "PUT", "DELETE", "GET"],
  );
  assert.equal(seen[2].init.body, "v");
});

test("a put that fails clears that store's previous document — fail closed", async () => {
  const ns = memory();
  const store = kvSnapshotStore(() => ns);
  await store.putEntitlement(ENTITLEMENT);

  // The write is refused, the clear is not: the stale subscription must not stay.
  const put = mock.method(ns, "put", async () => {
    throw new Error("429 too many writes");
  });
  try {
    await assert.rejects(store.putEntitlement({ ...ENTITLEMENT, subscriptions: [] }), /429/);
    assert.equal(ns.data.has(`serving/entitlement/${USER_ID}.json`), false);
  } finally {
    put.mock.restore();
  }
});

test("a binding write is tried once more, a second later — KV's one write per key per second", async () => {
  let calls = 0;
  const flaky = {
    get: async () => null,
    put: async () => {
      calls += 1;
      if (calls === 1) throw new Error("429");
    },
    delete: async () => {},
  };
  const started = Date.now();
  await bindingNamespace(flaky, 60).put("k", "v");
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 1000, "the retry waits out the per-key limit");

  calls = 0;
  const broken = { ...flaky, put: async () => { calls += 1; throw new Error("down"); } };
  await assert.rejects(bindingNamespace(broken, 60).put("k", "v"), /down/);
  assert.equal(calls, 2);
});

test("a write refused for KV's per-key rate limit is retried with jitter, more than once", async () => {
  let calls = 0;
  const limited = {
    get: async () => null,
    put: async () => {
      calls += 1;
      if (calls < 3) throw new Error("KV PUT failed: 429 Too Many Requests");
    },
    delete: async () => {},
  };
  await bindingNamespace(limited, 60).put("k", "v");
  assert.equal(calls, 3, "two refusals for the rate limit, then success");
});

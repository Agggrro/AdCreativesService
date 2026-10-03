import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  RUNTIME_KEY_RE,
  deleteObjects,
  presignUpload,
  putRuntimeObject,
  r2,
  type R2,
} from "./r2.ts";

/**
 * Run with `npm run test:media`.
 *
 * Pins the presigned upload and the delete guard (ADR-0028) without touching
 * the network. The signature over type and size is the only thing that stops a
 * browser from putting a different file where we said it could put this one,
 * so these tests compare signatures, not just header names: a signer that
 * ignored the declared values would still list the same headers.
 */

const ENV = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_BUCKET: "creative-media",
  NEXT_PUBLIC_MEDIA_URL: "https://media.smithcdn.net",
};
const ME = "7c246c1c-4555-4787-b8f8-a21a39dd2711";
const YOU = "0f8f6045-0411-4fdb-8b94-90e727d4ccea";
const KEY = `${ME}/b5401216-38cd-48db-b634-5eeb9c9af52d.mp4`;

/** Run `fn` with `env` set, then put back exactly the keys it touched. */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const apply = (values: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(env);
  try {
    return fn();
  } finally {
    apply(saved);
  }
}

function connect(): R2 {
  const store = withEnv(ENV, r2);
  assert.ok(store);
  return store;
}

/** Sign at a frozen instant, so two signatures differ only by what was declared. */
async function signedAt(key: string, type: string, size: number): Promise<URL> {
  mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 2, 12, 0, 0) });
  try {
    return new URL(await presignUpload(connect(), key, type, size));
  } finally {
    mock.timers.reset();
  }
}

test("a presigned upload is a five-minute PUT for this object, signing type, size and host", async () => {
  const url = await signedAt(KEY, "video/mp4", 3891652);
  assert.equal(url.host, `${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(url.pathname, `/${ENV.R2_BUCKET}/${KEY}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
  assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
});

test("the signature covers the declared size and type, not just their names", async () => {
  const sig = async (type: string, size: number) =>
    (await signedAt(KEY, type, size)).searchParams.get("X-Amz-Signature");
  const base = await sig("video/mp4", 1000);
  assert.equal(await sig("video/mp4", 1000), base, "same declaration, same signature");
  assert.notEqual(await sig("video/mp4", 1001), base, "another size must not share it");
  assert.notEqual(
    await signedAt(KEY.replace(".mp4", ".mov"), "video/quicktime", 1000).then((u) =>
      u.searchParams.get("X-Amz-Signature"),
    ),
    base,
    "another type must not share it",
  );
});

test("a key we did not mint is never signed", async () => {
  const store = connect();
  for (const key of [
    `${ME}/../${YOU}/b5401216-38cd-48db-b634-5eeb9c9af52d.mp4`,
    "anything.mp4",
    `${KEY}?x-id=PutObject`,
  ]) {
    await assert.rejects(
      presignUpload(store, key, "video/mp4", 1),
      /not a media key|type does not match/,
      key,
    );
  }
});

test("only an allowed type matching the key's extension, within the cap, is signed", async () => {
  const store = connect();
  await assert.rejects(presignUpload(store, KEY, "image/svg+xml", 10), /type does not match/);
  await assert.rejects(presignUpload(store, KEY, "image/png", 10), /type does not match/);
  await assert.rejects(presignUpload(store, KEY, "toString", 10), /type does not match/);
  for (const size of [0, -1, 1.5, Number.NaN, 25 * 1024 * 1024 + 1]) {
    await assert.rejects(presignUpload(store, KEY, "video/mp4", size), /size out of range/, String(size));
  }
});

test("another owner's keys are refused without a request", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("no request may be sent for a foreign key");
  });
  try {
    const foreign = `${YOU}/b5401216-38cd-48db-b634-5eeb9c9af52d.mp4`;
    assert.deepEqual(await deleteObjects(connect(), ME, [foreign]), [foreign]);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
  }
});

test("any missing variable leaves R2 off", () => {
  for (const name of Object.keys(ENV)) {
    assert.equal(withEnv({ ...ENV, [name]: undefined }, r2), null, name);
  }
});

test("runtime keys are content-addressed paths under runtime/, and nothing else", () => {
  for (const key of [
    "runtime/quiz/vpaid.8eeec37b.js",
    "runtime/age-gate/vpaid.29339a78.js",
    "runtime/shoppable/vpaid/unit.12345678.js",
    "runtime/shoppable/simid/index.ede9a3a6.html",
  ]) {
    assert.ok(RUNTIME_KEY_RE.test(key), key);
  }
  for (const key of [
    KEY,
    "runtime/quiz/vpaid.js",
    "runtime/quiz/vpaid.8EEEC37B.js",
    "runtime/quiz/vpaid.8eeec37b.mp4",
    "runtime/../quiz/vpaid.8eeec37b.js",
    "runtime//vpaid.8eeec37b.js",
    "/runtime/quiz/vpaid.8eeec37b.js",
    "media/runtime/quiz/vpaid.8eeec37b.js",
  ]) {
    assert.ok(!RUNTIME_KEY_RE.test(key), key);
  }
});

test("a runtime write is refused for a media key, and sent immutable for a runtime one", async () => {
  const sent: Request[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (input: Request) => {
    sent.push(input);
    return new Response(null, { status: 200 });
  });
  try {
    const body = new Uint8Array([1, 2, 3]);
    await assert.rejects(putRuntimeObject(connect(), KEY, body, "video/mp4"), /not a runtime key/);
    assert.equal(sent.length, 0);

    await putRuntimeObject(connect(), "runtime/quiz/vpaid.8eeec37b.js", body, "application/javascript");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, "PUT");
    assert.equal(
      sent[0].url,
      `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/creative-media/runtime/quiz/vpaid.8eeec37b.js`,
    );
    assert.equal(sent[0].headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(sent[0].headers.get("content-type"), "application/javascript");
  } finally {
    fetchMock.mock.restore();
  }
});

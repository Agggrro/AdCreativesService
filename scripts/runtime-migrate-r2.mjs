/**
 * Move the creative runtime from the public Vercel Blob store to R2 and point
 * `runtime/manifest.ts` at the media host (ADR-0029). One-off and idempotent.
 *
 *   npm run runtime:migrate
 *
 * Copies the **published** bytes, not a fresh build: the working copy may hold
 * template edits that were never pushed, and a move is not the moment to ship
 * them. Every object under `runtime/` is copied — superseded hashes too, because
 * a tag cached at the edge may still name one — and each is checked against the
 * hash in its own name before it is written.
 *
 * Writes the manifest only when every recorded asset is in R2 and reads back,
 * through the public media host, with exactly the sha256 the manifest records.
 * A failed run leaves the manifest untouched and can simply be run again.
 *
 * Needs RUNTIME_BLOB_READ_WRITE_TOKEN (to list the old store) and the R2
 * variables. Nothing here logs them.
 */
import { createHash } from "node:crypto";
import { list } from "@vercel/blob";
import { r2, putRuntimeObject, runtimeObjectSize, RUNTIME_KEY_RE } from "@/lib/r2";
import { contentTypeFor, readManifestAssets, writeManifest } from "./runtime-manifest-file.mjs";

const store = r2();
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_URL ?? "").trim().replace(/\/+$/, "");
const blobToken = process.env.RUNTIME_BLOB_READ_WRITE_TOKEN;
if (!store || !mediaHost || !blobToken) {
  console.error(
    "Needs RUNTIME_BLOB_READ_WRITE_TOKEN and the R2 variables (R2_*, NEXT_PUBLIC_MEDIA_URL).",
  );
  process.exit(1);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The 8-hex content hash a runtime key carries before its extension. */
function hashInKey(key) {
  return /\.([0-9a-f]{8})\.[a-z]+$/.exec(key)?.[1] ?? null;
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GET ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// 1. Every object the old store holds under runtime/.
const blobs = [];
let cursor;
do {
  const page = await list({ prefix: "runtime/", cursor, token: blobToken, limit: 1000 });
  blobs.push(...page.blobs);
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`old store: ${blobs.length} runtime object(s)`);

// 2. Copy, each verified against the hash in its own name.
let failed = 0;
for (const blob of blobs) {
  const key = blob.pathname;
  if (!RUNTIME_KEY_RE.test(key)) {
    console.warn(`  skip ${key}: not a content-addressed runtime key`);
    continue;
  }
  try {
    const bytes = await download(blob.url);
    if (sha256(bytes).slice(0, 8) !== hashInKey(key)) {
      throw new Error("bytes do not match the hash in the key");
    }
    const existing = await runtimeObjectSize(store, key);
    if (existing === bytes.length) {
      console.log(`  ok   ${key} (already there)`);
      continue;
    }
    await putRuntimeObject(store, key, bytes, contentTypeFor(key));
    console.log(`  copy ${key} ${bytes.length} bytes`);
  } catch (err) {
    console.error(`  FAILED ${key}: ${err.message}`);
    failed++;
  }
}
if (failed) {
  console.error(`\n${failed} object(s) failed — manifest not rewritten. Run again.`);
  process.exit(1);
}

// 3. Every manifest entry, read back through the public host, byte for byte.
const assets = await readManifestAssets();
const next = {};
for (const [logicalKey, asset] of Object.entries(assets)) {
  const key = new URL(asset.url).pathname.replace(/^\/+/, "");
  const url = `${mediaHost}/${key}`;
  try {
    if (!RUNTIME_KEY_RE.test(key)) throw new Error(`unexpected key ${key}`);
    const served = await download(url);
    if (sha256(served) !== asset.sha256) throw new Error("served bytes differ from the manifest");
    next[logicalKey] = { url, sha256: asset.sha256 };
    console.log(`  verified ${logicalKey} -> ${url}`);
  } catch (err) {
    console.error(`  FAILED ${logicalKey}: ${err.message}`);
    failed++;
  }
}
if (failed) {
  console.error(`\n${failed} asset(s) did not verify — manifest not rewritten.`);
  process.exit(1);
}

writeManifest(next);
console.log(
  `\nmanifest now points at ${mediaHost}. Commit runtime/manifest.ts; the next deploy` +
    `\nserves units from R2.`,
);

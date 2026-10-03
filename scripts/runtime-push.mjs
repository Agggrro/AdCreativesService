/**
 * Upload the built runtime units to R2 and write `runtime/manifest.ts`.
 *
 *   npm run runtime:push          # every unit
 *   npm run runtime:push quiz     # only keys starting with "quiz"
 *
 * Objects are **content-addressed**: `runtime/<key>.<sha256[0..8]>.<ext>`, in the
 * `creative-media` bucket, served from the media host — `media.smithcdn.net`
 * (ADR-0017, ADR-0029). A hashed URL never changes for the same bytes, so it
 * caches for a year and the player fetches it straight from Cloudflare's cache
 * with nothing of ours waking up. The previous scheme put a 120s signed token in
 * the URL, so the URL changed every minute and every change was a cache miss
 * plus a function invocation on the ad path (ADR-0015).
 *
 * Two consequences worth stating plainly:
 *   - The unit JS becomes permanently fetchable by anyone holding the URL. That
 *     costs nothing: the advertiser's config travels in the VAST `<AdParameters>`,
 *     not in this file, so a cancelled subscription still yields an empty VAST and
 *     the saved URL only serves an anonymous template. ADR-0003 already concedes
 *     the code is inspectable.
 *   - Superseded hashes are not deleted. They are small and immutable; pruning
 *     them would risk breaking a VAST document still cached at the edge.
 *
 * SIMID's `index.html` ships here too but is still served through `/c/s/:token`
 * (lib/serving/http/interactive.ts), with the headers that let a player's iframe
 * run it.
 *
 * Needs the R2 variables (`R2_*`, `NEXT_PUBLIC_MEDIA_URL`) — the same
 * least-privilege token that writes advertiser media. Nothing here logs them.
 * Runs through the app-imports hook so it uses lib/r2.ts's own key guard.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { r2, putRuntimeObject, runtimeObjectSize } from "@/lib/r2";
import {
  contentTypeFor,
  hashedObjectKey,
  readManifestAssets,
  writeManifest,
} from "./runtime-manifest-file.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const store = r2();
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_URL ?? "").trim().replace(/\/+$/, "");
if (!store || !mediaHost) {
  console.error(
    "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,\n" +
      "R2_BUCKET and NEXT_PUBLIC_MEDIA_URL in .env.local (see .env.example).",
  );
  process.exit(1);
}

/** Every file under runtime/dist, keyed by its path relative to dist/. */
function distFiles(dir = join(root, "runtime", "dist"), out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) distFiles(p, out);
    else out.push(p);
  }
  return out;
}

const distRoot = join(root, "runtime", "dist");
const uploads = distFiles().map((path) => ({
  path,
  key: relative(distRoot, path).split("\\").join("/"),
}));

// The one unit build.mjs does not produce: SIMID is a static document, not a
// concatenated VPAID unit, so it ships straight from source.
const simid = join(root, "runtime", "shoppable", "simid", "index.html");
if (existsSync(simid)) {
  uploads.push({ path: simid, key: "shoppable/simid/index.html" });
}

if (uploads.length === 0) {
  console.error("nothing to upload — run `npm run build:runtime` first");
  process.exit(1);
}

const filter = process.argv[2];
const selected = filter ? uploads.filter((u) => u.key.startsWith(filter)) : uploads;
if (selected.length === 0) {
  console.error(`no runtime key starts with "${filter}". Available:`);
  for (const u of uploads) console.error(`  ${u.key}`);
  process.exit(1);
}

// A partial push must not produce a partial manifest: start from what is already
// recorded so `npm run runtime:push quiz` updates one entry and leaves the rest.
let assets = {};
try {
  assets = await readManifestAssets();
} catch (err) {
  console.error(`could not read the existing manifest (${err.message}) — rewriting it`);
}

let failed = 0;
for (const { path, key: logicalKey } of selected) {
  const body = new Uint8Array(readFileSync(path));
  const sha256 = createHash("sha256").update(body).digest("hex");
  const objectKey = hashedObjectKey(logicalKey, sha256);

  const url = `${mediaHost}/${objectKey}`;
  try {
    if ((await runtimeObjectSize(store, objectKey)) === null) {
      await putRuntimeObject(store, objectKey, body, contentTypeFor(objectKey));
    } else {
      // Already there — re-pushing unchanged units costs nothing. But "there"
      // is checked by what players are actually served, byte for byte, not by
      // size: `runtime/` is locked against overwrites (ADR-0029), so an object
      // that differs from its own name's hash can never be repaired by a push,
      // and must stop it.
      const served = new Uint8Array(await (await fetch(url)).arrayBuffer());
      if (createHash("sha256").update(served).digest("hex") !== sha256) {
        throw new Error(
          `${url} is served with bytes that do not match its hash — investigate before ` +
            "trusting any unit; the runtime prefix is locked, so a push cannot overwrite it",
        );
      }
    }
    assets[logicalKey] = { url, sha256 };
    console.log(`  ${logicalKey.padEnd(32)} ${String(body.length).padStart(7)} bytes  ${sha256.slice(0, 8)}`);
  } catch (err) {
    console.error(`  FAILED ${logicalKey}: ${err.message}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} upload(s) failed — manifest not written`);
  process.exit(1);
}

writeManifest(assets);

console.log(`\n${selected.length} object(s) pushed`);
console.log(`manifest written to runtime/manifest.ts — COMMIT IT before deploying,`);
console.log(`the app and the ad Worker read it at build time to resolve unit URLs.`);

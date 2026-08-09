/**
 * Upload the built runtime units to the private `creatives` Storage bucket,
 * which is what /api/vast actually serves (via short-TTL signed URLs — ADR-0003).
 *
 *   npm run runtime:push          # every unit
 *   npm run runtime:push quiz     # only keys starting with "quiz"
 *
 * Bucket keys are derived from the layout `runtime/build.mjs` writes, so they
 * match each template's `templates.runtime_keys` by construction rather than by
 * a hand-maintained list that can drift (see runtime/README.md).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS — server-only, never in a
 * client bundle. Nothing here logs it.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "creatives";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Run via: node --env-file=.env.local scripts/runtime-push.mjs",
  );
  process.exit(1);
}

const CONTENT_TYPE = {
  ".js": "application/javascript",
  ".html": "text/html",
};

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

const supabase = createClient(url, key, { auth: { persistSession: false } });

let failed = 0;
for (const { path, key: objectKey } of selected) {
  const body = readFileSync(path);
  const ext = objectKey.slice(objectKey.lastIndexOf("."));
  const { error } = await supabase.storage.from(BUCKET).upload(objectKey, body, {
    contentType: CONTENT_TYPE[ext] ?? "application/octet-stream",
    upsert: true,
  });
  if (error) {
    console.error(`  FAILED ${objectKey}: ${error.message}`);
    failed++;
    continue;
  }
  console.log(`  ${objectKey.padEnd(32)} ${String(body.length).padStart(7)} bytes`);
}

if (failed) {
  console.error(`\n${failed} upload(s) failed`);
  process.exit(1);
}
console.log(`\n${selected.length} object(s) pushed to ${BUCKET}/`);

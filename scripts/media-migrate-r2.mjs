/**
 * Move advertiser media from the Supabase Storage bucket to R2 (ADR-0028).
 *
 *   npm run media:migrate              # dry run: lists what would move, writes nothing
 *   npm run media:migrate -- --apply   # copy, rewrite configs, republish snapshots
 *
 * Per creative, in three stages, each named when it fails:
 *
 *   1. copy    — each of the owner's own Supabase media objects is copied to R2
 *                under the same key (skipped when R2 already holds as many
 *                bytes, so a re-run downloads nothing it has already moved),
 *                then fetched back through the media host: a config is never
 *                pointed at a URL that does not answer.
 *   2. rewrite — the config's URLs are swapped, guarded by `updated_at`, so a
 *                creative edited while this runs is left alone and reported.
 *   3. publish — the snapshot is republished, which is what moves the live tag.
 *
 * A failure in 1 or 2 leaves the creative as it was, and a re-run picks it up.
 * A failure in 3 cannot be picked up that way — the config already points at
 * R2, so a re-run finds nothing to move — so the snapshot is cleared, as the
 * app's own writers do (the tag then serves the new config from Postgres), and
 * the script names the repair, `npm run snapshot:backfill <id>`.
 *
 * The Supabase objects are not deleted. They are the rollback, and they keep
 * answering for any VAST still cached at an edge. **Run this again right
 * before removing them**: an edit form opened before the move and saved after
 * it writes the old URL back, and only a fresh run shows it.
 *
 * Reuses the app's own modules via the resolution hooks in
 * scripts/app-imports-hook.mjs. Needs SUPABASE_SERVICE_ROLE_KEY, the R2
 * variables, NEXT_PUBLIC_MEDIA_URL and — to republish — the SNAPSHOT_KV_* variables.
 * None of them is logged.
 */
import { createServiceClient } from "@/lib/supabase/service";
import {
  CREATIVE_MEDIA_BUCKET,
  MEDIA_MAX_BYTES,
  isAllowedMediaMime,
  ownMediaRefs,
  r2MediaUrl,
} from "@/lib/creative-media";
import { objectSize, putObject, r2 } from "@/lib/r2";
import { publishCreativeSnapshot, unpublishCreativeSnapshot } from "@/lib/serving/publish";

const apply = process.argv.includes("--apply");

const store = r2();
if (!store) {
  console.error(
    "R2 is not configured: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,\n" +
      "R2_BUCKET and NEXT_PUBLIC_MEDIA_URL must all be set. Run via: npm run media:migrate",
  );
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (apply && !process.env.SNAPSHOT_KV_API_TOKEN) {
  console.error(
    "The SNAPSHOT_KV_* variables must be set to republish snapshots — KV is what\n" +
      "the ad domain serves from (ADR-0029).",
  );
  process.exit(1);
}

const supabase = createServiceClient();
const PAGE = 1000;

/** Every creative, a page at a time — the API caps a single read. Ordered, so paging is stable. */
async function readCreatives() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("creatives")
      .select("id, user_id, name, config_json, updated_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`creatives read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Every string anywhere in a config. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** A copy of `value` with every string found in `replacements` swapped. */
function rewrite(value, replacements) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => rewrite(v, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, replacements)]));
  }
  return value;
}

/** How many bytes a URL serves, from `content-length` or, failing that, a one-byte range. */
async function servedSize(url) {
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) throw new Error(`${url} answered ${head.status}`);
  const length = head.headers.get("content-length");
  if (length !== null) return Number(length);
  const probe = await fetch(url, { headers: { range: "bytes=0-0" } });
  await probe.body?.cancel();
  const total = probe.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  if (!total) throw new Error(`${url} does not say its size`);
  return Number(total);
}

/** key → bytes, for objects already checked this run: a key can sit in several configs. */
const inR2 = new Map();

/** Make sure R2 holds `key` with the source's bytes. Returns [status, size]. */
async function copyToR2(key, sourceUrl) {
  if (inR2.has(key)) return ["present", inR2.get(key)];

  const head = await fetch(sourceUrl, { method: "HEAD" });
  if (!head.ok) throw new Error(`source answered ${head.status}`);
  const type = (head.headers.get("content-type") ?? "").split(";")[0].trim();
  const size = Number(head.headers.get("content-length") ?? NaN);
  if (!isAllowedMediaMime(type)) throw new Error(`source type "${type}" is not an allowed media type`);
  if (!(size > 0 && size <= MEDIA_MAX_BYTES)) throw new Error(`source is ${size} bytes`);

  let status = "present";
  if ((await objectSize(store, key)) !== size) {
    const source = await fetch(sourceUrl);
    if (!source.ok) throw new Error(`source answered ${source.status}`);
    const body = new Uint8Array(await source.arrayBuffer());
    if (body.byteLength !== size) throw new Error(`source sent ${body.byteLength} bytes, announced ${size}`);
    await putObject(store, key, body, type);
    if ((await objectSize(store, key)) !== size) throw new Error("R2 holds a different size after the copy");
    status = "copied";
  }
  inR2.set(key, size);
  return [status, size];
}

const STORAGE_MARK = `/storage/v1/object/public/${CREATIVE_MEDIA_BUCKET}/`;

let rows;
try {
  rows = await readCreatives();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

let toMove = 0;
let moved = 0;
let skipped = 0;
let failed = 0;
const needsBackfill = [];

for (const row of rows) {
  const refs = ownMediaRefs(row.config_json, row.user_id).filter((ref) => ref.store === "supabase");
  // Storage media URLs that will not move: another owner's prefix, or not a key
  // we mint. Reported so a dry run shows everything still pointing at Supabase.
  const ours = new Set(refs.map((ref) => ref.url));
  const stray = [...new Set(strings(row.config_json))].filter(
    (s) => s.includes(STORAGE_MARK) && !ours.has(s),
  );
  if (refs.length === 0 && stray.length === 0) continue;

  console.log(`${row.id}  ${row.name ?? "(unnamed)"} — ${refs.length} file(s) to move`);
  for (const url of stray) console.log(`  left in place (not this owner's, or not a key we mint): ${url}`);
  if (refs.length === 0) continue;
  toMove += refs.length;

  if (!apply) {
    for (const ref of refs) console.log(`  would move ${ref.key}`);
    continue;
  }

  let stage = "copy";
  try {
    const replacements = new Map();
    for (const ref of refs) {
      const [status, size] = await copyToR2(ref.key, ref.url);
      const publicUrl = r2MediaUrl(ref.key);
      const served = await servedSize(publicUrl);
      if (served !== size) throw new Error(`${publicUrl} serves ${served} bytes, R2 holds ${size}`);
      replacements.set(ref.url, publicUrl);
      console.log(`  ${status.padEnd(7)} ${ref.key}`);
    }

    stage = "rewrite";
    const { data: updated, error: updateError } = await supabase
      .from("creatives")
      .update({ config_json: rewrite(row.config_json, replacements) })
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    if (!updated || updated.length === 0) {
      console.log("  skipped: edited while this ran — run again");
      skipped++;
      continue;
    }

    stage = "publish";
    await publishCreativeSnapshot(row.id, supabase);
    console.log("  config rewritten, snapshot republished");
    moved++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failed++;
    if (stage !== "publish") {
      console.error(`  FAILED at ${stage}: ${message} — config left as it was`);
      continue;
    }
    // The config already points at R2. Clear the stale snapshot so the tag
    // serves the new config from Postgres, as publishOrClear() does for the app.
    needsBackfill.push(row.id);
    let cleared = true;
    try {
      await unpublishCreativeSnapshot(row.id);
    } catch {
      cleared = false;
    }
    console.error(
      `  FAILED at publish: ${message} — the config already points at R2; ` +
        (cleared
          ? "the snapshot was cleared, so the tag serves it from Postgres until it is republished"
          : "the snapshot could NOT be cleared and still serves the Supabase URLs"),
    );
  }
}

if (!apply) {
  console.log(`\nDry run: ${toMove} file(s) to move, nothing written. Re-run with --apply to move.`);
} else {
  console.log(`\n${moved} creative(s) moved, ${skipped} skipped, ${failed} failed.`);
  for (const id of needsBackfill) console.log(`Republish: npm run snapshot:backfill ${id}`);
  if (skipped > 0 || failed > 0) process.exit(1);
}

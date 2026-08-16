/**
 * Rebuild the CDN serving snapshots from Postgres (ADR-0015).
 *
 *   npm run snapshot:backfill                 # everything
 *   npm run snapshot:backfill creatives       # only creative/<id>
 *   npm run snapshot:backfill entitlements    # only entitlement/<user_id>
 *   npm run snapshot:backfill <uuid>          # one creative, and its owner
 *
 * Idempotent: it republishes from the database every time, so re-running it is
 * always safe and is the repair procedure whenever snapshots and rows disagree.
 *
 * Run it in three situations:
 *
 *   1. Once, when adopting snapshots on an existing database.
 *   2. **After `npm run db:seed`.** The seed rewrites `templates`, and a
 *      creative snapshot carries `template_type`, `runtime_keys` and
 *      `supported_standards` copied from it — so a seed that changes a runtime
 *      key leaves every snapshot for that template pointing at the old asset,
 *      which fails closed to an empty ad. See runtime/README.md.
 *   3. To repair a publish that a writer logged as failed.
 *
 * Reuses the app's own publish functions rather than reimplementing them, via
 * the resolution hooks in scripts/app-imports-hook.mjs.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (bypasses RLS to see every row) and, because
 * this runs outside Vercel, BLOB_READ_WRITE_TOKEN. Neither is logged.
 */
import { createServiceClient } from "@/lib/supabase/service";
import {
  publishCreativeSnapshot,
  publishEntitlementSnapshot,
} from "@/lib/serving/publish";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Run via: npm run snapshot:backfill",
  );
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN is not set.\n" +
      "On Vercel the Blob SDK uses OIDC, but this script runs locally and needs the\n" +
      "static token: Vercel dashboard -> Storage -> your Blob store -> .env.local tab.",
  );
  process.exit(1);
}

const arg = process.argv[2];
const onlyCreativeId = arg && UUID_RE.test(arg) ? arg : null;
const scope = onlyCreativeId ? "one" : (arg ?? "all");
if (!["all", "creatives", "entitlements", "one"].includes(scope)) {
  console.error(
    `unknown argument "${arg}". Use: creatives | entitlements | <creative uuid> | (nothing)`,
  );
  process.exit(1);
}

const supabase = createServiceClient();
const PAGE = 1000;
const CONCURRENCY = 8;

/**
 * Read every row of one column, a page at a time — the API caps a single read.
 *
 * `.order()` is not cosmetic: Postgres gives no ordering guarantee without it,
 * so paging by offset over an unordered result can return a row twice or skip
 * it entirely. A skipped creative here is a creative that never gets published
 * and never gets noticed, because the serving path silently falls back to the
 * database for it.
 */
async function readAll(table, column) {
  const values = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .order(column)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    values.push(...data.map((row) => row[column]));
    if (data.length < PAGE) break;
  }
  return values;
}

/** Run `task` over `items` with a small pool; collect failures rather than aborting. */
async function runPool(label, items, task) {
  let done = 0;
  let failed = 0;
  const queue = [...items];

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await task(item);
          done++;
        } catch (err) {
          failed++;
          console.error(`  FAILED ${label} ${item}: ${err.message}`);
        }
      }
    }),
  );

  console.log(`  ${label}: ${done} published${failed ? `, ${failed} failed` : ""}`);
  return failed;
}

let failures = 0;

try {
  if (scope === "one") {
    // Publish the creative, then its owner's entitlement — a single creative is
    // only servable if both documents exist.
    const { data, error } = await supabase
      .from("creatives")
      .select("user_id")
      .eq("id", onlyCreativeId)
      .maybeSingle();
    if (error) throw new Error(`creatives read failed: ${error.message}`);
    if (!data) {
      console.error(`no creative ${onlyCreativeId}`);
      process.exit(1);
    }
    failures += await runPool("creative", [onlyCreativeId], (id) =>
      publishCreativeSnapshot(id, supabase),
    );
    failures += await runPool("entitlement", [data.user_id], (id) =>
      publishEntitlementSnapshot(id, supabase),
    );
  }

  if (scope === "all" || scope === "creatives") {
    const ids = await readAll("creatives", "id");
    console.log(`creatives: ${ids.length} row(s)`);
    failures += await runPool("creative", ids, (id) =>
      publishCreativeSnapshot(id, supabase),
    );
  }

  if (scope === "all" || scope === "entitlements") {
    // One document per user, not per subscription row — a user may hold several.
    const userIds = [...new Set(await readAll("subscriptions", "user_id"))];
    console.log(`subscribers: ${userIds.length} user(s)`);
    failures += await runPool("entitlement", userIds, (id) =>
      publishEntitlementSnapshot(id, supabase),
    );
  }
} catch (err) {
  console.error(`failed: ${err.message}`);
  failures++;
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) — re-run to retry, it is idempotent`);
}
process.exitCode = failures > 0 ? 1 : 0;

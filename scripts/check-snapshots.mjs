/**
 * Are the CDN serving snapshots still in step with the database?
 *
 *   npm run check:snapshots
 *
 * The same check the daily cron runs (`/api/cron/health`), from a terminal.
 * Worth running after anything that rewrites `templates` — `npm run db:seed`
 * changes `runtime_keys`, which every creative snapshot carries a copy of.
 *
 * Exits non-zero on drift, so it can gate a deploy. The fix is always
 * `npm run snapshot:backfill`, which is idempotent.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and BLOB_READ_WRITE_TOKEN — see .env.example.
 */
import { checkSnapshotHealth, describeSnapshotHealth } from "@/lib/serving/health";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN is not set — every snapshot read would fail and the\n" +
      "check would report total drift that isn't real. Copy it from the private\n" +
      "blob store in the Vercel dashboard into .env.local.",
  );
  process.exit(1);
}

const health = await checkSnapshotHealth();

console.log(describeSnapshotHealth(health));

if (!health.runtimeManifestPopulated) {
  console.log(
    "\nnote: runtime/manifest.ts is empty, so VPAID units still resolve through\n" +
      "the proxy route instead of the CDN. Run `npm run runtime:push` and commit it.",
  );
}

if (!health.healthy) {
  if (health.creatives.missing.length > 0) {
    console.error(`\nmissing creative snapshots (${health.creatives.missing.length}):`);
    for (const id of health.creatives.missing) console.error(`  ${id}`);
  }
  if (health.entitlements.missing.length > 0) {
    console.error(`\nmissing entitlement snapshots (${health.entitlements.missing.length}):`);
    for (const id of health.entitlements.missing) console.error(`  ${id}`);
  }
  console.error("\nfix: npm run snapshot:backfill");
  process.exitCode = 1;
} else {
  console.log("\nin step.");
}

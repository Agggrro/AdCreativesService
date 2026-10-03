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
 * Audits every store this machine can reach — Workers KV (the one the ad Worker
 * serves from, ADR-0029) and, while the app still writes it, Vercel Blob — for
 * documents that are missing and for documents that no longer match the rows.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and the snapshot-store variables — see .env.example.
 */
import { checkSnapshotHealth, describeSnapshotHealth } from "@/lib/serving/health";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (!process.env.SNAPSHOT_KV_API_TOKEN) {
  console.error(
    "SNAPSHOT_KV_* is not set — KV is the store the ad domain serves from, and a\n" +
      "check that cannot read it would report total drift that isn't real. Set\n" +
      "CLOUDFLARE_ACCOUNT_ID, SNAPSHOT_KV_NAMESPACE_ID and SNAPSHOT_KV_API_TOKEN in\n" +
      ".env.local (and, while the app still writes it, BLOB_READ_WRITE_TOKEN).",
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
  for (const s of health.stores) {
    for (const [label, ids] of [
      ["missing creative snapshots", s.creatives.missing],
      ["stale creative snapshots", s.creatives.stale],
      ["missing entitlement snapshots", s.entitlements.missing],
      ["stale entitlement snapshots", s.entitlements.stale],
    ]) {
      if (ids.length === 0) continue;
      console.error(`\n${s.store}: ${label} (${ids.length}):`);
      for (const id of ids) console.error(`  ${id}`);
    }
  }
  console.error("\nfix: npm run snapshot:backfill");
  process.exitCode = 1;
} else {
  console.log("\nin step.");
}

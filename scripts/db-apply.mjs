/**
 * Apply a .sql file to the project's Postgres.
 *
 *   node --env-file=.env.local scripts/db-apply.mjs supabase/seed.sql
 *   npm run db:seed        # the same, for the seed
 *   npm run db:schema      # the same, for the schema
 *
 * `supabase/schema.sql` and `supabase/seed.sql` are both idempotent full-applies
 * (the seed upserts on fixed uuids), so re-running either *is* the migration —
 * this repo has no migrations directory on purpose.
 *
 * Needs DATABASE_URL: Supabase dashboard -> Project Settings -> Database ->
 * Connection string -> **Session pooler** or **Direct connection**. Not the
 * transaction pooler (port 6543): it cannot run a multi-statement script.
 *
 * The connection string is a secret. It is read from the environment, never
 * logged, and never passed on the command line.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env.local scripts/db-apply.mjs <file.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Supabase -> Project Settings -> Database -> Connection string ->\n" +
      "Session pooler (or Direct connection). Add it to .env.local as DATABASE_URL.",
  );
  process.exit(1);
}

const path = resolve(file);
const sql = readFileSync(path, "utf8");

// Host only — enough to prove which project is being written to, with no
// credentials in the output.
let host = "unknown";
try {
  host = new URL(url).host;
} catch {
  /* a malformed URL fails at connect() with a clearer message than this would */
}

console.log(`applying ${file} (${sql.length} bytes) to ${host}`);

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates TLS with a cert chain Node's bundled CA store does not
  // carry. This is a local admin tool run against a known host, not an app
  // runtime path; the app's own Supabase clients verify normally.
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  // node-postgres runs a multi-statement string through the simple query
  // protocol, which wraps it in an implicit transaction: the whole file lands
  // or none of it does.
  await client.query(sql);
  console.log("applied");
} catch (err) {
  console.error(`failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

/**
 * Drift gate between the two implementations of the entitlement predicate:
 * `private.is_entitled` in Postgres and `isEntitled()` in
 * `lib/serving/entitlement.ts` (ADR-0015).
 *
 *   node --env-file=.env.local scripts/check-entitlement.mjs
 *   npm run check:entitlement
 *
 * Two checks, both read-only — nothing is written to the database:
 *
 *   A. The deployed function body still matches the one in
 *      `supabase/schema.sql`. Catches a hand-edited database, or a schema.sql
 *      that was changed but never applied.
 *
 *   B. That predicate, evaluated *by Postgres* over a matrix of cases, agrees
 *      with the TypeScript port over the same matrix. This is the check that
 *      matters: it uses Postgres's own three-valued logic and timestamptz
 *      comparison rather than anyone's reasoning about them.
 *
 * What it does not do: exercise `private.is_entitled` as a function call. That
 * would need synthetic rows in `public.subscriptions` (and behind it
 * `auth.users`), i.e. writes to a real database. Check B instead evaluates the
 * function's own WHERE clause, extracted from schema.sql and pinned by check A,
 * against a VALUES list.
 *
 * Needs DATABASE_URL — same connection string as `npm run db:schema`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { isEntitled } from "../lib/serving/entitlement.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Supabase -> Project Settings -> Database -> Connection string ->\n" +
      "Session pooler (or Direct connection). Add it to .env.local as DATABASE_URL.",
  );
  process.exit(1);
}

/** Collapse whitespace so formatting differences are not reported as drift. */
const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

// --- The predicate, taken from the repo's schema ----------------------------

const schemaSql = readFileSync(join(root, "supabase", "schema.sql"), "utf8");
const bodyMatch = schemaSql.match(
  /create or replace function private\.is_entitled[\s\S]*?as \$\$([\s\S]*?)\$\$;/i,
);
if (!bodyMatch) {
  console.error(
    "Could not find private.is_entitled in supabase/schema.sql.\n" +
      "If the function was renamed or moved, this script and\n" +
      "lib/serving/entitlement.ts both need updating with it.",
  );
  process.exit(1);
}
const schemaBody = bodyMatch[1];

// The WHERE clause alone, for check B. Everything between `where` and the
// closing paren of the EXISTS subquery.
const whereMatch = schemaBody.match(/where\s+([\s\S]*?)\s*\)\s*;?\s*$/i);
if (!whereMatch) {
  console.error("Could not extract the WHERE clause from private.is_entitled.");
  process.exit(1);
}
// Drop the `s.user_id = p_user_id` clause: the caller has already selected the
// user's row set, exactly as the snapshot reader has already selected the
// user's entitlement document.
const predicate = whereMatch[1]
  .split(/\band\b/i)
  .filter((c) => !/user_id/.test(c))
  .join(" and ")
  .replace(/p_template_id/g, "$1::uuid");

// --- Matrix (mirrors lib/serving/entitlement.test.ts) -----------------------

const TEMPLATE = "11111111-1111-4111-8111-111111111111";
const OTHER_TEMPLATE = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-16T12:00:00.000Z");
const LATER = new Date(NOW.getTime() + 3_600_000).toISOString();
const EARLIER = new Date(NOW.getTime() - 3_600_000).toISOString();

const cases = [];
for (const status of ["active", "trialing", "past_due", "canceled", "incomplete"]) {
  for (const periodEnd of [null, LATER, EARLIER, NOW.toISOString()]) {
    for (const [planType, templateId] of [
      ["all_access", null],
      ["single", TEMPLATE],
      ["single", OTHER_TEMPLATE],
      ["single", null],
    ]) {
      cases.push({ status, plan_type: planType, template_id: templateId, current_period_end: periodEnd });
    }
  }
}

const client = new pg.Client({
  connectionString: url,
  // Same rationale as scripts/db-apply.mjs: a local admin tool against a known
  // host. The app's own Supabase clients verify normally.
  ssl: { rejectUnauthorized: false },
});

let failures = 0;

try {
  await client.connect();

  // --- Check A: deployed body vs. repo -------------------------------------
  const { rows: fnRows } = await client.query(
    `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'is_entitled'`,
  );
  if (fnRows.length === 0) {
    console.error("FAIL  private.is_entitled does not exist in the database. Run `npm run db:schema`.");
    failures++;
  } else {
    const deployedBody = fnRows[0].def.match(/as \$function\$([\s\S]*?)\$function\$/i)?.[1] ?? "";
    if (normalize(deployedBody) !== normalize(schemaBody)) {
      console.error(
        "FAIL  private.is_entitled in the database differs from supabase/schema.sql.\n" +
          "      Either the database was hand-edited, or schema.sql changed and was\n" +
          "      never applied. Reconcile before trusting anything below.\n\n" +
          `      database:   ${normalize(deployedBody)}\n` +
          `      schema.sql: ${normalize(schemaBody)}\n`,
      );
      failures++;
    } else {
      console.log("ok    deployed private.is_entitled matches supabase/schema.sql");
    }
  }

  // --- Check B: Postgres's verdict vs. the TypeScript port ------------------
  // One parameter set per case, evaluated as a VALUES list. `coalesce(..., false)`
  // reproduces what EXISTS does with a NULL predicate.
  const params = [TEMPLATE, NOW.toISOString()];
  const tuples = cases.map((c) => {
    const i = params.length;
    params.push(c.status, c.plan_type, c.template_id, c.current_period_end);
    return `($${i + 1}::subscription_status, $${i + 2}::plan_type, $${i + 3}::uuid, $${i + 4}::timestamptz)`;
  });

  const { rows } = await client.query(
    `select coalesce(${predicate.replace(/\bnow\(\)/g, "$2::timestamptz")}, false) as entitled
       from (values ${tuples.join(", ")})
         as s(status, plan_type, template_id, current_period_end)`,
    params,
  );

  if (rows.length !== cases.length) {
    console.error(`FAIL  expected ${cases.length} rows back, got ${rows.length}`);
    failures++;
  }

  let mismatches = 0;
  rows.forEach((row, i) => {
    const c = cases[i];
    const ts = isEntitled(
      {
        schema_version: 1,
        user_id: "00000000-0000-4000-8000-000000000000",
        subscriptions: [c],
        published_at: NOW.toISOString(),
      },
      TEMPLATE,
      NOW,
    );
    if (ts !== row.entitled) {
      mismatches++;
      console.error(
        `FAIL  ${c.status} / ${c.plan_type} / template=${c.template_id ?? "null"} / ` +
          `ends=${c.current_period_end ?? "null"}  postgres=${row.entitled} typescript=${ts}`,
      );
    }
  });

  if (mismatches > 0) {
    console.error(
      `\n${mismatches} of ${cases.length} cases disagree.\n` +
        "lib/serving/entitlement.ts is the copy that must change: Postgres is the\n" +
        "source of truth for entitlement (supabase/schema.sql).",
    );
    failures++;
  } else {
    console.log(`ok    ${cases.length} cases agree between Postgres and lib/serving/entitlement.ts`);
  }
} catch (err) {
  console.error(`failed: ${err.message}`);
  failures++;
} finally {
  await client.end().catch(() => {});
}

process.exitCode = failures > 0 ? 1 : 0;

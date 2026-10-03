import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hasRuntimeManifest } from "@/lib/runtime-manifest";
import { auditableSnapshotStores } from "./index";
import type { SnapshotStore } from "./store";
import type { CreativeSnapshot, EntitlementRecord, EntitlementSnapshot } from "./types";

/**
 * Does every snapshot store still agree with the database?
 *
 * The serving path falls back to Postgres whenever a creative snapshot is missing
 * (ADR-0015), which is what makes the design safe — and also what makes a broken
 * publisher invisible: everything keeps working, just slower and against the
 * database we were trying to get off. Nothing else would ever report it, so this
 * check exists to make the silence audible.
 *
 * It looks for two kinds of drift, in **every** store this process writes
 * (ADR-0029: during the move the ad Worker serves from KV while the app reads
 * Blob, and the two can disagree):
 *
 *   - **missing** — no document, or one that cannot be read. For a creative the
 *     serving path falls back to Postgres; for an entitlement it does not serve
 *     at all, so a subscriber missing here has dark tags.
 *   - **stale** — a document that no longer says what the rows say. A creative
 *     whose snapshot differs from what `get_creative_serving` — the very RPC the
 *     publisher projects — returns now (an edit, a status change, or a template
 *     change from `db:seed` that was never backfilled); an entitlement whose
 *     subscription facts differ from `subscriptions`. The second is the dangerous
 *     one: a cancellation that never reached a store keeps serving there.
 *
 * Sampling, not a full sweep: the failure modes being watched for are systemic
 * (a writer that stopped publishing, a store a token can no longer write, a seed
 * applied without a backfill), and a systemic failure shows up in any sample.
 */

/** How many creatives and subscribers to probe per run. */
const SAMPLE_SIZE = 50;

/**
 * Upper bound on subscription rows scanned to build the distinct-subscriber set.
 * Generous relative to SAMPLE_SIZE, and explicit so the cap is a decision rather
 * than whatever page size the API happens to default to.
 */
const SUBSCRIBER_SCAN_LIMIT = 5000;


export interface StoreHealth {
  store: string;
  creatives: { missing: string[]; stale: string[] };
  entitlements: { missing: string[]; stale: string[] };
}

export interface SnapshotHealth {
  healthy: boolean;
  /** `missing` and `stale` are across every store; `stores` says which. */
  creatives: { total: number; sampled: number; missing: string[]; stale: string[] };
  entitlements: { total: number; sampled: number; missing: string[]; stale: string[] };
  stores: StoreHealth[];
  /** False until `npm run runtime:push` has run and the manifest is committed. */
  runtimeManifestPopulated: boolean;
  checkedAt: string;
}

/** The creative-side fields a snapshot projects from `get_creative_serving` (lib/serving/publish.ts). */
type ServingFacts = Pick<
  CreativeSnapshot,
  | "user_id"
  | "template_id"
  | "selected_format"
  | "config_json"
  | "creative_status"
  | "template_type"
  | "runtime_keys"
  | "supported_standards"
  | "click_fields"
>;

interface CreativeRow {
  id: string;
  /** What a publish would write now, or null when the row vanished mid-check. */
  facts: ServingFacts | null;
}

/** JSON with object keys sorted at every depth, so equal values compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** One subscription fact as a comparable string; the instant parsed, not its spelling. */
function factKey(s: {
  plan_type: string;
  template_id: string | null;
  status: string;
  current_period_end: string | null;
}): string {
  const end = s.current_period_end === null ? "none" : String(Date.parse(s.current_period_end));
  return `${s.plan_type}|${s.template_id ?? ""}|${s.status}|${end}`;
}

function sameFacts(snapshot: EntitlementSnapshot, rows: EntitlementRecord[]): boolean {
  const a = snapshot.subscriptions.map(factKey).sort();
  const b = rows.map(factKey).sort();
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

function creativeIsStale(facts: ServingFacts, snapshot: CreativeSnapshot): boolean {
  const pick = (f: ServingFacts) =>
    canonical({
      user_id: f.user_id,
      template_id: f.template_id,
      selected_format: f.selected_format,
      config_json: f.config_json,
      creative_status: f.creative_status,
      template_type: f.template_type,
      runtime_keys: f.runtime_keys,
      supported_standards: f.supported_standards,
      click_fields: Array.isArray(f.click_fields) ? f.click_fields : [],
    });
  return pick(facts) !== pick(snapshot);
}

async function checkStore(
  name: string,
  store: SnapshotStore,
  creatives: CreativeRow[],
  subscribers: string[],
  factsByUser: Map<string, EntitlementRecord[]>,
): Promise<StoreHealth> {
  // Concurrent, not sequential: each probe is a network read, and a hundred of
  // them end to end is enough to exceed a function's time limit and make the
  // health check itself the thing that looks broken. A document that cannot be
  // read counts as missing — the repair is the same backfill.
  const [creativeDocs, entitlementDocs] = await Promise.all([
    Promise.all(creatives.map((row) => store.getCreative(row.id).catch(() => null))),
    Promise.all(subscribers.map((id) => store.getEntitlement(id).catch(() => null))),
  ]);

  const result: StoreHealth = {
    store: name,
    creatives: { missing: [], stale: [] },
    entitlements: { missing: [], stale: [] },
  };
  creatives.forEach((row, i) => {
    const doc = creativeDocs[i];
    if (!row.facts) return; // deleted while the check ran
    if (!doc) result.creatives.missing.push(row.id);
    else if (creativeIsStale(row.facts, doc)) result.creatives.stale.push(row.id);
  });
  subscribers.forEach((id, i) => {
    const doc = entitlementDocs[i];
    if (!doc) result.entitlements.missing.push(id);
    else if (!sameFacts(doc, factsByUser.get(id) ?? [])) result.entitlements.stale.push(id);
  });
  return result;
}

export async function checkSnapshotHealth(
  sampleSize: number = SAMPLE_SIZE,
): Promise<SnapshotHealth> {
  const supabase = createServiceClient();

  const [{ count: creativeTotal }, { data: creativeRows, error: creativeError }] =
    await Promise.all([
      supabase.from("creatives").select("id", { count: "exact", head: true }),
      // Newest first: a publish that started failing shows up here before it
      // shows up anywhere else, because the newest rows are the ones a broken
      // writer would have missed.
      supabase
        .from("creatives")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(sampleSize),
    ]);
  if (creativeError) throw new Error(`creatives read failed: ${creativeError.message}`);

  // What a publish would write for each, from the same RPC the publisher reads.
  const creatives: CreativeRow[] = await Promise.all(
    (creativeRows ?? []).map(async ({ id }) => {
      const { data, error } = await supabase.rpc("get_creative_serving", { p_creative_id: id });
      if (error) throw new Error(`get_creative_serving failed: ${error.message}`);
      return { id, facts: data && data.length > 0 ? data[0] : null };
    }),
  );

  // One document per subscriber, so the set to probe is the distinct users with
  // a subscription — not the subscription rows themselves. `range` because the
  // API caps an unbounded select at its default page, which would silently
  // truncate the set this samples from and report healthy for a cohort it never
  // looked at.
  const { data: subscriptionRows, error: subscriberError } = await supabase
    .from("subscriptions")
    .select("user_id")
    .order("user_id")
    .range(0, SUBSCRIBER_SCAN_LIMIT - 1);
  if (subscriberError) throw new Error(`subscriptions read failed: ${subscriberError.message}`);
  const subscriberIds = [...new Set((subscriptionRows ?? []).map((s) => s.user_id))];
  const sampledSubscribers = subscriberIds.slice(0, sampleSize);

  // The facts each sampled subscriber's document must carry — the same four
  // columns lib/serving/publish.ts projects.
  const factsByUser = new Map<string, EntitlementRecord[]>();
  if (sampledSubscribers.length > 0) {
    const { data: facts, error: factsError } = await supabase
      .from("subscriptions")
      .select("user_id, plan_type, template_id, status, current_period_end")
      .in("user_id", sampledSubscribers);
    if (factsError) throw new Error(`subscription facts read failed: ${factsError.message}`);
    for (const f of facts ?? []) {
      const list = factsByUser.get(f.user_id) ?? [];
      list.push({
        plan_type: f.plan_type,
        template_id: f.template_id,
        status: f.status,
        current_period_end: f.current_period_end,
      });
      factsByUser.set(f.user_id, list);
    }
  }

  const stores = await Promise.all(
    auditableSnapshotStores().map(({ name, store }) =>
      checkStore(name, store, creatives, sampledSubscribers, factsByUser),
    ),
  );

  const union = (pick: (s: StoreHealth) => string[]) => [...new Set(stores.flatMap(pick))];
  const health: SnapshotHealth = {
    healthy: false,
    creatives: {
      total: creativeTotal ?? 0,
      sampled: creatives.length,
      missing: union((s) => s.creatives.missing),
      stale: union((s) => s.creatives.stale),
    },
    entitlements: {
      total: subscriberIds.length,
      sampled: sampledSubscribers.length,
      missing: union((s) => s.entitlements.missing),
      stale: union((s) => s.entitlements.stale),
    },
    stores,
    runtimeManifestPopulated: hasRuntimeManifest(),
    checkedAt: new Date().toISOString(),
  };
  health.healthy =
    health.creatives.missing.length === 0 &&
    health.creatives.stale.length === 0 &&
    health.entitlements.missing.length === 0 &&
    health.entitlements.stale.length === 0;
  return health;
}

/** One-line summary for a log entry or a terminal. */
export function describeSnapshotHealth(health: SnapshotHealth): string {
  const parts = health.stores.map((s) => {
    const c = s.creatives;
    const e = s.entitlements;
    return (
      `${s.store}: creatives ${health.creatives.sampled - c.missing.length - c.stale.length}` +
      `/${health.creatives.sampled} current (${c.missing.length} missing, ${c.stale.length} stale), ` +
      `entitlements ${health.entitlements.sampled - e.missing.length - e.stale.length}` +
      `/${health.entitlements.sampled} current (${e.missing.length} missing, ${e.stale.length} stale)`
    );
  });
  return (
    `${parts.join("; ")}; of ${health.creatives.total} creatives and ` +
    `${health.entitlements.total} subscribers; ` +
    `runtime manifest ${health.runtimeManifestPopulated ? "populated" : "EMPTY"}`
  );
}

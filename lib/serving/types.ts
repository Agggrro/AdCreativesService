import type {
  Json,
  PlanType,
  SubscriptionStatus,
  CreativeStatus,
} from "@/types/database.types";

/**
 * Serving snapshots: the denormalized read the public VAST path uses instead of
 * a live Postgres round trip (ADR-0015).
 *
 * The snapshots are a *projection* of `private.creative_serving`, not a second
 * source of truth. Postgres stays authoritative; these are republished by the
 * writers that change the underlying rows.
 *
 * Two documents rather than one, and that split is load-bearing: a subscription
 * event covers every creative a user owns (all-access) or every creative on one
 * template (single). Folding entitlement into the creative snapshot would make
 * one Stripe webhook rewrite N documents. Keyed separately, it rewrites one.
 */

/**
 * Bumped whenever the shape below changes incompatibly. Readers check it and
 * treat an unknown version as a miss, which falls through to the database —
 * without this, the first shape change is an outage with no migration path.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Everything the VAST builder needs about one creative. Mirrors the
 * creative-side columns of `private.creative_serving` and deliberately omits
 * `is_entitled` / `should_serve`: those are *computed*, and freezing them into
 * a snapshot is exactly the bug ADR-0015 exists to avoid — see
 * `lib/serving/entitlement.ts`.
 */
export interface CreativeSnapshot {
  schema_version: number;
  creative_id: string;
  user_id: string;
  template_id: string;
  selected_format: string;
  config_json: Json;
  creative_status: CreativeStatus;
  template_type: string;
  runtime_keys: Json;
  supported_standards: string[];
  /** Publication time. For debugging drift only — never an input to a serving decision. */
  published_at: string;
}

/**
 * One subscription reduced to the four facts `private.is_entitled` actually
 * reads. Nothing about the Stripe customer, price, or cancellation intent
 * belongs here: this document is world-readable object storage, so it carries
 * the minimum needed to answer "may this tag serve right now?".
 */
export interface EntitlementRecord {
  plan_type: PlanType;
  /** NULL for all-access; the covered template for a single plan. */
  template_id: string | null;
  status: SubscriptionStatus;
  /**
   * ISO-8601, or null for "no expiry" — mirroring the SQL's
   * `current_period_end is null or current_period_end > now()`. Stored as an
   * instant rather than a precomputed boolean so that entitlement still lapses
   * on its own when no webhook arrives to tell us it did.
   */
  current_period_end: string | null;
}

export interface EntitlementSnapshot {
  schema_version: number;
  user_id: string;
  /** Every subscription row for this user; entitlement is an OR across them. */
  subscriptions: EntitlementRecord[];
  published_at: string;
}

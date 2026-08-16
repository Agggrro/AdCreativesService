import type { SubscriptionStatus } from "@/types/database.types";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types";

/**
 * The entitlement predicate, evaluated on the serving path from snapshot facts.
 *
 * This is a deliberate second implementation of `private.is_entitled`
 * (supabase/schema.sql). The schema comment there insists there be one
 * definition because a drift "would either dark a live tag or tell a buyer
 * their dead tag is fine" — that warning still stands and now applies across a
 * language boundary. Two rules follow from it:
 *
 *   1. This file is a line-by-line port. Any change to the SQL predicate must
 *      land here in the same change, and vice versa.
 *   2. `scripts/check-entitlement.mjs` runs both against one matrix and is the
 *      gate that actually catches drift; the unit test beside this file only
 *      catches accidental edits to *this* copy.
 *
 * The reason the port exists at all: the SQL evaluates `current_period_end >
 * now()` at read time, so a lapsed subscription stops serving with no event
 * required. Snapshotting a boolean `should_serve` would throw that away and
 * leave a paid payload serving indefinitely after the period ended, since a
 * missed or delayed Stripe webhook is precisely the case the live predicate is
 * immune to. Storing the timestamp and re-evaluating here keeps the property.
 */

/** `s.status in ('active', 'trialing')` — the only two statuses that serve. */
const SERVING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  "active",
  "trialing",
]);

/**
 * Port of `private.is_entitled(p_user_id, p_template_id)`. The user is implicit:
 * the caller has already selected that user's snapshot.
 *
 * `now` is injected so the matrix test can pin it; production passes the default.
 */
export function isEntitled(
  entitlement: EntitlementSnapshot | null,
  templateId: string,
  now: Date = new Date(),
): boolean {
  // No snapshot is not "no expiry" — it is "we do not know", which fails closed
  // exactly like an unreadable serving row does in app/api/vast/route.ts.
  if (!entitlement) return false;

  return entitlement.subscriptions.some((s) => {
    if (!SERVING_STATUSES.has(s.status)) return false;

    // `s.current_period_end is null or s.current_period_end > now()`
    if (s.current_period_end !== null) {
      const endsAt = Date.parse(s.current_period_end);
      // A timestamp we cannot parse is not a licence to serve. In SQL this case
      // cannot arise (the column is typed); here the value has been through
      // JSON, so it has to be handled — and the safe direction is closed.
      if (Number.isNaN(endsAt) || endsAt <= now.getTime()) return false;
    }

    // `s.plan_type = 'all_access' or (s.plan_type = 'single' and s.template_id = p_template_id)`
    // A single plan with a NULL template_id matches nothing, same as SQL's
    // NULL = 'uuid' evaluating to NULL rather than true.
    return (
      s.plan_type === "all_access" ||
      (s.plan_type === "single" && s.template_id === templateId)
    );
  });
}

/**
 * Port of the `should_serve` column on `private.creative_serving`:
 * `c.status = 'active' and private.is_entitled(c.user_id, c.template_id)`.
 */
export function shouldServe(
  creative: CreativeSnapshot,
  entitlement: EntitlementSnapshot | null,
  now: Date = new Date(),
): boolean {
  return (
    creative.creative_status === "active" &&
    isEntitled(entitlement, creative.template_id, now)
  );
}

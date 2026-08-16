import test from "node:test";
import assert from "node:assert/strict";
import type { PlanType, SubscriptionStatus } from "../../types/database.types.ts";
import { isEntitled, shouldServe } from "./entitlement.ts";
import { SNAPSHOT_SCHEMA_VERSION } from "./types.ts";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types.ts";

/**
 * Run with `npm run test:entitlement`.
 *
 * This pins *this* copy of the predicate against accidental edits. It does NOT
 * prove agreement with `private.is_entitled` in Postgres — that is what
 * `scripts/check-entitlement.mjs` does, against a live database. Both matter;
 * neither substitutes for the other (see lib/serving/entitlement.ts).
 */

const TEMPLATE = "11111111-1111-4111-8111-111111111111";
const OTHER_TEMPLATE = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const AN_HOUR_LATER = new Date(NOW.getTime() + 3_600_000).toISOString();
const AN_HOUR_EARLIER = new Date(NOW.getTime() - 3_600_000).toISOString();

function entitlement(
  ...subscriptions: EntitlementSnapshot["subscriptions"]
): EntitlementSnapshot {
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    user_id: USER,
    subscriptions,
    published_at: NOW.toISOString(),
  };
}

function creative(overrides: Partial<CreativeSnapshot> = {}): CreativeSnapshot {
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    creative_id: "44444444-4444-4444-8444-444444444444",
    user_id: USER,
    template_id: TEMPLATE,
    selected_format: "vpaid",
    config_json: {},
    creative_status: "active",
    template_type: "shoppable",
    runtime_keys: { vpaid: "shoppable/vpaid/unit.js" },
    supported_standards: ["vpaid", "simid"],
    published_at: NOW.toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The matrix: status x period x plan coverage.
//
// Each axis carries its own independently-stated verdict, and the expectation
// is their conjunction — the same shape as the SQL's three ANDed clauses, but
// asserted from the axis labels rather than by calling the implementation.
// ---------------------------------------------------------------------------

const STATUSES: { status: SubscriptionStatus; serves: boolean }[] = [
  { status: "active", serves: true },
  { status: "trialing", serves: true },
  { status: "past_due", serves: false },
  { status: "canceled", serves: false },
  { status: "incomplete", serves: false },
];

const PERIODS: { label: string; value: string | null; alive: boolean }[] = [
  { label: "no expiry", value: null, alive: true },
  { label: "expires in an hour", value: AN_HOUR_LATER, alive: true },
  { label: "expired an hour ago", value: AN_HOUR_EARLIER, alive: false },
];

const PLANS: {
  label: string;
  plan_type: PlanType;
  template_id: string | null;
  covers: boolean;
}[] = [
  { label: "all-access", plan_type: "all_access", template_id: null, covers: true },
  {
    label: "single, matching template",
    plan_type: "single",
    template_id: TEMPLATE,
    covers: true,
  },
  {
    label: "single, other template",
    plan_type: "single",
    template_id: OTHER_TEMPLATE,
    covers: false,
  },
];

for (const s of STATUSES) {
  for (const p of PERIODS) {
    for (const plan of PLANS) {
      const expected = s.serves && p.alive && plan.covers;
      test(`${s.status} / ${p.label} / ${plan.label} => ${expected}`, () => {
        const snapshot = entitlement({
          plan_type: plan.plan_type,
          template_id: plan.template_id,
          status: s.status,
          current_period_end: p.value,
        });
        assert.equal(isEntitled(snapshot, TEMPLATE, NOW), expected);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Named cases that the matrix does not reach.
// ---------------------------------------------------------------------------

test("the case this design exists for: active subscription whose period ended, no webhook ever arrived", () => {
  // Nothing marked this canceled — Stripe's event was missed, delayed, or not
  // yet due. The live SQL predicate stops serving here on its own, so this port
  // must too, or the paid payload keeps serving indefinitely for free.
  const snapshot = entitlement({
    plan_type: "all_access",
    template_id: null,
    status: "active",
    current_period_end: AN_HOUR_EARLIER,
  });
  assert.equal(isEntitled(snapshot, TEMPLATE, NOW), false);
  assert.equal(shouldServe(creative(), snapshot, NOW), false);
});

test("a missing snapshot is not 'no expiry' — it fails closed", () => {
  assert.equal(isEntitled(null, TEMPLATE, NOW), false);
  assert.equal(shouldServe(creative(), null, NOW), false);
});

test("a user with no subscriptions at all is not entitled", () => {
  assert.equal(isEntitled(entitlement(), TEMPLATE, NOW), false);
});

test("entitlement is an OR across rows: one covering subscription is enough", () => {
  const snapshot = entitlement(
    {
      plan_type: "single",
      template_id: OTHER_TEMPLATE,
      status: "active",
      current_period_end: AN_HOUR_LATER,
    },
    {
      plan_type: "single",
      template_id: TEMPLATE,
      status: "active",
      current_period_end: AN_HOUR_LATER,
    },
  );
  assert.equal(isEntitled(snapshot, TEMPLATE, NOW), true);
});

test("a dead row does not poison a live one", () => {
  const snapshot = entitlement(
    {
      plan_type: "all_access",
      template_id: null,
      status: "canceled",
      current_period_end: AN_HOUR_EARLIER,
    },
    {
      plan_type: "all_access",
      template_id: null,
      status: "active",
      current_period_end: AN_HOUR_LATER,
    },
  );
  assert.equal(isEntitled(snapshot, TEMPLATE, NOW), true);
});

test("an unparseable current_period_end fails closed", () => {
  // Cannot happen in SQL (the column is typed); can happen here, because the
  // value has been through JSON and object storage.
  const snapshot = entitlement({
    plan_type: "all_access",
    template_id: null,
    status: "active",
    current_period_end: "not a timestamp",
  });
  assert.equal(isEntitled(snapshot, TEMPLATE, NOW), false);
});

test("expiry is strict: a period ending exactly now does not serve", () => {
  const snapshot = entitlement({
    plan_type: "all_access",
    template_id: null,
    status: "active",
    current_period_end: NOW.toISOString(),
  });
  assert.equal(isEntitled(snapshot, TEMPLATE, NOW), false);
});

test("a single plan with a null template_id matches nothing", () => {
  // Mirrors SQL's `NULL = 'uuid'` evaluating to NULL rather than true. The DB
  // check constraint forbids this row, so it is defence in depth, not a case
  // that should occur.
  const snapshot = entitlement({
    plan_type: "single",
    template_id: null,
    status: "active",
    current_period_end: AN_HOUR_LATER,
  });
  assert.equal(isEntitled(snapshot, TEMPLATE, NOW), false);
});

// --- shouldServe: the creative-status half of the view -----------------------

for (const status of ["draft", "paused", "archived"] as const) {
  test(`shouldServe is false for a ${status} creative even when fully entitled`, () => {
    const snapshot = entitlement({
      plan_type: "all_access",
      template_id: null,
      status: "active",
      current_period_end: AN_HOUR_LATER,
    });
    assert.equal(isEntitled(snapshot, TEMPLATE, NOW), true);
    assert.equal(shouldServe(creative({ creative_status: status }), snapshot, NOW), false);
  });
}

test("shouldServe is true for an active creative with a covering subscription", () => {
  const snapshot = entitlement({
    plan_type: "all_access",
    template_id: null,
    status: "active",
    current_period_end: AN_HOUR_LATER,
  });
  assert.equal(shouldServe(creative(), snapshot, NOW), true);
});

test("shouldServe checks the creative's own template, not just any coverage", () => {
  const snapshot = entitlement({
    plan_type: "single",
    template_id: OTHER_TEMPLATE,
    status: "active",
    current_period_end: AN_HOUR_LATER,
  });
  assert.equal(shouldServe(creative({ template_id: TEMPLATE }), snapshot, NOW), false);
  assert.equal(shouldServe(creative({ template_id: OTHER_TEMPLATE }), snapshot, NOW), true);
});

import "server-only";
import Stripe from "stripe";
import type { PlanType, SubscriptionStatus } from "@/types/database.types";

/** Server-only Stripe client. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  // apiVersion omitted on purpose: use the version pinned by this SDK release.
  return new Stripe(key);
}

/** 7-day free trial for new subscriptions (mvp-scope / docs/billing.md). */
export const TRIAL_PERIOD_DAYS = 7;

/**
 * Purchasable plans. Each maps to a Stripe Price (id in env) and to our
 * subscription model. Single plans require a template; Ultimate is all-access.
 */
export const PLANS = {
  single_weekly: {
    priceEnv: "STRIPE_PRICE_SINGLE_WEEKLY",
    planType: "single",
    requiresTemplate: true,
  },
  single_monthly: {
    priceEnv: "STRIPE_PRICE_SINGLE_MONTHLY",
    planType: "single",
    requiresTemplate: true,
  },
  ultimate_monthly: {
    priceEnv: "STRIPE_PRICE_ULTIMATE_MONTHLY",
    planType: "all_access",
    requiresTemplate: false,
  },
} as const satisfies Record<
  string,
  { priceEnv: string; planType: PlanType; requiresTemplate: boolean }
>;

export type PlanKey = keyof typeof PLANS;

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && value in PLANS;
}

/** Map a Stripe subscription status to our enum (fail safe to a non-serving state). */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    default:
      return "incomplete";
  }
}

/**
 * Read the current period end (unix seconds) robustly across Stripe API
 * versions: it was moved from the Subscription top level onto subscription
 * items in 2025. Returns null if unavailable.
 */
export function getCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof top === "number") return top;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  if (item && typeof item.current_period_end === "number") return item.current_period_end;
  return null;
}

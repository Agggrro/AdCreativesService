import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, mapStripeStatus, getCurrentPeriodEnd } from "@/lib/stripe";
import type { Database } from "@/types/database.types";

// Needs the raw body for signature verification — Node runtime, no body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DB = SupabaseClient<Database>;

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency: claim the event id. Unique violation => already processed.
  const { error: claimError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (claimError) {
    if ((claimError as { code?: string }).code === "23505") {
      return new Response("Duplicate", { status: 200 });
    }
    return new Response("Ledger error", { status: 500 }); // let Stripe retry
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSubscription(supabase, event.data.object as Stripe.Subscription);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          stripe,
          supabase,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "invoice.payment_failed": {
        // `Invoice.subscription` was removed from the pinned API version — the
        // subscription now lives under `parent.subscription_details` (stripe@22
        // types have no top-level `subscription` field on Invoice at all, so a
        // cast can't paper over this the way `getCurrentPeriodEnd` does for a
        // field that merely moved). No cast needed: the SDK type already models
        // this shape.
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          // Re-retrieve and run through the same full upsert every other
          // subscription event uses, rather than force-setting `past_due`
          // directly. Stripe does not guarantee event ordering; a blind
          // overwrite could regress an already-recovered subscription back to
          // past_due if this event is delivered (or retried) after a later
          // customer.subscription.updated already synced the real status.
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(supabase, sub);
        } else {
          // A subscription-mode-only product should never see this: log it
          // rather than throwing, since retrying can't produce a subscription
          // id that doesn't exist.
          console.error(
            "invoice.payment_failed: no subscription on invoice.parent.subscription_details",
            { invoiceId: invoice.id },
          );
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // Roll back the idempotency claim so Stripe's retry can reprocess.
    await supabase.from("stripe_events").delete().eq("id", event.id);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

/**
 * Upsert a subscription row from a Stripe Subscription. This is the only writer
 * of entitlement. Because the serving view computes entitlement live, no
 * separate "refresh" step is needed — the VAST kill-switch reacts within the
 * ~60s cache window. See docs/billing.md.
 */
async function upsertSubscription(supabase: DB, sub: Stripe.Subscription): Promise<void> {
  const meta = sub.metadata ?? {};
  const userId = meta.user_id;
  if (!userId) return; // can't attribute without our metadata

  const planType = meta.plan_type === "all_access" ? "all_access" : "single";
  const templateId = planType === "single" ? meta.template_id || null : null;

  // Single plans require a template (DB check constraint); skip malformed rows.
  if (planType === "single" && !templateId) return;

  const periodEnd = getCurrentPeriodEnd(sub);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_type: planType,
      template_id: templateId,
      status: mapStripeStatus(sub.status),
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw new Error(error.message);
}

/** Link the Stripe customer to the profile and sync the resulting subscription. */
async function handleCheckoutCompleted(
  stripe: Stripe,
  supabase: DB,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.user_id;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (userId && customerId) {
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    await upsertSubscription(supabase, sub);
  }
}

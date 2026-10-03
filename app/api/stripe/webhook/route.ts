import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, mapStripeStatus, getCurrentPeriodEnd } from "@/lib/stripe";
import { publishEntitlementSnapshot } from "@/lib/serving/publish";
import type { Database } from "@/types/database.types";

// Needs the raw body for signature verification — Node runtime, no body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Far inside CLAIM_TIMEOUT_MS below: a run that outlived the claim timeout
// would share its event with the delivery that took the claim over. Vercel
// honours it; on a Worker the run ends when Stripe stops waiting (20 s).
export const maxDuration = 60;

type DB = SupabaseClient<Database>;

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  // The async check with SubtleCrypto: the same HMAC over the same raw body,
  // through the Web Crypto API every runtime the app runs on has. The
  // synchronous `constructEvent` needs Node's `crypto`, and in a Worker build of
  // the SDK it throws — which this catch would turn into a 400 on every event
  // until Stripe disabled the endpoint (ADR-0029).
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    // Logged, because a wrong or padded secret set at a cutover would 400 every
    // event and say nothing. The message names the check that failed; the
    // payload and the header are not in it.
    console.error("[stripe-webhook] signature not verified", {
      message: err instanceof Error ? err.message : String(err),
    });
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency: claim the event id. A claim is not a completion — only an
  // event marked processed is a duplicate. A claim still in flight is answered
  // with a retryable status; one older than CLAIM_TIMEOUT_MS was abandoned (the
  // handler died, its rollback failed, or the request was cut off when Stripe
  // stopped waiting) and is taken over. Reprocessing is safe: every handler
  // re-fetches the subscription from Stripe rather than trusting the payload.
  //
  // The claim carries the instant this run wrote, and the rollback and the
  // processed mark below match it: if a takeover ever overlapped this run, each
  // run touches only its own claim.
  let claimedAt = new Date().toISOString();
  const { error: claimError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, received_at: claimedAt });
  if (claimError) {
    if ((claimError as { code?: string }).code !== "23505") {
      return new Response("Ledger error", { status: 500 }); // let Stripe retry
    }
    const claim = await takeOverAbandonedClaim(supabase, event.id);
    if (claim === "processed") return new Response("Duplicate", { status: 200 });
    if (claim === "in-flight") return new Response("In progress", { status: 409 });
    if (claim === "error") return new Response("Ledger error", { status: 500 });
    claimedAt = claim.claimedAt;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // The subscription as Stripe has it *now*, not as it was when this
        // event was created. A retry redelivers the old object unchanged: an
        // `updated` (active) that failed once and is retried after the
        // `deleted` would otherwise write `active` back over `canceled`.
        // `syncSubscription` re-fetches, and the database keeps a canceled row
        // canceled whatever lands late (subscriptions_keep_canceled).
        const stale = event.data.object as Stripe.Subscription;
        await syncSubscription(stripe, supabase, stale.id);
        break;
      }
      case "customer.subscription.deleted":
        // From the payload, not re-fetched: canceled is final, so this object is
        // right whatever order events arrive in — and a re-fetch can fail for
        // good (a test clock's objects are deleted with it), which would leave
        // the row active until its period ended.
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
          await syncSubscription(stripe, supabase, subId);
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
  } catch (err) {
    console.error("[stripe-webhook] handler failed, Stripe will retry", {
      eventId: event.id,
      type: event.type,
      message: err instanceof Error ? err.message : String(err),
    });
    // Roll back the idempotency claim so Stripe's retry can reprocess.
    const { error: rollbackError } = await supabase
      .from("stripe_events")
      .delete()
      .eq("id", event.id)
      .eq("received_at", claimedAt);
    if (rollbackError) {
      // The claim stays, unprocessed: a retry within CLAIM_TIMEOUT_MS is told
      // "in progress", and the first one after it takes the claim over.
      console.error("[stripe-webhook] could not roll back the event claim", {
        eventId: event.id,
        message: rollbackError.message,
      });
    }
    return new Response("Handler error", { status: 500 });
  }

  // Done. If this marker does not land the work still did: Stripe gets its 200
  // and stops, and a redelivery after the claim timeout would only reprocess
  // an event whose handlers are safe to run twice.
  const { error: doneError } = await supabase
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", event.id)
    .eq("received_at", claimedAt);
  if (doneError) {
    console.error("[stripe-webhook] processed, but not marked so", {
      eventId: event.id,
      message: doneError.message,
    });
  }
  return new Response("ok", { status: 200 });
}

/**
 * How long a claim may stay unfinished before another delivery may take it.
 * Twice `maxDuration`, and every call the handler makes is bounded (the Stripe
 * client, the database client, KV), so no run of it is still going by then —
 * and short against Stripe's retry schedule, so an abandoned event is picked
 * up by the next retry that comes.
 */
const CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * The event id was already claimed. Processed: a duplicate. Claimed recently:
 * still in flight. Claimed long ago and never finished: abandoned — reclaim it
 * (the conditional update makes exactly one delivery the winner) and process.
 */
async function takeOverAbandonedClaim(
  supabase: DB,
  eventId: string,
): Promise<"processed" | "in-flight" | "error" | { claimedAt: string }> {
  const { data: row, error } = await supabase
    .from("stripe_events")
    .select("processed_at, received_at")
    .eq("id", eventId)
    .retry(false) // a failure here answers 500 and Stripe retries; no need to wait it out
    .maybeSingle();
  if (error) return "error";
  if (!row) return "in-flight"; // rolled back between the insert and this read: let the retry claim it
  if (row.processed_at) return "processed";

  const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();
  const claimedAt = new Date().toISOString();
  const { data: taken, error: takeError } = await supabase
    .from("stripe_events")
    .update({ received_at: claimedAt })
    .eq("id", eventId)
    .is("processed_at", null)
    .lt("received_at", cutoff)
    .select("id");
  if (takeError) return "error";
  return taken && taken.length > 0 ? { claimedAt } : "in-flight";
}

/**
 * Upsert a subscription row from a Stripe Subscription, then republish the
 * user's entitlement snapshot. This is the only writer of entitlement.
 *
 * The republish used to be unnecessary: the serving view computed entitlement
 * live on every ad request. Since ADR-0015 the serving path reads a CDN
 * snapshot instead, so this handler is what makes a subscription change visible
 * to the kill-switch — and a publish that does not land leaves the CDN holding
 * the *previous* entitlement, which is exactly how a cancelled subscription
 * would keep serving. Hence: it throws, the caller rolls back the idempotency
 * claim and returns 500, and Stripe retries.
 *
 * Kill-switch latency is the VAST response cache (~60s) plus snapshot
 * propagation (up to 60s, KV's edge cache) — see docs/billing.md.
 */
async function upsertSubscription(supabase: DB, sub: Stripe.Subscription): Promise<void> {
  await writeSubscriptionRow(supabase, sub);
  await publishEntitlementFor(supabase, sub);
}

/** Our metadata on a subscription, or null when it is not one of ours to attribute. */
function attribution(sub: Stripe.Subscription): { userId: string } | null {
  const userId = sub.metadata?.user_id;
  return userId ? { userId } : null;
}

/** Write the row only. A canceled row is never moved out of canceled (schema.sql). */
async function writeSubscriptionRow(supabase: DB, sub: Stripe.Subscription): Promise<void> {
  const meta = sub.metadata ?? {};
  const userId = attribution(sub)?.userId;
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

/** Republish the subscription owner's entitlement document. */
async function publishEntitlementFor(supabase: DB, sub: Stripe.Subscription): Promise<void> {
  const userId = attribution(sub)?.userId;
  if (!userId) return;

  // A publish that does not land clears the stores it missed before it throws
  // (store.ts, "fail closed"): with no entitlement document the serving path
  // does not serve this user's tags at all, so a cancellation cannot keep
  // serving off a stale copy. The throw rolls back the claim and Stripe
  // retries, which is what turns a new subscription's tags on. If a store can
  // neither take the write nor clear it, the previous document stays until a
  // retry or the reconciler (/api/cron/reconcile) republishes it from these
  // rows — logged as `[snapshot-stale]`.
  await publishEntitlementSnapshot(userId, supabase);
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
    const { error } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
    // Thrown, so the event is retried: a profile without its customer id would
    // send the next checkout to create a second Stripe customer.
    if (error) throw new Error(`profile link failed: ${error.message}`);
  }

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (subId) await syncSubscription(stripe, supabase, subId);
}

/** What a subscription row is made of, as Stripe reports it — for comparing two reads. */
function syncedState(sub: Stripe.Subscription): string {
  return JSON.stringify([
    sub.status,
    getCurrentPeriodEnd(sub),
    sub.cancel_at_period_end ?? false,
    sub.metadata?.plan_type ?? null,
    sub.metadata?.template_id ?? null,
  ]);
}

/**
 * Fetch the subscription from Stripe, write it, and fetch it again: if it moved
 * meanwhile, write the newer state — at most twice. Two handlers for one
 * subscription can interleave (a cancellation and an older `updated`), and the
 * one that fetched first may write last; reading again after writing is what
 * keeps the row at Stripe's latest state rather than whichever write landed
 * last. A canceled row stays canceled in any case (subscriptions_keep_canceled).
 */
async function syncSubscription(stripe: Stripe, supabase: DB, subId: string): Promise<void> {
  let sub = await stripe.subscriptions.retrieve(subId);
  let settled = false;
  for (let attempt = 0; attempt < 2 && !settled; attempt += 1) {
    await writeSubscriptionRow(supabase, sub);
    const again = await stripe.subscriptions.retrieve(subId);
    settled = syncedState(again) === syncedState(sub);
    sub = again;
  }
  if (!settled) {
    // Still moving: write the newest state seen, publish it, and fail so Stripe
    // retries — never leave a row known to be behind.
    await writeSubscriptionRow(supabase, sub);
    await publishEntitlementFor(supabase, sub);
    throw new Error(`subscription ${subId} kept changing while it was synced`);
  }
  await publishEntitlementFor(supabase, sub);
}

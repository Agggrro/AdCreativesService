# Billing

> Status: design phase. Stripe is the **source of truth**; our DB mirrors it.

## Plans & prices (draft, MVP)

All plans are **recurring Stripe subscriptions** (auto-renew until cancelled) with a
**7-day free trial** (`trial_period_days = 7`) for new accounts that attach a card.

| Price (Stripe) | `plan_type` | Interval | Draft price | Scope |
| --- | --- | --- | --- | --- |
| Single — weekly | `single` | week | **$2 / week** | Entitles one `template_id`. |
| Single — monthly | `single` | month | **$5 / month** | Entitles one `template_id`. |
| Ultimate (All-Access) | `all_access` | month | **$30 / month** | Entitles every template (`template_id = null`). |

A user may hold several single subscriptions. Single-template subs carry the
`template_id` in subscription metadata so the webhook can resolve entitlement.
`plan_type` + `current_period_end` are what the entitlement gate uses; the weekly vs
monthly interval is only a Stripe price detail that determines the next `period_end`.

> **Margin note:** at $2, Stripe fees (~$0.30 + 2.9% ≈ $0.36) take ~18% of the charge.
> Acceptable for MVP; revisit low price points before scaling. Prices are draft and
> changed in the Stripe dashboard without code changes.

> **Trial note:** the 7-day trial is applied on the user's first subscription. Stripe
> trials require a subscription object (that's why all plans are recurring, not
> one-time purchases).
>
> "First" means **no prior row in `subscriptions` at all**, regardless of that row's
> status — active, canceled, incomplete, whatever. `POST /api/checkout` checks this
> before creating the Stripe session (`app/api/checkout/route.ts`) so that
> cancel-then-resubscribe cannot mint a fresh trial each time (`trialing` is an
> entitled status, so an unconditional trial would be a permanent free ride). The
> corollary: a card that fails 3DS mid-checkout still creates an `incomplete` row and
> permanently spends that user's trial eligibility — intentional (fails safe), but
> worth knowing for support.
>
> **Known residual gap:** the check is read-then-write, not an atomic claim. Two
> literally concurrent checkout requests from the same user before either webhook
> lands could both see "no prior row" and both get a trial. Narrow (requires
> deliberately simultaneous requests, not just clicking subscribe twice in sequence)
> and tracked as follow-up hardening — an atomic claim needs a dedicated column
> (e.g. `profiles.trial_claimed_at`), which is a schema change deliberately not
> bundled into this fix.

## Entitlement rule (used by the VAST gate)

A creative may serve its payload iff its owner has a subscription with
`status in (active, trialing)` and `current_period_end > now()` that covers the
creative's template:

```
covered = (plan_type = 'all_access')
       OR (plan_type = 'single' AND subscription.template_id = creative.template_id)
```

This boolean is **denormalized into the serving record** so the VAST path never
queries Stripe and never does a live join. See [architecture.md](architecture.md).

`private.is_entitled` is the one definition of this predicate in SQL, and
`lib/serving/entitlement.ts` is its port for the snapshot path. They must not drift:
`npm run check:entitlement` compares Postgres's own verdict against the TypeScript
over a matrix of statuses, periods and plan types, and is the gate that enforces it.

## Money flow

1. User clicks subscribe → **Stripe Checkout** session (server-created) with
   `subscription_data.trial_period_days = 7` on the first subscription.
2. Stripe redirects back; entitlement is **not** trusted from the redirect.
3. **Webhooks** drive all state changes (below). During trial, `status = trialing`
   counts as entitled.

## Webhooks — `/api/stripe/webhook` (source of truth)

- Verify the Stripe signature against the **raw** request body (Node runtime; do not
  let a framework parse/replace the body before verification).
- Handle at minimum:
  - `checkout.session.completed` → create/link subscription, set `stripe_customer_id`.
  - `customer.subscription.created|updated` → sync `status`, `current_period_end`,
    `cancel_at_period_end`, `template_id` (from metadata).
  - `customer.subscription.deleted` → mark `canceled`.
  - `invoice.payment_failed` → mark `past_due`.
- **The webhook must also republish the entitlement snapshot.** This used to be
  unnecessary: the serving record was a *live* view (`private.creative_serving`) that
  recomputed entitlement on read, so writing the `subscriptions` row was sufficient.
  Since [ADR-0015](decisions/0015-serving-snapshots-on-cdn.md) the serving path reads
  a CDN snapshot, so this handler is what makes a subscription change visible to the
  kill-switch.
  - It writes **one** document, `entitlement/<user_id>`, regardless of how many
    creatives the user owns.
  - A publish that fails **must not return 2xx**. The handler drops the now-stale
    document (which forces the correct-but-slower database fallback) and then throws,
    so the idempotency claim is rolled back and Stripe retries. Reporting success on a
    failed publish would leave the CDN serving the *previous* entitlement — which is
    exactly how a cancelled subscription keeps serving.
  - The snapshot stores `current_period_end`, not a boolean verdict, so entitlement
    still lapses on time even if no webhook arrives at all.
- **Kill-switch latency: ~60s response cache + up to 60s of Blob propagation**, so
  ~2 minutes worst case (it was ~1 minute when the view was read live).
- **Idempotent:** each event id is claimed in `public.stripe_events` before
  processing; a duplicate returns 200 without reprocessing, and a handler failure
  rolls back the claim so Stripe's retry can reprocess.

Implemented in [`app/api/stripe/webhook/route.ts`](../app/api/stripe/webhook/route.ts);
plans/price config + status mapping in [`lib/stripe.ts`](../lib/stripe.ts); checkout
session in [`app/api/checkout/route.ts`](../app/api/checkout/route.ts).

## Lifecycle → serving behavior

| Subscription state | VAST endpoint |
| --- | --- |
| `active` / `trialing`, not expired, covers template | serves interactive payload |
| `past_due` | serves empty/fallback (configurable grace period later) |
| `canceled` / expired (`current_period_end` passed) | serves empty/fallback |
| no covering subscription | serves empty/fallback |

## Security notes

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only env vars.
- Clients never write `subscriptions` (RLS read-only); only the webhook (service role)
  mutates entitlement. See [security.md](security.md).

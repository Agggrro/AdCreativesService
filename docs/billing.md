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
- After any change, **recompute and refresh the denormalized serving status** for all
  affected creatives so the kill-switch reacts promptly.
- Idempotent: dedupe by Stripe event id; webhooks can be redelivered.

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

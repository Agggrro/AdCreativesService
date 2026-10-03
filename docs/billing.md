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

`POST /api/checkout` reads the request's `templateId` for a single-template plan only,
and accepts it only as a UUID naming a **published** template, read on the caller's
session so RLS answers (`templates_select_published`): a non-UUID gets 400, a draft or
unknown UUID 404, and a failed read 503 — all before any Stripe call. Drafts are real
rows — a new template is seeded unpublished ahead of its deploy
([ADR-0024](decisions/0024-pick-message-template.md)) — so without this a signed-in user
could buy a subscription for a template nobody can configure, and a made-up id would
reach the `template_id` metadata key only to fail the webhook's upsert on every retry.
The button shows the dictionary's checkout error whatever the code; the API's `error`
strings are for logs, not for a buyer to read.

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
`status in (active, trialing)` and `current_period_end` either NULL ("no expiry") or
after `now()`, that covers the creative's template. NULL is what the webhook writes when
Stripe gives no period end, and such a row never lapses on the clock — only an event
moving its status does that:

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

- Verify the Stripe signature against the **raw** request body (do not let a
  framework parse/replace the body before verification), with `constructEventAsync`
  and SubtleCrypto — the one path that exists on both Node and a Cloudflare Worker
  ([ADR-0029](decisions/0029-off-vercel-onto-cloudflare-workers.md)). A failure is a
  400, logged with the check's own message (never the payload or the header).
- **The row is written from Stripe's current state, not the event's.** `created`,
  `updated`, `checkout.session.completed` and `invoice.payment_failed` fetch the
  subscription, write it, and fetch it again — writing once more if it moved meanwhile.
  A retry redelivers the object as it was when the event was created, and two handlers
  for one subscription can interleave, so the one that fetched first may write last.
  `deleted` is written from its payload: canceled is final, so it is right in any order,
  and a re-fetch can fail for good (a test clock's objects go with it).
- **A canceled row stays canceled** — a database trigger
  (`subscriptions_keep_canceled`, schema.sql) skips any update that would move it out.
  Stripe never revives a canceled subscription; a write that tries can only be an older
  view landing late, and it would put a cancelled tag back on air with the snapshot
  faithfully matching the row.
- **Every call is bounded** — Stripe 8 s and one retry; the database 10 s, and a timed-out
  read is not retried (the client renames the timeout so postgrest-js stops at once, and
  the webhook's own reads opt out of retries); KV over REST 4 s a try. The run's ceiling
  is Stripe's own 20 s — when Stripe stops waiting the Worker run is cancelled (it was
  60 s on Vercel). That sits well inside the two-minute claim timeout below, so a run
  cut off mid-way is taken over, never overlapped.
- **The endpoint** (test mode) is `we_1UMTD4RuVae2qc3x1gDiAHSD` →
  `https://creosmith.com/api/stripe/webhook`, the five events listed below. It was
  created for the Worker at the cutover (ADR-0029 §4), because Vercel keeps secrets
  write-only and the old one's could not be copied; its signing secret lives only in the
  Worker (`STRIPE_WEBHOOK_SECRET`). The Vercel-era endpoint `we_1TqK4CRuVae2qc3xdK2MFBKJ`,
  same URL and events, is **disabled, not deleted**: its secret is the one Vercel holds,
  so re-enabling it is part of a rollback. Both ran for the minutes of the switch — each
  event is delivered to every endpoint under the same id, so the claim ledger let
  whichever arrived first handle it and the other answer `Duplicate`.
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
  - A publish that fails **must not return 2xx**. Each store a publish missed clears
    its own copy before the error goes up — **fail closed**: with no entitlement
    document the serving path serves nothing for that user — and the handler throws,
    so the idempotency claim is rolled back and Stripe retries. Reporting success on
    a failed publish would leave a store serving the *previous* entitlement — which is
    exactly how a cancelled subscription keeps serving. A store whose put succeeded is
    left alone: it holds the one document that is right.
  - KV takes one write per second per key, and the events of one checkout arrive
    together: a write refused for that (429) is retried up to three times, a second
    and a random fraction apart; any other failure once. A clear is logged as
    `[snapshot-cleared]` — it means a subscriber's tags are dark until a publish lands.
  - A publish that cannot read the rows at all clears every store before it fails —
    the webhook's upsert has committed by then, so the copies are already stale. One
    whose facts keep changing writes the latest once more before it gives up.
  - When a store can neither take the write nor clear it (the same outage, the same
    limit), it keeps the previous document — logged as `[snapshot-stale]` — until a
    retry or **the reconciler** republishes it: `/api/cron/reconcile`, every ten minutes
    on the app's Worker, compares every snapshot
    changed in the last four days with Postgres and republishes what drifted. Postgres
    is right in all of these cases — the row is written before the snapshot.
  - The publish reads the subscriptions again after writing and republishes if they
    changed meanwhile, so two publishes that cross cannot leave the older one standing.
  - The snapshot stores `current_period_end`, not a boolean verdict, so entitlement
    still lapses on time even if no webhook arrives at all.
- **Kill-switch latency: ~60s response cache + up to 60s of snapshot propagation**
  (Workers KV's edge cache since ADR-0029, Blob's before), so ~2 minutes worst case
  (it was ~1 minute when the view was read live).
- **Idempotent:** each event id is claimed in `public.stripe_events` before
  processing and marked `processed_at` after it. Only a *processed* event is a
  duplicate (200, not reprocessed). A claim still in flight answers 409, so Stripe
  retries; a claim older than two minutes — twice the run's ceiling — was abandoned
  (the handler died, its rollback failed, or Stripe stopped waiting) and the next
  delivery takes it over and processes the event. Each run's rollback and processed
  mark match the claim instant it wrote, so a takeover and a straggler never touch
  each other's claim. Before `processed_at` existed, any of those answered
  "Duplicate" to every retry and a cancellation could be lost for good.
  Reprocessing is safe because every subscription handler re-fetches the
  subscription from Stripe. A handler failure still rolls the claim back at once.

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

**Conversion tracking is not entitlement-gated** ([ADR-0023](decisions/0023-conversion-postbacks.md)).
The click redirect `/r` and the postback endpoint `/pb` never read a subscription —
and never call Stripe. The kill-switch still bounds them: a lapsed account's tag
serves no payload, so it mints no new click links, and the links already in flight
stop recording after their 24-hour signature and stop redirecting (404) a week after
that.
Postbacks for clicks recorded while the account was entitled keep being accepted —
a network settles weeks later, and refusing a conversion the account already paid to
generate would only make its numbers wrong.

## Security notes

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only env vars.
- Clients never write `subscriptions` (RLS read-only); only the webhook (service role)
  mutates entitlement. See [security.md](security.md).

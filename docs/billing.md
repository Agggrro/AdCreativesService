# Billing

> Status: **closed beta — no billing provider.** Since 2026-11-03
> ([ADR-0034](decisions/0034-closed-beta-manual-entitlement.md)) access is granted by hand
> and Stripe is gone from the codebase. The entitlement rule, the snapshot and the
> kill-switch are unchanged; only who writes `subscriptions` changed.

## How access is granted

Terms are agreed in person — Telegram `@agggrro`, which every page links to from the
closed-beta strip and the account's `/dashboard/access` page. The admin (the accounts
named in `ADMIN_EMAILS`) then marks the account on `/dashboard/admin`:

- **Grant** inserts one row into `public.subscriptions`:
  `{plan_type: 'all_access', status: 'active', template_id: null, current_period_end: null,
  stripe_subscription_id: null}`. Idempotent — the action reads first, and the partial
  unique index `subscriptions_one_manual_grant_idx` turns a raced second insert into a
  23505 the action treats as success.
- **Revoke** sets every live row of that user with no `stripe_subscription_id` to
  `canceled`. An **update, never a delete**: the reconciler and the audit find users
  through `subscriptions.updated_at`, and a user with no rows would leave their window —
  a revoke whose publish and fail-closed clear both failed would then keep serving with
  no backstop. `subscriptions_keep_canceled` makes the cancellation final; a later grant
  is a new row beside it. Revoke asks for confirmation on the admin page.
- Rows that carry a `stripe_subscription_id` belong to a billing provider and are never
  written by the admin's actions. The list shows such an account as `subscription`, not
  `beta`.
- Both actions run on the caller's session (`getUser()`), gate on
  `isAdminEmail(user.email)` (`lib/admin.ts`) with a 404 for anyone else, shape-check the
  user id, write with the service role, and **then publish the entitlement snapshot** —
  `publishEntitlementSnapshot(userId)`, the same publish the webhook made. Postgres is
  written first; the snapshot is a projection.

Implemented in [`app/dashboard/admin/actions.ts`](../app/dashboard/admin/actions.ts);
the list in [`app/dashboard/admin/page.tsx`](../app/dashboard/admin/page.tsx); the
account's own view in [`lib/beta-access.ts`](../lib/beta-access.ts).

## Entitlement rule (used by the VAST gate)

A creative may serve its payload iff its owner has a subscription row with
`status in (active, trialing)` and `current_period_end` either NULL ("no expiry") or
after `now()`, that covers the creative's template. A manual grant is exactly such a row
with NULL expiry, so it never lapses on the clock; only a revoke ends it.

```
covered = (plan_type = 'all_access')
       OR (plan_type = 'single' AND subscription.template_id = creative.template_id)
```

This boolean is **denormalized into the serving record** so the VAST path never calls
anything and never does a live join. See [architecture.md](architecture.md).

`private.is_entitled` is the one definition of this predicate in SQL, and
`lib/serving/entitlement.ts` is its port for the snapshot path. They must not drift:
`npm run check:entitlement` compares Postgres's own verdict against the TypeScript
over a matrix of statuses, periods and plan types, and is the gate that enforces it.

## The snapshot publish — the same contract the webhook had

The serving path reads a CDN snapshot ([ADR-0015](decisions/0015-serving-snapshots-on-cdn.md)),
so a change to `subscriptions` is invisible to the kill-switch until the publish lands.

- One document per user, `entitlement/<user_id>`, however many creatives they own.
- **A publish that fails does not report success.** The store clears its own copy before
  the error goes up — **fail closed**: with no entitlement document the serving path
  serves nothing for that user — and the admin page shows "the row was written, the
  snapshot was not published". The reconciler (`/api/cron/reconcile`, every ten minutes)
  compares every snapshot of a user whose rows changed in the last four days with
  Postgres and republishes what drifted, so a granted row whose publish failed is on air
  within ten minutes, and a revoked row whose clear failed too is taken off air by the
  same pass — which is why a revoke updates the row instead of deleting it.
- The publish re-reads the rows after writing and republishes if they changed meanwhile,
  so two publishes that cross cannot leave the older one standing.
- The snapshot stores `current_period_end`, not a boolean verdict, so a row that does
  carry an expiry still lapses on time with no event at all.
- **Kill-switch latency: ~60s response cache + up to 60s of snapshot propagation**
  (Workers KV's edge cache), so ~2 minutes worst case.

## Lifecycle → serving behavior

| Row state | VAST endpoint |
| --- | --- |
| `active` / `trialing`, not expired, covers template | serves interactive payload |
| `past_due` | serves empty/fallback |
| `canceled` / expired (`current_period_end` passed) | serves empty/fallback |
| no covering row (never granted, or revoked) | serves empty/fallback |

**Conversion tracking is not entitlement-gated** ([ADR-0023](decisions/0023-conversion-postbacks.md)).
The click redirect `/r` and the postback endpoint `/pb` never read a subscription. The
kill-switch still bounds them: a revoked account's tag serves no payload, so it mints no
new click links, and the links already in flight stop recording after their 24-hour
signature and stop redirecting (404) a week after that. Postbacks for clicks recorded
while the account was entitled keep being accepted — a network settles weeks later.

## Security notes

- `ADMIN_EMAILS` names who may grant; it is not a secret and does not authenticate — the
  session does. Empty means nobody.
- Clients never write `subscriptions` (RLS read-only); only the admin's actions (service
  role) mutate entitlement. See [security.md](security.md).
- The admin page is the one dashboard surface that reads with the service role: emails
  live in `auth.users`, and the grants are other users' rows.

## What was here before

Until 2026-11-03 this document described Stripe Checkout, three recurring prices with a
7-day trial, the webhook `/api/stripe/webhook` as the source of truth with its claim
ledger `stripe_events`, and the Vercel-era endpoint. All of it is in git history before
ADR-0034; none of it runs. The Stripe columns on `profiles` and `subscriptions` remain,
nullable, so a provider's rows can land beside manual grants one day without a migration.

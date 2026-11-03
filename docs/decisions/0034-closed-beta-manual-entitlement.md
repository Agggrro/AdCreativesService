# 0034. Closed beta: entitlement granted by hand, Stripe disconnected

- Status: Accepted
- Date: 2026-11-03
- Amends: [0001](0001-tech-stack.md) (billing), [0008](0008-catalog-first-information-architecture.md) (the subscriptions surface), [0015](0015-serving-snapshots-on-cdn.md) (who publishes the entitlement snapshot)

## Context

The product enters a closed beta. Terms are agreed with each participant in person — the
owner's Telegram, `@agggrro` — and there is no price list to put behind a checkout. Stripe
had been wired end to end (Checkout, a webhook that mirrored subscriptions into
`public.subscriptions`, a trial rule, an idempotency ledger) and had never taken a real
payment: the one endpoint was in test mode.

What the beta needs is the opposite shape: anyone may register, nobody pays on the site,
and one person switches interactive delivery on per account. The kill-switch that
subscriptions existed to drive — a tag serves the interactive payload only while its
owner is entitled ([ADR-0003](0003-access-control-over-code-hiding.md)) — has to keep
working exactly as it does, because it is the product's access control.

## Decision

**Stripe is removed from the codebase**, not disabled: `lib/stripe.ts`, `/api/checkout`,
`/api/stripe/webhook`, the subscribe buttons, the package, its env vars and the Worker
secrets. The `stripe_events` ledger is dropped. The history is in git; bringing a billing
provider back is a new integration against the same `subscriptions` table, not a revert.

**A closed-beta participant is a row in `subscriptions`:** `plan_type = 'all_access'`,
`status = 'active'`, `template_id` null, `current_period_end` null, and no
`stripe_subscription_id`. Nothing about the entitlement predicate changes —
`private.is_entitled` and its port `lib/serving/entitlement.ts` read exactly these four
facts, and a row with no period end is one that never lapses on the clock, which is what
"granted by hand" means. The snapshot shape, `SNAPSHOT_SCHEMA_VERSION`, the drift gate
(`check:entitlement`), the reconciler, the audit and the backfill are untouched, and the
serving path cannot tell a manual grant from a paid subscription. That is the point: the
hot path is the one part of the product that must not learn a new rule for a temporary
phase.

**The one writer is the admin.** `/dashboard/admin` lists every registered account
(`auth.admin.listUsers`, which no client role can read) and offers one row action: grant
or revoke. Both are server actions that gate on the caller's email against `ADMIN_EMAILS`
— a plain variable, not a secret, because it names the account rather than
authenticating it; the session does that — and answer 404 to anyone else, the same rule
as the developer-only surfaces. Grant inserts the row (a partial unique index,
`subscriptions_one_manual_grant_idx`, makes a raced second insert a no-op rather than a
twin). Revoke marks the manual rows **`canceled` — an update, never a delete.** The first
draft deleted them, and review caught why that is wrong: the reconciler and the audit
find the users they check through `subscriptions.updated_at`, so a user whose rows are
gone leaves their window, and a revoke whose publish *and* fail-closed clear both failed
(one KV outage covers both) would leave an entitled document on air with nothing left to
repair it. A cancelled row bumps `updated_at`, keeps the user in the window, and
`subscriptions_keep_canceled` makes the cancellation final — so a later grant is a new row
beside the dead one, exactly as a resubscription was. Rows that carry a
`stripe_subscription_id` are never touched: they are a billing provider's, and this
action is not its writer. Each action then calls `publishEntitlementSnapshot`, the same
publish the webhook made, with the same fail-closed contract: a publish that fails clears
the store's copy, the admin is told the snapshot did not land, and the reconciler
republishes the row within ten minutes. Revoke goes through the destructive
confirmation (design-system §6): a re-grant restores access, not the impressions a
running campaign lost while the tag served nothing.

**Why not a flag on `profiles`.** `profiles_update_own` lets a user update any column of
their own row, so a `beta_member` column there would be self-settable — fixable with a
column-level revoke, but then a second table or a second predicate branch would have to
carry it into the serving snapshot, which means a schema version bump, a backfill and a
change to the one predicate the drift gate guards. `subscriptions` is already
client-read-only, already projected into the snapshot, and already what the gate reads.

**What the user sees.** A `Closed beta` strip under the top bar on every page, pointing at
Telegram, hidden only for a signed-in participant (docs/design-system.md §6 "Site
strip"). `/dashboard/subscriptions` becomes `/dashboard/access` (the old address
redirects): the account's own status and the same Telegram link. The catalog page loses
its single-template subscribe buttons; the landing copy no longer promises a trial. The
`Serving / Not serving` badges keep their meaning — they always read the gate, never the
billing state.

## Consequences

- Entitlement is granted by a person, so there is no trial, no renewal and no lapse by
  calendar unless the admin writes a `current_period_end`. Revocation is the only
  kill-switch, and it propagates as before: ~60 s of response cache plus up to 60 s of KV
  propagation.
- `subscriptions` keeps its Stripe columns, nullable, and its `canceled`-is-final trigger.
  A provider's rows and manual rows can coexist, and the admin list shows an account
  entitled by a provider's row as `subscription`, not `beta`, so revoking never claims to
  switch off something it does not touch.
- The reconciler's four-day window was sized to Stripe's retry period; it stays, since it
  bounds the audit either way.
- `billing-integrity-reviewer` now reviews this grant path: one writer, publish after
  write, fail closed, nothing granted from a client claim.
- The `ADMIN_EMAILS` variable is a deployment setting (`wrangler.jsonc` `vars`,
  `.env.local`); empty means nobody is an admin. **Every address in it must already be a
  registered account**: the protection rests on Supabase Auth keeping emails unique, and
  an address listed before anyone registers it belongs to whoever registers it first. A
  signed-out caller of the admin page or its actions is sent to `/login` by the dashboard's
  own rule; a signed-in non-admin gets the 404.
- `profiles.stripe_customer_id` stays, unused — and `profiles_update_own` lets its owner
  set it. A billing provider that returns must not resolve customer → user through a
  client-writable column; revoke the column update (or drop the column) when that day
  comes.
- Leaving the beta means a billing integration that writes the same table, and a
  decision about what happens to the manual rows then. Neither is designed here.

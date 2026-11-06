import { createServiceClient } from "@/lib/supabase/service";
import { getDict } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/admin";
import { adminErrorMessage } from "@/lib/admin-errors";
import { hasAllAccess, isLive, type AccessRow } from "@/lib/beta-access";
import { AccountsTable, type AccountRow } from "@/components/AccountsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice, Panel } from "@/components/ui/Field";
import { DashboardShell } from "@/components/DashboardShell";

/**
 * The closed-beta admin page (ADR-0034): every registered account, and the
 * mark that opens interactive delivery for one.
 *
 * Gated on the signed-in user's email against `ADMIN_EMAILS` (lib/admin.ts),
 * answering 404 to anyone else. Behind the gate it reads with the service role
 * — the one place in the dashboard that does, listed in docs/security.md —
 * because the facts it shows are not the caller's own: the emails live in
 * `auth.users`, which no client role can read, and the grants are other
 * users' `subscriptions` rows, which RLS scopes to their owners.
 */

/** Accounts per page of `auth.admin.listUsers`; the loop stops at a short page. */
const PAGE_SIZE = 200;
/** A ceiling, not a target: the beta is tens of accounts, not thousands. */
const MAX_PAGES = 25;

async function listAccounts(service: ReturnType<typeof createServiceClient>) {
  const users: { id: string; email: string; created_at: string; last_sign_in_at: string | null }[] =
    [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    // Stop on an empty page, not a short one: GoTrue may cap `per_page` below
    // PAGE_SIZE, and a short first page would then end the loop with the list
    // silently truncated. One extra request is the price of never doing that.
    if (data.users.length === 0) break;
  }
  return users;
}

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminUser();

  const { locale, dict } = await getDict();
  const sp = await searchParams;
  const actionError = adminErrorMessage(dict, sp.error);

  const service = createServiceClient();
  let rows: AccountRow[] | null = null;
  try {
    const [users, { data: subs, error: subsError }] = await Promise.all([
      listAccounts(service),
      // Only rows the predicate could accept; `isLive` handles expiry.
      service
        .from("subscriptions")
        .select("user_id, plan_type, status, current_period_end, created_at, stripe_subscription_id")
        .in("status", ["active", "trialing"]),
    ]);
    if (subsError) throw new Error(`subscriptions read failed: ${subsError.message}`);

    // Manual grants and a provider's rows judged separately: the mark is
    // "beta" only when a live manual all-access row carries it, so revoking
    // never claims to switch off something the grant action does not touch.
    // A provider's row counts whatever its plan — a single-template
    // subscription entitles too, just not everywhere.
    const manual = new Map<string, AccessRow[]>();
    const external = new Map<string, AccessRow[]>();
    for (const s of subs ?? []) {
      const bucket = s.stripe_subscription_id === null ? manual : external;
      const list = bucket.get(s.user_id) ?? [];
      list.push(s);
      bucket.set(s.user_id, list);
    }
    const now = new Date();
    rows = users
      .map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        access: hasAllAccess(manual.get(u.id) ?? [], now)
          ? ("beta" as const)
          : (external.get(u.id) ?? []).some((row) => isLive(row, now))
            ? ("subscription" as const)
            : ("none" as const),
      }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (err) {
    // Surfaced, not swallowed: an empty list from a failed read would tell the
    // admin nobody has signed up.
    console.error("[beta-access] account list unavailable", { err: String(err) });
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <PageHeader title={dict.admin.title} />

        {actionError && <Notice tone="dead">{actionError}</Notice>}
        {rows === null && <Notice tone="dead">{dict.admin.errorList}</Notice>}

        {rows && rows.length > 0 && (
          <AccountsTable rows={rows} dict={dict} locale={locale} />
        )}
        {rows && rows.length === 0 && (
          <Panel className="p-6">
            <p className="type-small text-fg-muted">{dict.admin.empty}</p>
          </Panel>
        )}

        {rows && rows.length > 0 && (
          <p className="type-caption text-fg-muted">{dict.admin.propagation}</p>
        )}
      </div>
    </DashboardShell>
  );
}

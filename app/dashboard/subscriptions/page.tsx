import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG, statusTone } from "@/lib/i18n/dictionaries";
import { SubscribeButton } from "@/components/SubscribeButton";
import { Notice, Panel } from "@/components/ui/Field";
import { StateBadge } from "@/components/ui/State";
import {
  CELL,
  HEAD,
  ROW,
  TableFrame,
  TableHead,
  railCell,
} from "@/components/ui/Table";

/**
 * What the badge should say, rather than what Stripe last told us. A row can sit
 * at `active` in our mirror while its period has already passed — a late or
 * missed webhook — and `/api/vast` is already serving empty. Show the state the
 * gate actually applies, not the stale one.
 */
function effectiveStatus(s: {
  status: string;
  current_period_end: string | null;
}): string {
  const entitled = s.status === "active" || s.status === "trialing";
  const expired =
    s.current_period_end !== null &&
    new Date(s.current_period_end) <= new Date();
  return entitled && expired ? "past_due" : s.status;
}

/** Billing lives on its own surface (ADR-0008) — it is not daily work. */
export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const { locale, dict } = await getDict();

  const [{ data: subs }, { data: templates }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, plan_type, template_id, status, current_period_end, cancel_at_period_end",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("templates")
      .select("id, name")
      .eq("is_published", true)
      .order("name"),
  ]);

  const templateName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(LOCALE_TAG[locale], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="type-h2">{dict.dashboard.subscriptions}</h1>
        <p className="type-small max-w-[66ch] text-fg-secondary">
          {dict.dashboard.subscriptionsSubtitle}
        </p>
      </div>

      {/* Says payment was received, never that entitlement is granted — the
          webhook is the source of truth and may not have landed yet. */}
      {sp.checkout === "success" && (
        <Notice tone="info">{dict.dashboard.checkoutSuccess}</Notice>
      )}
      {sp.checkout === "cancelled" && (
        <Notice tone="info">{dict.dashboard.checkoutCancelled}</Notice>
      )}

      {subs && subs.length > 0 ? (
        <TableFrame>
          <table className="w-full border-collapse type-small">
            <TableHead>
              <th className={HEAD}>{dict.dashboard.plan}</th>
              <th className={HEAD}>{dict.dashboard.period}</th>
              <th className={HEAD}>{dict.dashboard.status}</th>
            </TableHead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className={ROW}>
                  {/*
                    The rail reads `effectiveStatus`, the same value as the state
                    word in the last cell. Reading `s.status` here — the raw
                    Stripe mirror — put a green `live` rail beside a red PAST DUE
                    word on exactly the row `effectiveStatus` exists for: a stale
                    mirror whose period has already passed. Two forms disagreeing
                    about one fact is what §11's "state encoded in form as well as
                    colour" forbids, and on a billing screen the rail was painting
                    the reassuring one while `/api/vast` served empty.
                  */}
                  <td className={railCell(statusTone(effectiveStatus(s)))}>
                    <span className="type-small font-medium">
                      {s.plan_type === "all_access"
                        ? dict.dashboard.planUltimate
                        : `${dict.dashboard.planSingle} — ${
                            templateName.get(s.template_id ?? "") ??
                            dict.dashboard.template
                          }`}
                    </span>
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-fg-muted`}>
                    {s.current_period_end ? (
                      <>
                        {/* A cancelling subscription ENDS on that date — saying
                              "renews" would be the opposite of the truth. */}
                        <span>
                          {s.cancel_at_period_end
                            ? dict.dashboard.endsOn
                            : dict.dashboard.renews}{" "}
                        </span>
                        <span className="data-instr">
                          {formatDate(s.current_period_end)}
                        </span>
                      </>
                    ) : (
                      <span className="data-instr">—</span>
                    )}
                  </td>
                  <td className={`${CELL} whitespace-nowrap`}>
                    <StateBadge status={effectiveStatus(s)} dict={dict} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      ) : (
        <p className="type-small text-fg-muted">
          {dict.dashboard.noSubscriptions}
        </p>
      )}

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-1">
          <p className="type-h3">{dict.dashboard.ultimateTitle}</p>
          <p className="type-small text-fg-muted">
            {dict.dashboard.ultimateSubtitle}
          </p>
        </div>
        <SubscribeButton planKey="ultimate_monthly" variant="primary">
          {dict.dashboard.subscribe}
        </SubscribeButton>
      </Panel>

      <p className="type-small text-fg-muted">
        {dict.dashboard.singleTemplateHint}
      </p>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG, type Dict } from "@/lib/i18n/dictionaries";
import { CopyButton } from "@/components/CopyButton";
import { Panel } from "@/components/ui/Field";
import { ServingBadge } from "@/components/ui/State";

/**
 * The delivery strip reads left to right in the order the events can occur (§6):
 * a creative must be shown before it can be clicked.
 *
 * Two members, not six. ADR-0016 dropped start and the three quartiles — each was
 * a player-fired beacon reproducing a number the buyer's own DSP already reports.
 * Viewability stays out of this strip for the reason §6 gives: it is conditional
 * on the format, and a conditional metric inside a closed set reads as a broken
 * tile rather than a deliberate absence.
 */
const DELIVERY = [
  { key: "impressions", label: "impression", hint: null },
  // The qualifier is not decoration: this number is lower than the click count a
  // buyer's DSP reports, because it counts only the call-to-action that opened
  // the advertiser's URL. Left unexplained it reads as undercounting.
  { key: "clicks", label: "click", hint: "clicksHint" },
] as const satisfies readonly {
  key: string;
  label: keyof Dict["catalog"]["funnel"];
  hint: keyof Dict["dashboard"] | null;
}[];

export default async function CreativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const siteUrl = getSiteUrl();
  const { locale, dict } = await getDict();

  const [{ data: creative }, { data: overview, error: overviewError }] =
    await Promise.all([
    supabase
      .from("creatives")
      .select("id, name, selected_format, template_id, created_at, config_json")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("get_creative_overview"),
  ]);

  if (!creative) notFound();

  const { data: template } = await supabase
    .from("templates")
    .select("name, type")
    .eq("id", creative.template_id)
    .maybeSingle();

  const row = (overview ?? []).find((r) => r.creative_id === creative.id);
  const serving = row?.should_serve ?? false;
  // Same rule as the list: an unreachable aggregate reads as "not measurable",
  // never as zeros and a confident "not serving" (§6).
  const statsAvailable = !overviewError;
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);
  const percent = new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "percent",
    maximumFractionDigits: 2,
  });
  const tag = `${siteUrl}/api/vast?creative_id=${creative.id}`;
  const counts: Record<string, number> = {
    impressions: row?.impressions ?? 0,
    clicks: row?.clicks ?? 0,
    viewable: row?.viewable ?? 0,
  };
  // VPAID-only (ADR-0012): render as "not applicable to this format" rather
  // than a confident zero for every other format.
  const viewableApplicable = creative.selected_format === "vpaid";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/creatives"
        className="self-start text-[13px] text-fg-muted underline underline-offset-4 hover:text-fg"
      >
        {dict.dashboard.creatives}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">
            {creative.name ?? template?.name ?? dict.dashboard.template}
          </h1>
          <p className="text-[13px] text-fg-muted">
            {template?.name} ·{" "}
            <span className="data-instr uppercase">
              {creative.selected_format}
            </span>{" "}
            · {dict.dashboard.createdAt}{" "}
            <span className="data-instr">
              {new Date(creative.created_at).toLocaleDateString(
                LOCALE_TAG[locale],
                { day: "numeric", month: "short", year: "numeric" },
              )}
            </span>
          </p>
        </div>
        {statsAvailable ? (
          <ServingBadge
            serving={serving}
            label={serving ? dict.dashboard.serving : dict.dashboard.notServing}
            qualifier={serving ? undefined : dict.dashboard.notServingHint}
          />
        ) : (
          <span className="text-xs leading-4 text-fg-muted">
            {dict.dashboard.statsUnavailable}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="label-instr">{dict.dashboard.funnel}</h2>
        <div className="grid gap-px overflow-hidden rounded-ctl border border-hairline bg-hairline sm:grid-cols-3">
          {DELIVERY.map((step) => (
            <div key={step.key} className="flex flex-col gap-2 bg-surface p-4">
              <span className="label-instr">
                {dict.catalog.funnel[step.label]}
              </span>
              <span className="data-instr text-[22px] font-medium leading-7">
                {statsAvailable ? number.format(counts[step.key]) : "—"}
              </span>
              {step.hint && statsAvailable && (
                <span className="text-xs leading-4 text-fg-muted">
                  {dict.dashboard[step.hint]}
                </span>
              )}
            </div>
          ))}
          {/*
            The ratio closes the strip rather than sitting inside it (§6): the
            counts are a sequence of things that happened, this is a reading
            about them. Its qualifier names the denominator because impressions
            and viewable impressions give different numbers and an unlabelled
            percentage invites the reader to assume the worse one.
          */}
          <div className="flex flex-col gap-2 bg-surface p-4">
            <span className="label-instr">{dict.dashboard.ctr}</span>
            <span className="data-instr text-[22px] font-medium leading-7">
              {/* Not `0%` when nothing has been delivered — that would claim
                  nobody clicked. No denominator means not measurable yet. */}
              {statsAvailable && counts.impressions > 0
                ? percent.format(counts.clicks / counts.impressions)
                : "—"}
            </span>
            <span className="text-xs leading-4 text-fg-muted">
              {dict.dashboard.ctrOfImpressions}
            </span>
          </div>
        </div>
      </div>

{/*
        Viewability (ADR-0012) is deliberately its own strip, not a third
        delivery tile: it isn't part of the sequential, always-applicable
        delivery set (§6) — it's VPAID-only, self-reported, and structurally
        absent for SIMID. A SIMID row prints the em dash in `text-fg-disabled`
        (not the default `text-fg` the outage/unmeasurable dash above uses) so
        the two "—" readings stay visually distinct even without reading the
        caption.
      */}
      <div className="flex flex-col gap-2">
        <h2 className="label-instr">{dict.dashboard.viewabilityHeading}</h2>
        <Panel className="flex max-w-xs flex-col gap-2 p-4">
          <span className="label-instr">{dict.catalog.funnel.viewable}</span>
          {/*
            Colour and caption are driven by *applicability alone*, never by
            `statsAvailable`. §6 assigns the two dashes opposite meanings —
            `text-fg` for a transient page-wide outage, `text-fg-disabled` for a
            permanent row-specific absence — so keying the disabled tone off the
            outage made a VPAID creative's outage dash read as "never
            measurable", disagreeing with the delivery strip's outage dash four
            lines above, on the same screen, in the same outage. And a SIMID
            creative lost its caption exactly when the page-level banner was
            offering it the wrong explanation.
          */}
          <span
            className={`data-instr text-[22px] font-medium leading-7 ${
              viewableApplicable ? "text-fg" : "text-fg-disabled"
            }`}
          >
            {statsAvailable && viewableApplicable
              ? number.format(counts.viewable)
              : "—"}
          </span>
          <span className="text-xs leading-4 text-fg-muted">
            {viewableApplicable
              ? dict.dashboard.viewableSelfReported
              : dict.dashboard.viewableNotApplicable}
          </span>
        </Panel>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="label-instr">{dict.dashboard.vastTag}</h2>
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <code className="data-instr min-w-0 flex-1 truncate text-[13px] text-fg-secondary">
            {tag}
          </code>
          <CopyButton value={tag} />
        </Panel>
      </div>
    </div>
  );
}

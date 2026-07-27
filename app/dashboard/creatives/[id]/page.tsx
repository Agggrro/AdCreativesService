import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG, type Dict } from "@/lib/i18n/dictionaries";
import { CopyButton } from "@/components/CopyButton";
import { Panel } from "@/components/ui/Field";
import { ServingBadge } from "@/components/ui/State";

/** The funnel reads left to right in the order a player fires it (§6). */
const FUNNEL = [
  { key: "impressions", label: "impression" },
  { key: "starts", label: "start" },
  { key: "q25", label: "q25" },
  { key: "q50", label: "q50" },
  { key: "q75", label: "q75" },
  { key: "completes", label: "complete" },
] as const satisfies readonly {
  key: string;
  label: keyof Dict["catalog"]["funnel"];
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
  const tag = `${siteUrl}/api/vast?creative_id=${creative.id}`;
  const counts: Record<string, number> = {
    impressions: row?.impressions ?? 0,
    starts: row?.starts ?? 0,
    q25: row?.q25 ?? 0,
    q50: row?.q50 ?? 0,
    q75: row?.q75 ?? 0,
    completes: row?.completes ?? 0,
  };

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
          <span className="text-[11px] text-fg-muted">
            {dict.dashboard.statsUnavailable}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="label-instr">{dict.dashboard.funnel}</h2>
        <div className="grid gap-px overflow-hidden rounded-ctl border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-6">
          {FUNNEL.map((step) => (
            <div key={step.key} className="flex flex-col gap-2 bg-surface p-4">
              <span className="label-instr">
                {dict.catalog.funnel[step.label]}
              </span>
              <span className="data-instr text-[22px] font-medium leading-7">
                {statsAvailable ? number.format(counts[step.key]) : "—"}
              </span>
            </div>
          ))}
        </div>
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

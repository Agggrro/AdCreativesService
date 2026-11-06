import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { vastTagUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG, type Dict } from "@/lib/i18n/dictionaries";
import {
  formatAnswerPath,
  isClickField,
  parseConfigSchema,
} from "@/lib/config-schema";
import {
  hasClickIdMacro,
  isHttpUrl,
  TAG_CLICK_FIELD,
} from "@/lib/click-destination";
import { asJsonObject } from "@/lib/json";
import { UUID_RE } from "@/lib/uuid";
import { CopyButton } from "@/components/CopyButton";
import {
  conversionParts,
  REPORT_DAYS,
  type ExitLabel,
} from "@/components/ConversionReport";
import { vastErrorParts } from "@/components/VastErrorReport";
import { StatStrip, type StatTile } from "@/components/stats/StatStrip";
import { CreativeTabs } from "@/components/workspace/CreativeTabs";
import { MoreMenu } from "@/components/workspace/MoreMenu";
import { WorkspaceBar } from "@/components/workspace/WorkspaceBar";
import { buttonClass } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Container } from "@/components/ui/Container";
import { Notice } from "@/components/ui/Field";
import { ServingBadge } from "@/components/ui/State";
import { VIDEO_FORMAT } from "@/lib/vast-gen/kind";
import { supports } from "@/lib/vast-gen/spec";
import { declaredVersion } from "@/lib/vast-gen/validate";

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

/**
 * A VAST video creative's progress strip (ADR-0035): its own labelled strip,
 * not more tiles in the delivery one. Progress exists only for this kind, and a
 * metric that is structurally absent for some creatives does not belong inside
 * the closed delivery set (§6). Left to right in the order a player fires them,
 * closed by VTR over impressions — the denominator named, as for CTR.
 */
const PROGRESS = [
  { key: "starts", label: "start" },
  { key: "q25", label: "q25" },
  { key: "q50", label: "q50" },
  { key: "q75", label: "q75" },
  { key: "completes", label: "complete" },
] as const satisfies readonly { key: string; label: keyof Dict["dashboard"]["progressSteps"] }[];

/**
 * A creative's Stats: the other half of its workspace (docs/design-system.md §6,
 * "Workspace" and "Stats"; ADR-0038). Everything a returning owner opens a
 * creative for — delivery, viewability, errors, conversions — in one screen at
 * 1280×720, with the tag's *Copy* always in the bar; the long tables are one click
 * deeper, in place.
 */
export default async function CreativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Shape-checked before any database call, the house rule in
  // docs/security.md: junk in the URL costs a regex, not four failed queries.
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createServerSupabase();
  const { locale, dict } = await getDict();

  const [
    { data: creative },
    { data: overview, error: overviewError },
    { data: conversions, error: conversionsError },
    { data: goals, error: goalsError },
    { data: hasPostbackKey },
    { data: vastErrors, error: vastErrorsError },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, name, selected_format, template_id, created_at, config_json")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("get_creative_overview"),
    // Owner-checked inside the function: a foreign id reads as no rows, and
    // the creative lookup above has already 404'd it by then anyway.
    supabase.rpc("get_creative_conversions", {
      p_creative_id: id,
      p_days: REPORT_DAYS,
    }),
    // The same window per goal (ADR-0027), owner-checked the same way.
    supabase.rpc("get_creative_conversion_goals", {
      p_creative_id: id,
      p_days: REPORT_DAYS,
    }),
    // Read-only: whether this account has set up a postback at all. It gates
    // the missing-{click_id} warning, which would otherwise sit on every
    // creative of an account that never meant to track conversions.
    supabase.rpc("has_postback_key"),
    // VAST errors per code (ADR-0033), owner-checked inside like the two above.
    supabase.rpc("get_creative_errors", { p_creative_id: id }),
  ]);

  if (!creative) notFound();

  const isVideo = creative.selected_format === VIDEO_FORMAT;
  const videoVersion = isVideo ? declaredVersion(creative.config_json) : undefined;

  const [{ data: template }, { data: funnelRows, error: funnelError }] = await Promise.all([
    supabase
      .from("templates")
      .select("name, type, config_schema")
      .eq("id", creative.template_id)
      .maybeSingle(),
    // Progress is counted for VAST video creatives only (ADR-0035);
    // owner-checked inside, like the reads above.
    isVideo
      ? supabase.rpc("get_creative_video_funnel", { p_creative_id: id })
      : Promise.resolve({ data: null, error: null }),
  ]);
  const funnel = funnelRows?.[0];
  const funnelAvailable = isVideo && !funnelError;

  // The exits this creative actually has: click-destination fields with a
  // configured URL, in schema order (ADR-0023). A quiz's answer paths are
  // machine text, the same in both locales (§10); the tag-level link is copy.
  const config = asJsonObject(creative.config_json);
  const clickFields = parseConfigSchema(template?.config_schema)
    .fields.filter(isClickField)
    .filter((field) => isHttpUrl(config[field.name]));
  const exits: ExitLabel[] = clickFields.map((field) =>
    field.name === TAG_CLICK_FIELD
      ? { field: field.name, label: dict.conversions.mainExit, machine: false }
      : isVideo && field.name === "companionClickThroughUrl"
        ? { field: field.name, label: dict.conversions.companionExit, machine: false }
        : {
          field: field.name,
          label: field.block ? formatAnswerPath(field.block) : field.name,
          machine: true,
        },
  );
  // Named, not counted: a quiz can have fifteen exits, and "the link" in the
  // singular would send the owner looking for one.
  const exitsMissingMacro = hasPostbackKey
    ? exits.filter((exit) => !hasClickIdMacro(String(config[exit.field])))
    : [];

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
  const tag = vastTagUrl(creative.id);
  const counts: Record<string, number> = {
    impressions: row?.impressions ?? 0,
    clicks: row?.clicks ?? 0,
    viewable: row?.viewable ?? 0,
  };
  // Self-reported by a VPAID unit (ADR-0012), or reported by the player through
  // a VAST video creative's <ViewableImpression> from 4.0 (ADR-0035). Anything
  // else renders as "not applicable" rather than a confident zero.
  const videoViewable = isVideo && videoVersion !== undefined && supports(videoVersion, "viewableImpression");
  const viewableApplicable = creative.selected_format === "vpaid" || videoViewable;
  const viewableCaption =
    creative.selected_format === "vpaid"
      ? dict.dashboard.viewableSelfReported
      : videoViewable
        ? dict.dashboard.viewablePlayerReported
        : isVideo
          ? dict.dashboard.viewableNoVersion
          : dict.dashboard.viewableNotApplicable;

  const name = creative.name ?? template?.name ?? dict.dashboard.template;
  const formatLabel = isVideo
    ? videoVersion
      ? `VAST ${videoVersion}`
      : "—"
    : creative.selected_format;

  const conv = conversionParts({
    dict,
    locale,
    rows: conversions ?? [],
    goals: goals ?? [],
    available: !conversionsError && !goalsError,
    exits,
    exitsMissingMacro,
    editHref: `/dashboard/creatives/${creative.id}/edit`,
  });
  const errs = vastErrorParts({
    dict,
    locale,
    rows: vastErrors ?? [],
    available: !vastErrorsError,
  });

  const heading = (text: string) => <h2 className="label-instr">{text}</h2>;

  // Impressions → clicks, then the ratio that closes the strip (§6): the counts
  // are a sequence of things that happened, CTR is a reading about them, and its
  // caption names the denominator because impressions and viewable impressions
  // give different numbers.
  const delivery: StatTile[] = [
    ...DELIVERY.map((step) => ({
      key: step.key,
      label: dict.catalog.funnel[step.label],
      values: [statsAvailable ? number.format(counts[step.key]) : "—"],
      caption: step.hint && statsAvailable ? dict.dashboard[step.hint] : undefined,
    })),
    {
      key: "ctr",
      label: dict.dashboard.ctr,
      // Not `0%` when nothing has been delivered — that would claim nobody
      // clicked. No denominator means not measurable yet.
      values: [
        statsAvailable && counts.impressions > 0
          ? percent.format(counts.clicks / counts.impressions)
          : "—",
      ],
      caption: dict.dashboard.ctrOfImpressions,
    },
  ];

  // Viewability (ADR-0012) is its own reading, not a third delivery tile: it is
  // not part of the sequential, always-applicable delivery set (§6) — VPAID
  // reports it itself, a VAST video creative from 4.0 has the player report it
  // (ADR-0035), and it is structurally absent for SIMID. Colour and caption are
  // driven by *applicability alone*, never by `statsAvailable`: §6 gives the two
  // dashes opposite meanings — `text-fg` for a transient outage, `text-fg-disabled`
  // for a permanent, row-specific absence.
  const viewable: StatTile = {
    key: "viewable",
    label: dict.dashboard.viewable,
    values: [statsAvailable && viewableApplicable ? number.format(counts.viewable) : "—"],
    caption: viewableCaption,
    disabled: !viewableApplicable,
  };

  const progress: StatTile[] = isVideo
    ? [
        ...PROGRESS.map((step) => ({
          key: step.key,
          label: dict.dashboard.progressSteps[step.label],
          values: [funnelAvailable ? number.format(funnel?.[step.key] ?? 0) : "—"],
        })),
        {
          key: "vtr",
          label: dict.dashboard.vtr,
          // No impressions: not measurable yet, never 0%. And no ratio while the
          // impressions tile it is "of" shows a dash (§6).
          values: [
            statsAvailable && funnelAvailable && funnel && funnel.impressions > 0
              ? percent.format(funnel.completes / funnel.impressions)
              : "—",
          ],
          caption: dict.dashboard.vtrOfImpressions,
        },
      ]
    : [];

  const panels = [errs.panel, conv.exitsPanel].filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-dvh lg:flex-none">
      <h1 className="sr-only">{name}</h1>

      <WorkspaceBar
        back={
          <Link href="/dashboard/creatives" className={buttonClass("ghost", "sm", "pl-2")}>
            <ChevronLeft size={14} aria-hidden />
            {dict.dashboard.creatives}
          </Link>
        }
        title={
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
            <span className="min-w-0 max-w-full truncate type-small font-medium lg:max-w-56">
              {name}
            </span>
            <Chip>{formatLabel}</Chip>
            {statsAvailable && (
              <ServingBadge
                serving={serving}
                label={serving ? dict.dashboard.serving : dict.dashboard.notServing}
              />
            )}
          </div>
        }
        tabs={<CreativeTabs creativeId={creative.id} current="stats" dict={dict} />}
        actions={
          <>
            <MoreMenu creativeId={creative.id} creativeName={name} tag={tag} />
            {/* The one action of the screen, so the one accent (§3). Below `lg` it
                moves to the strip at the foot of the page. */}
            <CopyButton value={tag} size="sm" variant="primary" className="max-lg:hidden" />
          </>
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <Container width="wide" className="flex flex-col gap-6 py-6">
          {!statsAvailable && <Notice tone="dead">{dict.dashboard.statsUnavailable}</Notice>}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <StatStrip
              heading={heading(dict.dashboard.funnel)}
              tiles={delivery}
              className="grid-cols-1 sm:grid-cols-3"
            />
            <StatStrip
              heading={heading(dict.dashboard.viewabilityHeading)}
              tiles={[viewable]}
              className="grid-cols-1"
            />
            <StatStrip
              heading={heading(dict.vastErrors.heading)}
              tiles={[errs.tile]}
              className="grid-cols-1"
            />
          </div>

          {isVideo && (
            <StatStrip
              heading={heading(dict.dashboard.progress)}
              tiles={progress}
              className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
            />
          )}

          {errs.notice}
          {conv.strip}

          {panels.length > 0 && (
            <div
              className={`grid items-start gap-6 ${panels.length > 1 ? "lg:grid-cols-2" : ""}`}
            >
              {errs.panel}
              {conv.exitsPanel}
            </div>
          )}

          {conv.goalsPanel}
          {conv.dayPanel}
        </Container>
      </main>

      <div className="workspace-strip sticky bottom-0 z-10 border-t border-hairline bg-ground p-4 lg:hidden">
        <CopyButton value={tag} size="md" variant="primary" className="w-full" />
      </div>
    </div>
  );
}

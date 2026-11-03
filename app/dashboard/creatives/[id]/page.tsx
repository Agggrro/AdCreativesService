import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { vastTagUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG, type Dict } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
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
  ConversionReport,
  REPORT_DAYS,
  type ExitLabel,
} from "@/components/ConversionReport";
import { VastErrorReport } from "@/components/VastErrorReport";
import { LinkButton } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Field";
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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/creatives"
        className="self-start type-small text-fg-muted underline underline-offset-4 hover:text-fg"
      >
        {dict.dashboard.creatives}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="type-h2">
            {creative.name ?? template?.name ?? dict.dashboard.template}
          </h1>
          <p className="type-small text-fg-muted">
            {isVideo ? dict.dashboard.videoKind : template?.name} ·{" "}
            <span className="data-instr uppercase">
              {isVideo ? (videoVersion ? `VAST ${videoVersion}` : "—") : creative.selected_format}
            </span>{" "}
            · {dict.dashboard.createdAt}{" "}
            <span className="data-instr">{formatDate(locale, creative.created_at)}</span>
          </p>
        </div>
        {statsAvailable ? (
          <ServingBadge
            serving={serving}
            label={serving ? dict.dashboard.serving : dict.dashboard.notServing}
            qualifier={serving ? undefined : dict.dashboard.notServingHint}
          />
        ) : (
          <span className="type-caption text-fg-muted">
            {dict.dashboard.statsUnavailable}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="label-instr">{dict.dashboard.funnel}</h2>
        {/*
          A clipping parent would erase a 2px-offset focus ring (§2). Safe here
          and only here: every cell is a static metric readout with no focusable
          descendant. Put a control in one and the rounding moves to the cells.
        */}
        <div className="grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-3">
          {DELIVERY.map((step) => (
            <div key={step.key} className="flex flex-col gap-2 bg-surface p-4">
              <span className="label-instr">
                {dict.catalog.funnel[step.label]}
              </span>
              <span className="type-metric">
                {statsAvailable ? number.format(counts[step.key]) : "—"}
              </span>
              {step.hint && statsAvailable && (
                <span className="type-caption text-fg-muted">
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
            <span className="type-metric">
              {/* Not `0%` when nothing has been delivered — that would claim
                  nobody clicked. No denominator means not measurable yet. */}
              {statsAvailable && counts.impressions > 0
                ? percent.format(counts.clicks / counts.impressions)
                : "—"}
            </span>
            <span className="type-caption text-fg-muted">
              {dict.dashboard.ctrOfImpressions}
            </span>
          </div>
        </div>
      </div>

      {isVideo && (
        <div className="flex flex-col gap-2">
          <h2 className="label-instr">{dict.dashboard.progress}</h2>
          {/* Static readouts only, like the delivery strip, so the clipping
              parent cannot cut a focus ring (§2). */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-6">
            {PROGRESS.map((step) => (
              <div key={step.key} className="flex flex-col gap-2 bg-surface p-4">
                <span className="label-instr">{dict.dashboard.progressSteps[step.label]}</span>
                <span className="type-metric">
                  {funnelAvailable ? number.format(funnel?.[step.key] ?? 0) : "—"}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-2 bg-surface p-4">
              <span className="label-instr">{dict.dashboard.vtr}</span>
              <span className="type-metric">
                {/* No impressions: not measurable yet, never 0%. And no ratio
                    while the impressions tile it is "of" shows a dash (§6). */}
                {statsAvailable && funnelAvailable && funnel && funnel.impressions > 0
                  ? percent.format(funnel.completes / funnel.impressions)
                  : "—"}
              </span>
              <span className="type-caption text-fg-muted">{dict.dashboard.vtrOfImpressions}</span>
            </div>
          </div>
        </div>
      )}

      {/*
        Viewability (ADR-0012) is deliberately its own strip, not a third
        delivery tile: it isn't part of the sequential, always-applicable
        delivery set (§6) — VPAID reports it itself, a VAST video creative from
        4.0 has the player report it (ADR-0035), and it is structurally absent
        for SIMID. A SIMID row prints the em dash in `text-fg-disabled`
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
            className={`type-metric ${
              viewableApplicable ? "text-fg" : "text-fg-disabled"
            }`}
          >
            {statsAvailable && viewableApplicable
              ? number.format(counts.viewable)
              : "—"}
          </span>
          <span className="type-caption text-fg-muted">{viewableCaption}</span>
        </Panel>
      </div>

      <VastErrorReport
        dict={dict}
        locale={locale}
        rows={vastErrors ?? []}
        available={!vastErrorsError}
      />

      <div className="flex flex-col gap-2">
        <h2 className="label-instr">{dict.dashboard.vastTag}</h2>
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <code className="data-instr min-w-0 flex-1 truncate type-small text-fg-secondary">
            {tag}
          </code>
          <CopyButton value={tag} />
          {/* The validator fetches the live tag with its pixels held back
              (dry run), so checking it counts nothing. */}
          {isVideo && (
            <LinkButton href={`/tools/vast-validator?tag=${encodeURIComponent(tag)}`} variant="secondary">
              {dict.dashboard.checkInValidator}
            </LinkButton>
          )}
        </Panel>
      </div>

      {/* Last on the page: a report read after the tag is copied, and the one
          section here with tables long enough to push the tag out of view. */}
      {/* One reading, so one availability: a report whose goal split failed
          to load would otherwise show totals the missing table cannot
          explain, with nothing saying anything is missing. */}
      <ConversionReport
        dict={dict}
        locale={locale}
        rows={conversions ?? []}
        goals={goals ?? []}
        available={!conversionsError && !goalsError}
        exits={exits}
        exitsMissingMacro={exitsMissingMacro}
        editHref={`/dashboard/creatives/${creative.id}/edit`}
      />
    </div>
  );
}

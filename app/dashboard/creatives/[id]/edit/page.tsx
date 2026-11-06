import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { updateCreative } from "@/app/dashboard/creatives/actions";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { parseConfigSchema } from "@/lib/config-schema";
import { getDict } from "@/lib/i18n/server";
import { ConfiguratorWorkspace } from "@/components/configurator/ConfiguratorWorkspace";
import { DashboardShell } from "@/components/DashboardShell";
import { CopyButton } from "@/components/CopyButton";
import { CreativeTabs } from "@/components/workspace/CreativeTabs";
import { MoreMenu } from "@/components/workspace/MoreMenu";
import { Notice } from "@/components/ui/Field";
import { ChevronLeft } from "lucide-react";
import { WorkspaceBar } from "@/components/workspace/WorkspaceBar";
import { buttonClass } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ServingBadge } from "@/components/ui/State";
import { withNext } from "@/lib/safe-next";
import { UUID_RE } from "@/lib/uuid";
import { VideoTagGenerator } from "@/components/vast-gen/VideoTagGenerator";
import { configToDraft } from "@/components/vast-gen/draft";
import { updateVideoCreative } from "@/app/dashboard/creatives/video-actions";
import { getCdnUrl, vastTagUrl } from "@/lib/site";
import { VIDEO_FORMAT } from "@/lib/vast-gen/kind";
import { parseVideoConfig } from "@/lib/vast-gen/validate";

export default async function EditCreativePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const { dict } = await getDict();

  // RLS (`creatives_select_own`) already scopes this read to the caller.
  const { data: creative } = await supabase
    .from("creatives")
    .select("id, name, selected_format, template_id, config_json")
    .eq("id", id)
    .maybeSingle();
  if (!creative) notFound();

  // A VAST video creative (ADR-0035) is edited in the generator's own form, not
  // in the schema-driven one: its system template's config_schema names only
  // its two click fields.
  if (creative.selected_format === VIDEO_FORMAT) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // `serve` mode, as the ad path reads it: an optional part a hand-edited
    // config broke is dropped here as it is on air, rather than shown as an
    // error the form has no field for. The strict reading beside it counts
    // what that dropped, because saving this form makes the drop permanent.
    const parsed = parseVideoConfig(creative.config_json, { mode: "serve", ownerId: user?.id });
    if (!parsed.ok) {
      return (
        <DashboardShell>
          <div className="flex flex-col gap-3">
            <Notice tone="dead">{dict.vastGen.errStoredConfig}</Notice>
            <Link
              href={`/dashboard/creatives/${creative.id}`}
              className="type-small font-medium text-fg underline underline-offset-4"
            >
              {dict.vastGen.backToCreative}
            </Link>
          </div>
        </DashboardShell>
      );
    }
    const strict = parseVideoConfig(creative.config_json, { mode: "save", ownerId: user?.id });
    const droppedCount = strict.ok ? 0 : strict.issues.length;
    const { data: videoOverview, error: videoOverviewError } = await supabase.rpc("get_creative_overview");
    const videoServing =
      (videoOverview ?? []).find((r) => r.creative_id === creative.id)?.should_serve ?? false;
    const videoName = creative.name ?? parsed.config.adTitle;
    const videoTag = vastTagUrl(creative.id);
    return (
      <VideoTagGenerator
        mode="edit"
        heading={`${dict.vastGen.editTitle}: ${videoName}`}
        signedIn
        cdnUrl={getCdnUrl()}
        signInHref={withNext("/login", `/dashboard/creatives/${creative.id}/edit`)}
        action={updateVideoCreative}
        creativeId={creative.id}
        initialDraft={configToDraft(parsed.config, creative.name)}
        cancelHref={`/dashboard/creatives/${creative.id}`}
        notice={
          droppedCount > 0 ? (
            <Notice tone="warn">
              {dict.vastGen.editDroppedNotice.replace("{n}", String(droppedCount))}
            </Notice>
          ) : undefined
        }
        bar={
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
                  {videoName}
                </span>
                <Chip>{`VAST ${parsed.config.version}`}</Chip>
                {!videoOverviewError && (
                  <ServingBadge
                    serving={videoServing}
                    label={videoServing ? dict.dashboard.serving : dict.dashboard.notServing}
                  />
                )}
              </div>
            }
            tabs={<CreativeTabs creativeId={creative.id} current="settings" dict={dict} />}
            actions={
              <>
                <MoreMenu creativeId={creative.id} creativeName={videoName} tag={videoTag} />
                <CopyButton value={videoTag} size="sm" />
              </>
            }
          />
        }
      />
    );
  }

  const [{ data: template }, { data: overview, error: overviewError }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, supported_standards, config_schema")
      .eq("id", creative.template_id)
      .eq("is_published", true)
      .eq("in_catalog", true)
      .maybeSingle(),
    // The serving state for the bar: the same owner-scoped aggregate the list
    // reads, and absent rather than wrong when it is unreachable (§6).
    supabase.rpc("get_creative_overview"),
  ]);

  if (!template) {
    return (
      <DashboardShell>
        <div className="flex flex-col gap-3">
          <p className="type-small text-fg-muted">{dict.configurator.notFound}</p>
          <Link
            href="/dashboard/creatives"
            className="type-small font-medium text-fg underline underline-offset-4"
          >
            {dict.dashboard.creatives}
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const { fields, groups } = parseConfigSchema(template.config_schema);
  const message = creativeErrorMessage(dict, sp.error, sp.field);

  // Every field starts from its saved value; a field added to the schema
  // since this creative was built (never saved, so absent from config_json)
  // falls back to "" like a fresh form, not to the schema default.
  //
  // `select` is the one exception, and it is not cosmetic: a controlled <select>
  // whose value matches no <option> renders *blank*, and a required one then
  // blocks submit outright — so a creative saved before the field existed could
  // never be edited again until the user noticed an empty dropdown. It starts at
  // the schema default instead, which is what makes adding a required select to
  // a template a no-migration change.
  const savedConfig = (creative.config_json ?? {}) as Record<string, unknown>;
  const initialFieldValues: Record<string, string> = {};
  for (const field of fields) {
    const v = savedConfig[field.name];
    if (v !== undefined && v !== null) {
      initialFieldValues[field.name] = String(v);
    } else if (field.type === "select") {
      initialFieldValues[field.name] = String(
        field.default ?? field.options?.[0]?.value ?? "",
      );
    } else {
      initialFieldValues[field.name] = "";
    }
  }

  const row = (overview ?? []).find((r) => r.creative_id === creative.id);
  const serving = row?.should_serve ?? false;
  const tag = vastTagUrl(creative.id);

  return (
    <ConfiguratorWorkspace
      mode="edit"
      heading={`${dict.configurator.configureTitle}: ${creative.name ?? template.name}`}
      template={template}
      fields={fields}
      groups={groups}
      action={updateCreative}
      creativeId={creative.id}
      initialName={creative.name ?? ""}
      initialFormat={creative.selected_format}
      initialFieldValues={initialFieldValues}
      message={message}
      tabs={<CreativeTabs creativeId={creative.id} current="settings" dict={dict} />}
      state={
        overviewError ? undefined : (
          <ServingBadge
            serving={serving}
            label={serving ? dict.dashboard.serving : dict.dashboard.notServing}
          />
        )
      }
      moreMenu={
        <MoreMenu
          creativeId={creative.id}
          creativeName={creative.name ?? template.name}
          tag={tag}
        />
      }
      copyTag={<CopyButton value={tag} size="sm" />}
    />
  );
}

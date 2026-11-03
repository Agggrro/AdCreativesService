import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { LinkButton } from "@/components/ui/Button";
import { CreativesTable } from "@/components/CreativesTable";
import { Notice, Panel } from "@/components/ui/Field";
import { VIDEO_FORMAT } from "@/lib/vast-gen/kind";

export default async function MyCreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createServerSupabase();
  const { locale, dict } = await getDict();
  const sp = await searchParams;
  // Delete and duplicate both redirect back here with their error code.
  const actionError = creativeErrorMessage(dict, sp.error, undefined);

  const [
    { data: creatives },
    { data: templates },
    { data: overview, error: overviewError },
  ] =
    await Promise.all([
      supabase
        .from("creatives")
        // `version` is a VAST video creative's own (ADR-0035), for its format chip.
        .select("id, name, selected_format, template_id, created_at, version:config_json->>version")
        .order("created_at", { ascending: false }),
      supabase.from("templates").select("id, name"),
      // The only read path into creative_event_counters: an owner-scoped
      // aggregate (ADR-0008, ADR-0016). Three counts plus the two serving flags
      // per creative, one round trip.
      supabase.rpc("get_creative_overview"),
    ]);

  const templateName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const stats = new Map((overview ?? []).map((row) => [row.creative_id, row]));

  // If the aggregate is unreachable (the RPC not applied yet, a permission
  // change), say so. Rendering zeros and "not serving" would be a confident
  // lie about someone's live tags — an em dash means "not measurable" (§6).
  const statsAvailable = !overviewError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="type-h2">
            {dict.dashboard.creatives}
          </h1>
          <p className="type-small max-w-[66ch] text-fg-secondary">
            {dict.dashboard.creativesSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* The postback lives inside this section rather than in the top
              bar (ADR-0023): the bar is already full at 768px, and the page
              only exists to serve these creatives' conversion numbers. */}
          <LinkButton href="/dashboard/creatives/postback" variant="secondary">
            {dict.conversions.setUp}
          </LinkButton>
          {/* A plain video tag is built in the VAST generator rather than
              from a catalog tile (ADR-0035); secondary, so the page keeps one
              primary (§3). `resume`: an unfinished draft left in this browser
              — by a sign-up that came back signed out — is picked up here. */}
          <LinkButton href="/tools/vast-generator?resume=1" variant="secondary">
            {dict.dashboard.newVideo}
          </LinkButton>
          <LinkButton href="/catalog" variant="primary">
            {dict.dashboard.createCreative}
          </LinkButton>
        </div>
      </div>

      {overviewError && (
        <Notice tone="dead">{dict.dashboard.statsUnavailable}</Notice>
      )}

      {actionError && <Notice tone="dead">{actionError}</Notice>}

      {creatives && creatives.length > 0 ? (
        <CreativesTable
          rows={creatives.map((c) => {
            const row = stats.get(c.id);
            return {
              id: c.id,
              label: c.name ?? templateName.get(c.template_id) ?? "—",
              // Machine text, the same in both locales (§10): `VAST 4.2`, the
              // name the creative's page and the generator's well give it too.
              format:
                c.selected_format === VIDEO_FORMAT && typeof c.version === "string"
                  ? `VAST ${c.version}`
                  : c.selected_format,
              impressions: row?.impressions ?? 0,
              clicks: row?.clicks ?? 0,
              serving: row?.should_serve ?? false,
            };
          })}
          statsAvailable={statsAvailable}
          dict={dict}
          locale={locale}
        />
      ) : (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <p className="type-small text-fg-muted">
            {dict.dashboard.noCreatives}
          </p>
          <LinkButton href="/catalog" variant="secondary">
            {dict.dashboard.browseCatalog}
          </LinkButton>
        </Panel>
      )}
    </div>
  );
}

import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { isAdminEmail } from "@/lib/admin";
import { readOwnAccess } from "@/lib/beta-access";
import { AccessNotice } from "@/components/AccessNotice";
import { CreativesList } from "@/components/CreativesList";
import { DashboardShell } from "@/components/DashboardShell";
import { NewCreativeSheet, type SheetTemplate } from "@/components/NewCreativeSheet";
import { Notice, Panel } from "@/components/ui/Field";
import { VIDEO_FORMAT } from "@/lib/vast-gen/kind";

export default async function MyCreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const sp = await searchParams;
  // Delete and duplicate both redirect back here with their error code.
  const actionError = creativeErrorMessage(dict, sp.error, undefined);

  // The notice asks an account to write to the admin: a participant already has
  // access, and the admin is the one who grants it (ADR-0037). The read chains off
  // the session lookup but starts with the page's own queries, not before them —
  // two serial round trips ahead of every render is what this avoids.
  const accessNotice = supabase.auth
    .getUser()
    .then(async ({ data: { user } }) =>
      user && !isAdminEmail(user.email)
        ? !(await readOwnAccess(supabase, user.id)).granted
        : false,
    );

  const [
    showAccessNotice,
    { data: creatives },
    { data: templates },
    { data: overview, error: overviewError },
  ] = await Promise.all([
    accessNotice,
    supabase
      .from("creatives")
      // `version` is a VAST video creative's own (ADR-0035), for its format chip.
      .select("id, name, selected_format, template_id, created_at, version:config_json->>version")
      .order("created_at", { ascending: false }),
    // Every template, system ones included: a creative's label falls back to its
    // template's name, and a video creative's template is the system one. Only the
    // catalog's are offered in the new-creative sheet.
    supabase
      .from("templates")
      .select("id, name, description, type, supported_standards, in_catalog, is_published")
      .order("name"),
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

  // What the sheet offers: the catalog's published templates, then the VAST video
  // generator — a creative of a kind of its own, built in its own tool (ADR-0035).
  const offered: SheetTemplate[] = [
    ...(templates ?? [])
      .filter((t) => t.is_published && t.in_catalog)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        standards: t.supported_standards,
        href: `/dashboard/creatives/new?template=${t.id}`,
      })),
    {
      id: "vast-video",
      name: dict.dashboard.videoKind,
      description: dict.dashboard.videoDescription,
      type: "video",
      // Machine text, the same in both locales (§10).
      standards: ["VAST 2.0–4.3"],
      // `resume`: an unfinished draft left in this browser — by a sign-up that came
      // back signed out — is picked up there.
      href: "/tools/vast-generator?resume=1",
    },
  ];

  const sheet = <NewCreativeSheet templates={offered} autoOpen={sp.new === "1"} />;

  const rows = (creatives ?? []).map((c) => {
    const row = stats.get(c.id);
    return {
      id: c.id,
      label: c.name ?? templateName.get(c.template_id) ?? "—",
      // Machine text, the same in both locales (§10): `VAST 4.2`, the name the
      // creative's page and the generator's well give it too.
      format:
        c.selected_format === VIDEO_FORMAT && typeof c.version === "string"
          ? `VAST ${c.version}`
          : c.selected_format,
      impressions: row?.impressions ?? 0,
      clicks: row?.clicks ?? 0,
      serving: row?.should_serve ?? false,
    };
  });

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        {showAccessNotice && <AccessNotice dict={dict} />}

        {overviewError && <Notice tone="dead">{dict.dashboard.statsUnavailable}</Notice>}

        {actionError && <Notice tone="dead">{actionError}</Notice>}

        {rows.length > 0 ? (
          <CreativesList rows={rows} statsAvailable={statsAvailable} newCreative={sheet} />
        ) : (
          <>
            <h1 className="type-h2">{dict.dashboard.creatives}</h1>
            {/* Nothing to list yet: the one thing to do is the one button. */}
            <Panel className="flex flex-col items-center gap-6 p-12 text-center">
              <p className="type-h2">{dict.dashboard.noCreatives}</p>
              {sheet}
            </Panel>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { isAdminEmail } from "@/lib/admin";
import { readOwnAccess } from "@/lib/beta-access";
import { AccessNotice } from "@/components/AccessNotice";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
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
  ] =
    await Promise.all([
      accessNotice,
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
      {/* No subtitle under the title (ADR-0037), and no postback button: the
          postback is a row of the account menu. A plain video tag is built in the
          VAST generator rather than from a catalog tile (ADR-0035); secondary, so
          the page keeps one primary (§3). `resume`: an unfinished draft left in
          this browser — by a sign-up that came back signed out — is picked up
          here. Creation still starts at the catalog until the template picker
          replaces that path. */}
      <PageHeader
        title={dict.dashboard.creatives}
        actions={
          // `flex-wrap`: the two labelled buttons fill a 360px phone's whole
          // 320px gutter in Russian, with nothing to spare.
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href="/tools/vast-generator?resume=1" variant="secondary">
              {dict.dashboard.newVideo}
            </LinkButton>
            <LinkButton href="/catalog" variant="primary">
              {dict.dashboard.newCreative}
            </LinkButton>
          </div>
        }
      />

      {showAccessNotice && <AccessNotice dict={dict} />}

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
        <Panel className="p-6">
          <p className="type-small text-fg-muted">{dict.dashboard.noCreatives}</p>
        </Panel>
      )}
    </div>
  );
}

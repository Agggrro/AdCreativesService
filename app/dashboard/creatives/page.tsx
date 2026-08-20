import Link from "next/link";
import { Pencil } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCdnUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { CopyButton } from "@/components/CopyButton";
import { DeleteCreativeButton } from "@/components/DeleteCreativeButton";
import { buttonClass, LinkButton } from "@/components/ui/Button";
import { Notice, Panel } from "@/components/ui/Field";
import { ServingBadge } from "@/components/ui/State";
import { Chip } from "@/components/ui/Chip";
import {
  CELL,
  HEAD,
  NUM_HEAD,
  railCell,
  ROW,
  TableFrame,
  TableHead,
} from "@/components/ui/Table";

export default async function MyCreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createServerSupabase();
  const { locale, dict } = await getDict();
  const sp = await searchParams;
  const deleteError = creativeErrorMessage(dict, sp.error, undefined);

  const [
    { data: creatives },
    { data: templates },
    { data: overview, error: overviewError },
  ] =
    await Promise.all([
      supabase
        .from("creatives")
        .select("id, name, selected_format, template_id, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("templates").select("id, name"),
      // The only read path into creative_event_counters: an owner-scoped
      // aggregate (ADR-0008, ADR-0016). Three counts plus the two serving flags
      // per creative, one round trip.
      supabase.rpc("get_creative_overview"),
    ]);

  const templateName = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const stats = new Map((overview ?? []).map((row) => [row.creative_id, row]));
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);

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
        <LinkButton href="/catalog" variant="primary">
          {dict.dashboard.createCreative}
        </LinkButton>
      </div>

      {overviewError && (
        <Notice tone="dead">{dict.dashboard.statsUnavailable}</Notice>
      )}

      {deleteError && <Notice tone="dead">{deleteError}</Notice>}

      {creatives && creatives.length > 0 ? (
        <TableFrame>
          {/* `table-fixed` + the colgroup below pin every column's width to
              a constant: nothing here may resize when a cell's content
              changes state (e.g. the copy button's icon), which is what
              was making the whole table visibly shift underneath the user.
              `TableFrame`, not `Panel`: `Panel` is `overflow-hidden` and
              would clip the focus ring on the new edge-adjacent action
              buttons (docs/design-system.md §2). */}
          <table className="w-full table-fixed border-collapse type-small">
            <colgroup>
              <col />
              <col className="w-[88px]" />
              <col className="w-[120px]" />
              <col className="w-[80px]" />
              <col className="w-[132px]" />
              <col className="w-[190px]" />
              <col className="w-[260px]" />
            </colgroup>
            <TableHead>
                <th className={HEAD}>{dict.dashboard.creativeName}</th>
                <th className={HEAD}>{dict.dashboard.format}</th>
                {/* Impressions and clicks only. Viewability is VPAID-only, and
                    this list mixes formats — a column that is structurally N/A
                    for some rows would print a ragged em dash with nowhere to
                    put the qualifier §6 requires. It lives on the detail page,
                    in its own strip. */}
                <th className={NUM_HEAD}>{dict.dashboard.impressions}</th>
                <th className={NUM_HEAD}>{dict.dashboard.clicks}</th>
                <th className={HEAD}>{dict.dashboard.status}</th>
                <th className={HEAD}>{dict.dashboard.vastTag}</th>
                <th className={HEAD} />
            </TableHead>
            <tbody>
              {creatives.map((c) => {
                const tag = `${getCdnUrl()}/v?creative_id=${c.id}`;
                const row = stats.get(c.id);
                const serving = row?.should_serve ?? false;
                const label = c.name ?? templateName.get(c.template_id) ?? "—";
                return (
                  <tr key={c.id} className={ROW}>
                    <td
                      className={railCell(
                        statsAvailable ? (serving ? "live" : "dead") : null,
                      )}
                    >
                      <Link
                        href={`/dashboard/creatives/${c.id}`}
                        className="type-small font-medium underline-offset-4 hover:underline"
                      >
                        {label}
                      </Link>
                    </td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      <Chip>{c.selected_format}</Chip>
                    </td>
                    {/* A zero is a real reading; the em dash appears only
                        when the aggregate itself is unavailable (§6). */}
                    <td className={`${CELL} data-instr text-right`}>
                      {statsAvailable ? number.format(row?.impressions ?? 0) : "—"}
                    </td>
                    <td className={`${CELL} data-instr text-right`}>
                      {statsAvailable ? number.format(row?.clicks ?? 0) : "—"}
                    </td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {statsAvailable ? (
                        <ServingBadge
                          serving={serving}
                          label={
                            serving
                              ? dict.dashboard.serving
                              : dict.dashboard.notServing
                          }
                        />
                      ) : (
                        <span className="chip-instr text-fg-muted">
                          —
                        </span>
                      )}
                    </td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {/* No truncated tag preview here: at any column width
                          that still leaves room for the rest of the row, a
                          truncated "https://…/api/vast?creative_id=" shows
                          only the part every row shares and cuts off before
                          the id that actually tells rows apart — it read as
                          a URL and nothing more. Full value is a hover away
                          on this wrapper, and in full on the creative's own
                          page (the row's name links there). */}
                      <div title={tag} className="inline-flex">
                        <CopyButton value={tag} size="sm" />
                      </div>
                    </td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {/* Edit and Delete keep visible words, same as Copy: a
                          screenshot of the icon-only version this table
                          shipped with showed all three reduced to
                          indistinguishable specks in practice, even at a
                          correctly-rendered 18px — confirmed via DevTools,
                          not just eyeballed. No action in this row goes
                          icon-only anymore. */}
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/dashboard/creatives/${c.id}/edit`}
                          className={buttonClass("secondary", "sm")}
                        >
                          <Pencil size={14} aria-hidden />
                          {dict.dashboard.edit}
                        </Link>
                        <DeleteCreativeButton
                          creativeId={c.id}
                          creativeName={label}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
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

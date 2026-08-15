import Link from "next/link";
import { Pencil } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { getDict } from "@/lib/i18n/server";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { CopyButton } from "@/components/CopyButton";
import { LinkButton } from "@/components/ui/Button";
import { Notice, Panel } from "@/components/ui/Field";
import { RAIL, ServingBadge } from "@/components/ui/State";
import { Chip } from "@/components/ui/Chip";
import { CELL, HEAD, NUM_HEAD, ROW } from "@/components/ui/Table";

export default async function MyCreativesPage() {
  const supabase = await createServerSupabase();
  const siteUrl = getSiteUrl();
  const { locale, dict } = await getDict();

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
      // The only read path into creative_events: an owner-scoped aggregate
      // (ADR-0008). Six counts per creative, one round trip.
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
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">
            {dict.dashboard.creatives}
          </h1>
          <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
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

      {creatives && creatives.length > 0 ? (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-hairline">
                  <th className={HEAD}>{dict.dashboard.creativeName}</th>
                  <th className={HEAD}>{dict.dashboard.format}</th>
                  <th className={NUM_HEAD}>{dict.dashboard.impressions}</th>
                  <th className={NUM_HEAD}>{dict.dashboard.starts}</th>
                  <th className={NUM_HEAD}>{dict.dashboard.completes}</th>
                  <th className={HEAD}>{dict.dashboard.status}</th>
                  <th className={HEAD}>{dict.dashboard.vastTag}</th>
                  <th className={HEAD} />
                  <th className={HEAD} />
                </tr>
              </thead>
              <tbody>
                {creatives.map((c) => {
                  const tag = `${siteUrl}/api/vast?creative_id=${c.id}`;
                  const row = stats.get(c.id);
                  const serving = row?.should_serve ?? false;
                  const label = c.name ?? templateName.get(c.template_id) ?? "—";
                  return (
                    <tr key={c.id} className={ROW}>
                      <td
                        className={`${CELL} border-l-[3px] pl-[13px] ${
                          statsAvailable
                            ? RAIL[serving ? "live" : "dead"]
                            : "border-l-transparent"
                        }`}
                      >
                        <Link
                          href={`/dashboard/creatives/${c.id}`}
                          className="text-[13px] font-medium underline-offset-4 hover:underline"
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
                        {statsAvailable ? number.format(row?.starts ?? 0) : "—"}
                      </td>
                      <td className={`${CELL} data-instr text-right`}>
                        {statsAvailable ? number.format(row?.completes ?? 0) : "—"}
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
                          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                            —
                          </span>
                        )}
                      </td>
                      <td className={`${CELL} max-w-[30ch]`}>
                        <span
                          title={tag}
                          className="data-instr block truncate text-[13px] text-fg-secondary"
                        >
                          {tag}
                        </span>
                      </td>
                      <td className={`${CELL} whitespace-nowrap text-right`}>
                        <CopyButton value={tag} />
                      </td>
                      <td className={`${CELL} whitespace-nowrap text-right`}>
                        <LinkButton href={`/dashboard/creatives/${c.id}/edit`} variant="secondary">
                          <Pencil size={14} aria-hidden /> {dict.dashboard.edit}
                        </LinkButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <p className="text-[13px] text-fg-muted">
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

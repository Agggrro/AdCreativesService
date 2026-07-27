import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { templateSlug } from "@/lib/template-demo";
import { Chip } from "@/components/ui/Chip";

export type CatalogTemplate = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  supported_standards: string[];
};

/**
 * The one grid in the product (docs/design-system.md §6): a template carries no
 * state, so there is no rail to draw and nothing to encode in a table row. Used
 * full-length on /catalog and at teaser length on the landing page.
 *
 * Deliberately static — no live unit inside a tile. VPAID units share the
 * `window.getVPAIDAd` global, so a grid of running mechanics renders the wrong
 * one, not merely a slow one. The live demo lives on the detail page.
 */
export function CatalogGrid({
  templates,
  dict,
  limit,
}: {
  templates: CatalogTemplate[];
  dict: Dict;
  limit?: number;
}) {
  const shown = limit ? templates.slice(0, limit) : templates;

  if (shown.length === 0) {
    return <p className="text-[13px] text-fg-muted">{dict.catalog.empty}</p>;
  }

  // No `overflow-hidden` on the container: it would clip the 2px-offset focus
  // ring on every edge tile (docs/design-system.md §2). Corner cells round
  // themselves instead.
  return (
    <div className="grid gap-px rounded-ctl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((t) => (
        <Link
          key={t.id}
          href={`/catalog/${templateSlug(t.type)}`}
          className="flex flex-col gap-3 bg-surface p-5 transition-colors first:rounded-t-ctl last:rounded-b-ctl hover:bg-surface-sunken"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-[15px] font-semibold leading-[22px]">
              {t.name}
            </h3>
            <p className="line-clamp-3 text-[13px] leading-5 text-fg-muted">
              {t.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.supported_standards.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

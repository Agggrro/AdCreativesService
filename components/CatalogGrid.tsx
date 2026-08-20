import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { templateSlug } from "@/lib/template-demo";
import { Chip } from "@/components/ui/Chip";
import { TemplatePreview } from "@/components/ui/TemplatePreview";

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
    return <p className="type-small text-fg-muted">{dict.catalog.empty}</p>;
  }

  // No `overflow-hidden` on the tile or the container: either would clip the
  // 2px-offset focus ring (docs/design-system.md §2). The preview rounds itself
  // instead of being clipped by its parent.
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((t) => (
        <Link
          key={t.id}
          href={`/catalog/${templateSlug(t.type)}`}
          className="flex flex-col gap-4 rounded-card border border-hairline bg-surface p-5 transition-colors duration-150 hover:bg-surface-2"
        >
          <TemplatePreview type={t.type} />
          <div className="flex flex-col gap-2">
            <h3 className="type-h3">{t.name}</h3>
            <p className="type-small line-clamp-3 text-fg-secondary">
              {t.description}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            {t.supported_standards.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

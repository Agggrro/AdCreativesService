"use client";

import { useState } from "react";
import { VpaidPreview } from "@/components/VpaidPreview";
import type { Dict } from "@/lib/i18n/dictionaries";

export type ShowcaseTemplate = {
  id: string;
  name: string;
  unitKey: string;
  config: Record<string, unknown>;
};

/**
 * The landing page's front door (docs/design-system.md §6, "Landing hero"):
 * one segmented switcher, one demo well. Restores the shape of the original
 * `/preview` page — visible player, buttons to switch templates, no click
 * required to see the mechanic — as the site's main landing rather than a
 * signed-out-only side page.
 *
 * Exactly one `VpaidPreview` is ever mounted: switching tabs changes `key`,
 * which unmounts the previous unit before the next one mounts. Two units
 * would fight over the single `window.getVPAIDAd` global.
 */
export function HeroShowcase({
  templates,
  dict,
  initialId,
}: {
  templates: ShowcaseTemplate[];
  dict: Dict;
  /** Preselects a tab for a legacy `/preview?t=` deep link (see app/preview). */
  initialId?: string;
}) {
  const [activeId, setActiveId] = useState(initialId ?? templates[0]?.id);
  const active = templates.find((t) => t.id === activeId) ?? templates[0];

  if (!active) return null;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={dict.catalog.heroSwitcher}
        className="inline-flex flex-wrap self-start rounded-ctl border border-line bg-surface"
      >
        {templates.map((t, i) => {
          const current = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              aria-pressed={current}
              className={`border-r border-hairline px-3 py-1.5 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.06em] transition-colors last:border-r-0 ${
                i === 0 ? "rounded-l-ctl" : ""
              } ${i === templates.length - 1 ? "rounded-r-ctl" : ""} ${
                current ? "bg-fill text-fg" : "text-fg-secondary hover:bg-fill"
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <VpaidPreview
        key={active.id}
        templateKey={active.unitKey}
        config={active.config}
        caption={dict.catalog.heroHint}
      />
    </div>
  );
}

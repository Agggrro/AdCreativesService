import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { chipType } from "@/components/ui/Chip";

/**
 * Settings | Stats — the two sections of a creative (docs/design-system.md §6,
 * "Workspace"). Links, not buttons: each section is its own address, so the back
 * button, a bookmark and a pasted URL all land where they should, and a section
 * is a server render of its own rather than a client toggle over data fetched
 * for both.
 *
 * Drawn as `Segmented` is — the same joined strip, the current segment on
 * `surface-2` and never the accent — because it is the same kind of choice among
 * peers (§6). `Segmented` itself is a button group with a change handler, which
 * is not what a navigation is.
 */
export function CreativeTabs({
  creativeId,
  current,
  dict,
}: {
  creativeId: string;
  current: "settings" | "stats";
  dict: Dict;
}) {
  const tabs = [
    {
      key: "settings",
      href: `/dashboard/creatives/${creativeId}/edit`,
      label: dict.workspace.settings,
    },
    {
      key: "stats",
      href: `/dashboard/creatives/${creativeId}`,
      label: dict.workspace.stats,
    },
  ] as const;

  return (
    <nav
      aria-label={dict.workspace.section}
      className="inline-flex rounded-ctl border border-line bg-surface"
    >
      {tabs.map((tab) => {
        const here = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={here ? "page" : undefined}
            className={`${chipType} border-r border-hairline px-3 py-2 transition-colors duration-150 first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 ${
              here ? "bg-surface-2 text-fg" : "text-fg-secondary hover:bg-surface-2"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

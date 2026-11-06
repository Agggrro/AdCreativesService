import { ChevronDown } from "lucide-react";

/**
 * The one collapsible panel (docs/design-system.md §6, "Disclosure"): native
 * `<details>`, so it needs no script, announces its state, and `summary` is already
 * in the global focus rule (§2). Open or closed is in the chevron's form as well as
 * in what is visible below it — it turns (§9).
 *
 * Two shapes of one element, so the two places that fold things cannot drift:
 *
 * - `panel` stands alone: a bordered box, titled in the label role. A creative's
 *   by-goal and by-day tables (§6, "Stats") and the postback's parameters and
 *   statuses.
 * - `fold` is a row of a stack inside a panel that already has its frame: the
 *   validator report's sections, a hairline between them, the title in the small
 *   body role.
 *
 * Neither is `overflow-hidden` — the summary's ring would be clipped. A panel's
 * content scrolls in a frame of its own below the summary (§5).
 */
export function Disclosure({
  title,
  note,
  variant = "panel",
  children,
}: {
  title: string;
  /** A line of explanation above the content; `panel` only. */
  note?: React.ReactNode;
  variant?: "panel" | "fold";
  children: React.ReactNode;
}) {
  const fold = variant === "fold";
  return (
    <details
      className={`group ${
        fold
          ? "border-b border-hairline last:border-b-0"
          : "rounded-panel border border-hairline bg-surface"
      }`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 transition-colors duration-150 hover:bg-surface-2 [&::-webkit-details-marker]:hidden ${
          fold
            ? "px-4 py-3"
            : "min-h-11 rounded-panel px-4 py-1.5 group-open:rounded-b-none"
        }`}
      >
        {fold ? (
          <span className="type-small font-medium">{title}</span>
        ) : (
          <h2 className="label-instr">{title}</h2>
        )}
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 text-fg-secondary transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      {fold ? (
        <div className="px-4 pb-4">{children}</div>
      ) : (
        <div className="border-t border-hairline">
          {note && <p className="max-w-prose px-4 py-3 type-caption text-fg-muted">{note}</p>}
          <div className="overflow-x-auto">{children}</div>
        </div>
      )}
    </details>
  );
}

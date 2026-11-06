"use client";

import { AlertCircle, Check } from "lucide-react";
import { RAIL, type Tone } from "@/components/ui/State";

/**
 * One entry of a workspace's outline (docs/design-system.md §6, "Workspace";
 * ADR-0038). The outline is the same thing in two shapes — a column from `lg`, a row
 * of chips below it — and the same thing in two screens: a creative's Settings and
 * the VAST generator. One implementation, so the two cannot drift on what a rail
 * means or on where the focus ring is drawn.
 */
export interface NavSection {
  id: string;
  label: string;
  /**
   * The state the rail reports: `live` for a section that is complete, `dead` for
   * one with something wrong in it, `idle` for one not yet complete; none for a
   * section with nothing to report. Colour is not the only channel (§11): a
   * complete section carries a check and a wrong one a mark, and both say it in
   * words to assistive technology through `status`.
   */
  tone?: Extract<Tone, "live" | "idle" | "dead">;
  /** Read after the label by assistive technology: the rail and the glyph are not text. */
  status?: string;
}

interface NavProps {
  /** The `nav` landmark's name. */
  label: string;
  sections: NavSection[];
  activeId: string;
  onSelect: (id: string) => void;
}

function Glyph({ tone, size }: { tone: NavSection["tone"]; size: number }) {
  if (tone === "live") return <Check size={size} aria-hidden className="shrink-0 text-live" />;
  if (tone === "dead") return <AlertCircle size={size} aria-hidden className="shrink-0 text-dead" />;
  return null;
}

/**
 * The column at the left from `lg`: 216px, rows of at least 44px with a 3px rail,
 * the current one on `surface-2` and never the accent. It scrolls by itself when a
 * short window cannot hold every row; the rows draw the focus ring inside (§2), so
 * the scroller does not clip it.
 */
export function OutlineNav({ label, sections, activeId, onSelect }: NavProps) {
  return (
    <nav
      aria-label={label}
      className="hidden w-[216px] shrink-0 flex-col overflow-y-auto border-r border-hairline py-3 lg:flex"
    >
      {sections.map((section) => {
        const on = section.id === activeId;
        return (
          <button
            key={section.id}
            type="button"
            aria-current={on ? "true" : undefined}
            onClick={() => onSelect(section.id)}
            // `pl-[13px]` and the 3px rail make the 16px inset the cells of a table
            // have, so the text of an outline row stands where a table's does (§6).
            className={`focus-inset flex min-h-11 shrink-0 items-center gap-2 border-b border-l-[3px] border-b-hairline py-2 pr-4 pl-[13px] text-left type-small transition-colors duration-150 ${
              section.tone ? RAIL[section.tone] : "border-l-transparent"
            } ${on ? "bg-surface-2 font-medium text-fg" : "text-fg-secondary hover:bg-surface-2"}`}
          >
            <span className="min-w-0 flex-1">{section.label}</span>
            <Glyph tone={section.tone} size={14} />
            {section.status && <span className="sr-only">{section.status}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The row of chips below `lg`, above the inspector. It scrolls sideways, and a
 * chip focused from the keyboard is brought flush to the scroller's edge, where a
 * ring drawn outside it would be cut: the chips draw it inside.
 */
export function SectionChips({ label, sections, activeId, onSelect }: NavProps) {
  return (
    <nav
      aria-label={label}
      className="flex gap-2 overflow-x-auto border-b border-hairline px-4 py-3 lg:hidden"
    >
      {sections.map((section) => {
        const on = section.id === activeId;
        return (
          <button
            key={section.id}
            type="button"
            aria-current={on ? "true" : undefined}
            onClick={() => onSelect(section.id)}
            className={`focus-inset chip-instr inline-flex shrink-0 items-center gap-2 rounded-ctl border border-line px-3 py-2 transition-colors duration-150 ${
              on ? "bg-surface-2 text-fg" : "text-fg-secondary hover:bg-surface-2"
            }`}
          >
            {section.label}
            <Glyph tone={section.tone} size={12} />
            {section.status && <span className="sr-only">{section.status}</span>}
          </button>
        );
      })}
    </nav>
  );
}

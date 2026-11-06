import type { ReactNode } from "react";

/** One reading: a label, one or more lines of value, and what it is measured against. */
export interface StatTile {
  key: string;
  label: ReactNode;
  /** One line per currency for money; a single line otherwise. */
  values: string[];
  caption?: ReactNode;
  /** The value reads as "not applicable" rather than as a measurement (§6). */
  disabled?: boolean;
}

/**
 * A hairline strip of readings (docs/design-system.md §6, "Metric strip"): the
 * delivery strip of a creative's Stats, and the conversions and progress strips
 * that follow its form. One implementation of what had been three copies of the
 * same grid.
 *
 * `className` is the grid's columns — a strip's width is a decision of the screen
 * that places it. A clipping parent is safe here and only here: every cell is a
 * static readout with no focusable descendant (§2). Put a control in one and the
 * rounding has to move to the cells.
 */
export function StatStrip({
  heading,
  tiles,
  className,
}: {
  heading: ReactNode;
  tiles: StatTile[];
  className: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {heading}
      <div
        className={`grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline ${className}`}
      >
        {tiles.map((tile) => (
          <div key={tile.key} className="flex min-w-0 flex-col gap-2 bg-surface p-4">
            <span className="label-instr">{tile.label}</span>
            <span className="flex flex-col">
              {tile.values.map((value) => (
                <span
                  key={value}
                  className={`type-metric ${tile.disabled ? "text-fg-disabled" : ""}`}
                >
                  {value}
                </span>
              ))}
            </span>
            {tile.caption && (
              <span className="type-caption text-fg-muted">{tile.caption}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

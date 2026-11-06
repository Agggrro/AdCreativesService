import type { ReactNode } from "react";

/**
 * The workspace's own bar (docs/design-system.md §6, "Workspace"; ADR-0038). On a
 * creative's screens it takes the place of the product bar: 48px, `sm` controls,
 * the way back on the left, the creative's name beside it, the two sections in
 * the middle and the creative's actions on the right. The product's navigation is
 * one click away behind *Creatives*; what this screen needs from its bar is the
 * creative, not the site.
 *
 * Below `lg` the same pieces re-stack instead of squeezing: a row of the way back
 * and the actions, then the name and its chips, then the sections. One DOM for
 * both, placed by the grid — the name is a form field, so it cannot exist twice.
 * The first row is at least 48px and grows if the actions do not fit beside the way
 * back (Russian, 360px): they wrap rather than run over it.
 *
 * From `lg` the name is the one part that gives way. The left cluster gets what
 * the sections and the actions leave — the sections sit centred only from `xl`,
 * where the two outer columns are equal and each is wide enough for its own
 * contents; at 1024 a centred switch would have taken room the name, the format and
 * the serving state need and drawn them under it.
 *
 * Presentational only: it owns no state and no form. The pieces are passed in by
 * the screen, which knows whether it is Settings, Stats or a creative not yet
 * created.
 */
export function WorkspaceBar({
  back,
  title,
  tabs,
  actions,
}: {
  back: ReactNode;
  /** The name, the format and the state. */
  title: ReactNode;
  /** The Settings | Stats switch; absent for a creative that does not exist yet. */
  tabs?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(3rem,auto)_auto_auto] items-center gap-x-3 border-b border-hairline bg-ground px-3 pb-3 lg:h-12 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-rows-1 lg:gap-x-4 lg:px-6 lg:pb-0 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {/* Below `lg` this wrapper dissolves, and the way back and the name become
          grid items of their own; from `lg` it is the bar's left cluster. */}
      <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:items-center lg:gap-3">
        <div className="col-start-1 row-start-1 lg:shrink-0">{back}</div>
        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-hairline lg:block" />
        <div className="col-span-2 row-start-2 min-w-0 px-1 lg:col-auto lg:row-auto lg:flex-1 lg:px-0">
          {title}
        </div>
      </div>

      {tabs && (
        <div className="col-span-2 row-start-3 pt-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pt-0">
          {tabs}
        </div>
      )}

      <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 lg:col-start-3 lg:flex-nowrap">
        {actions}
      </div>
    </header>
  );
}

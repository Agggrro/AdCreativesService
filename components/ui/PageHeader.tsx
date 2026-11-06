/**
 * The heading block every product page opens with (docs/design-system.md §4).
 *
 * A page title is the `h2` role, not `h1`'s display face: Prata is display-only,
 * and a dashboard screen titled in a 44px serif would be shouting at someone who
 * is working, not being sold to. The marketing surfaces use the display roles
 * directly instead of this component.
 *
 * There is no subtitle: a page whose title needs a sentence under it has the wrong
 * title (ADR-0037, §10 "Text earns its place").
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  /** Page-level actions, right-aligned from `sm` up and stacked below it. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex flex-col gap-2">
        {eyebrow && <p className="label-instr">{eyebrow}</p>}
        <h1 className="type-h2">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}

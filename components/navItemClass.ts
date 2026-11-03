/**
 * The shared look of one top-bar item, current or not — used by `TopNav`'s
 * plain links and by `ToolsNavMenu`'s trigger button. A standalone module
 * because those two components already reference each other (`TopNav` renders
 * `ToolsNavMenu`); putting the helper in either file would make them import
 * each other as values, not just as the `TopBarLink` type.
 */
export function navItemClass(current: boolean, extra = "") {
  // `whitespace-nowrap`: a squeezed bar wrapped «Мои креативы» onto two lines
  // instead of overflowing. The bar collapses below `lg`, where every label
  // still fits on one line (docs/design-system.md §6, "Mobile navigation").
  const base = current
    ? "whitespace-nowrap border-b-2 border-accent px-3 pt-2 pb-1.5 text-[14px] font-medium text-fg"
    : "whitespace-nowrap rounded-ctl px-3 py-2 text-[14px] text-fg-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-fg";
  return extra ? `${base} ${extra}` : base;
}

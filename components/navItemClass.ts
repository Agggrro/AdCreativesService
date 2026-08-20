/**
 * The shared look of one top-bar item, current or not — used by `TopNav`'s
 * plain links and by `ToolsNavMenu`'s trigger button. A standalone module
 * because those two components already reference each other (`TopNav` renders
 * `ToolsNavMenu`); putting the helper in either file would make them import
 * each other as values, not just as the `TopBarLink` type.
 */
export function navItemClass(current: boolean, extra = "") {
  const base = current
    ? "border-b-2 border-accent px-3 pt-2 pb-1.5 text-[14px] font-medium text-fg"
    : "rounded-ctl px-3 py-2 text-[14px] text-fg-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-fg";
  return extra ? `${base} ${extra}` : base;
}

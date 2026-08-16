/**
 * The shared look of one top-bar item, current or not — used by `TopNav`'s
 * plain links and by `ToolsNavMenu`'s trigger button. A standalone module
 * because those two components already reference each other (`TopNav` renders
 * `ToolsNavMenu`); putting the helper in either file would make them import
 * each other as values, not just as the `TopBarLink` type.
 */
export function navItemClass(current: boolean, extra = "") {
  const base = current
    ? "border-b-2 border-accent px-2.5 pt-1.5 pb-1 text-[13px] font-medium text-fg"
    : "rounded-ctl px-2.5 py-1.5 text-[13px] text-fg-secondary hover:bg-fill";
  return extra ? `${base} ${extra}` : base;
}

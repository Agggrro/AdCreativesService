/**
 * The one page width (docs/design-system.md §5).
 *
 * This component exists because the previous system had no such thing: the literal
 * `mx-auto flex w-full max-w-[1080px] px-6` was re-typed in eight files, so changing
 * the page width meant finding all eight. A hand-typed `max-w-[…]` on a page shell
 * is a defect.
 *
 * Widths come from the `--container-*` tokens in `app/globals.css`.
 */
export type ContainerWidth = "narrow" | "prose" | "default" | "wide" | "full";

const WIDTH: Record<ContainerWidth, string> = {
  /** A single-column panel — sign-in, sign-up: 416px. */
  narrow: "max-w-narrow",
  /** Running prose and documentation-like pages — 68ch. */
  prose: "max-w-prose",
  /** Dashboard, catalog, tool pages — 1200px. */
  default: "max-w-default",
  /** Marketing sections carrying grids — 1440px. */
  wide: "max-w-wide",
  /** No cap; the gutters still apply. */
  full: "",
};

/**
 * Gutters scale with the viewport rather than sitting at one value, because the
 * same container has to work at 390px and at 2560px. They are part of the
 * container, not of the page that uses it.
 */
const GUTTER = "px-5 sm:px-8 lg:px-12 2xl:px-16";

export function Container({
  width = "default",
  className = "",
  children,
}: {
  width?: ContainerWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${WIDTH[width]} ${GUTTER} ${className}`}>
      {children}
    </div>
  );
}

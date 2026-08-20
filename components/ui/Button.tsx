import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Size is a property of the surface, not of the button (docs/design-system.md §6):
 * `sm` inside tables and toolbars, `md` everywhere in the product, `lg` for a
 * marketing call to action. `md` is the default because most buttons sit in forms.
 */
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // One primary per screen — it is the accent budget (docs/design-system.md §3)
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "border border-line text-fg hover:bg-surface-2",
  ghost: "text-fg-secondary hover:bg-surface-2 hover:text-fg",
  // The confirm action inside a destructive dialog only — never a list action
  // (docs/design-system.md §6, "Destructive confirmation"). Its label is
  // `dead-bg`, the same near-black the tint is built from — 6.65:1 on the fill.
  danger: "bg-dead text-dead-bg hover:bg-dead-hover",
};

const SIZES: Record<ButtonSize, string> = {
  // A control is not prose: its size stays explicit so the label keeps its own
  // weight instead of inheriting a text role that also sets one.
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-11 px-5 text-[14.5px]",
  lg: "h-13 px-7 text-[15.5px]",
};

/**
 * Midnight button: radius from the control scale, no shadow, and transitions on
 * named properties only — `transition: all` is a defect (docs/design-system.md §9).
 *
 * Exported as a class helper too, so client components share one definition
 * instead of re-typing the utility soup.
 */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra?: string,
) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-ctl font-medium",
    "transition-colors duration-150 disabled:cursor-not-allowed",
    "disabled:bg-surface-2 disabled:text-fg-muted disabled:hover:bg-surface-2",
    SIZES[size],
    VARIANTS[variant],
    extra ?? "",
  ].join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button {...props} className={buttonClass(variant, size, className)} />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  href,
  children,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  // One primary per screen — it is the accent budget (docs/design-system.md §3)
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary:
    "border border-line bg-surface text-fg hover:bg-ground disabled:text-fg-disabled",
  ghost: "text-fg-secondary hover:bg-fill",
  // The confirm action inside a destructive dialog only — never a list action
  // (docs/design-system.md §6, "Destructive confirmation").
  danger: "bg-dead text-white hover:bg-dead-fg",
};

/**
 * Instrument button: 32px high, 3px radius, 13px/500 label, no shadow.
 * Exported as a class helper too, so client components share one definition
 * instead of re-typing the utility soup.
 */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  extra?: string,
) {
  return [
    "inline-flex h-8 items-center gap-2 rounded-ctl px-3.5 text-[13px] font-medium",
    "transition-colors duration-[120ms] disabled:cursor-not-allowed",
    "disabled:bg-fill disabled:text-fg-disabled disabled:hover:bg-fill",
    VARIANTS[variant],
    extra ?? "",
  ].join(" ");
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

export function LinkButton({
  variant = "secondary",
  className,
  href,
  children,
}: {
  variant?: ButtonVariant;
  className?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

import { Container, type ContainerWidth } from "@/components/ui/Container";

/**
 * A full-bleed band with contained content (docs/design-system.md §5).
 *
 * This is what owns a wide monitor, and it is measured practice rather than
 * preference: Stripe Atlas pins its content to 1080px — the width we already had —
 * and handles a 1600px viewport through edge-to-edge alternating colour, while
 * tyver.io's wider container with no banding reads as a single floating sheet.
 * Widening paragraphs is not the answer to a wide display; banding is.
 *
 * This is the only place a full-bleed background is declared.
 */
export type SectionTone = "ground" | "surface" | "raised";

const TONE: Record<SectionTone, string> = {
  ground: "bg-ground",
  /** One step up — the band that separates itself from its neighbours. */
  surface: "bg-surface",
  /**
   * Two steps up. Reserved for a band that has to lift a well out of the page:
   * the well keeps the ground tone, so its surroundings are what create the edge
   * (docs/design-system.md §7).
   */
  raised: "bg-surface-2",
};

/** Vertical rhythm. Marketing bands breathe; product screens do not need to. */
export type SectionPad = "none" | "sm" | "md" | "lg";

const PAD: Record<SectionPad, string> = {
  none: "",
  sm: "py-10 md:py-14",
  md: "py-14 md:py-20",
  lg: "py-20 md:py-28",
};

export function Section({
  id,
  tone = "ground",
  pad = "lg",
  width = "wide",
  bordered = false,
  className = "",
  innerClassName = "",
  children,
}: {
  /** An anchor target, for in-page links like the footer's "how it works". */
  id?: string;
  tone?: SectionTone;
  pad?: SectionPad;
  width?: ContainerWidth;
  /** A hairline on the top edge — sections are separated by a rule or by a change of surface, not by empty space alone. */
  bordered?: boolean;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // `scroll-mt` clears the sticky header, or an anchored section lands
      // underneath it and reads as the wrong section.
      className={`scroll-mt-20 ${TONE[tone]} ${bordered ? "border-t border-hairline" : ""} ${className}`}
    >
      <Container width={width} className={`${PAD[pad]} ${innerClassName}`}>
        {children}
      </Container>
    </section>
  );
}

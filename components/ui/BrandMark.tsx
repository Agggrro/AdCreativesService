/**
 * The CreoSmith monogram: an open accent "C" holding a play triangle, then an
 * "S". One flat two-colour glyph — the reference it came from is a bevelled 3D
 * render, and the bevel is exactly what §2 forbids, so the depth is dropped and
 * only the silhouette is kept. Reintroducing it was tried and rejected on the
 * evidence; see the design system's brand-mark section.
 *
 * The reference's second letter is cold slate. §3 rules that out next to
 * apricot ("a cold grey next to apricot reads dirty"), so the S takes the
 * warm `fg` neutral instead. Neither stroke carries a literal hex.
 *
 * Only the C is warm. The triangle is `fg` with the S, which splits the glyph
 * the same way the wordmark beside it splits — Creo/C warm, Smith/S dark — so
 * the two halves of the lockup explain each other.
 *
 * Geometry, so a future edit does not have to re-derive it: both letters are
 * drawn on a 48-unit body as stroked arcs, 10 units wide. The C is a 284° ring
 * about (24,24) at r=19 — butt caps make its terminals cut radially, which is
 * what opens the counter toward the play mark. The S is two 270° bowls meeting
 * at the waist (64,24); its caps land where the tangent is vertical, so the
 * terminals read as flat horizontals.
 *
 * The S's bowls are **elliptical** — rx 12.5 against ry 9.5. Circular bowls are
 * what the height alone would give (ry is fixed by the 48-unit body), and they
 * came out visibly narrow beside the C. rx is the only free parameter; 12.5 is
 * as wide as it goes before the S turns squat.
 *
 * Its left edge stays at x=51.5 regardless, which is what preserves the ~4.6
 * unit gap from the C's terminals — at ~2.6 the two letters merged into one
 * shape at bar size.
 *
 * 28px is the bar size: at 24px the play triangle silts up inside the counter.
 * Anything smaller than 28 needs the C alone, not this lockup.
 *
 * Decorative by design: the wordmark beside it in `TopBar` is what a screen
 * reader announces, so the glyph is hidden rather than given a second label.
 */
/**
 * The glyph's geometry, exported so the large stage (`ui/BrandStage.tsx`) renders
 * the same drawing rather than a second copy of it. A second drawing is how two
 * versions of a logo start diverging.
 *
 * `viewBox` is `0 0 81.5 48`; the derivation of every number is in the header
 * comment above.
 */
export const MONOGRAM_VIEWBOX = "0 0 81.5 48";
export const MONOGRAM_C = "M38.97 12.3A19 19 0 1 0 38.97 35.7";
export const MONOGRAM_PLAY = "M30 24L18.75 17.5L18.75 30.5Z";
export const MONOGRAM_S =
  "M76.5 14.5A12.5 9.5 0 1 0 64 24A12.5 9.5 0 1 1 51.5 33.5";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={MONOGRAM_VIEWBOX}
      // The size stays in the base string rather than in the prop's default, so
      // `className` is additive: passing one adds to the mark instead of
      // silently dropping its height and letting the SVG fall back to its
      // intrinsic size.
      className={`h-7 w-auto shrink-0 ${className}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={MONOGRAM_C}
        className="stroke-accent"
        strokeWidth="10"
      />
      {/* The round join is what softens the triangle's corners — no separate path */}
      <path
        d={MONOGRAM_PLAY}
        className="fill-fg stroke-fg"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={MONOGRAM_S}
        className="stroke-fg"
        strokeWidth="10"
      />
    </svg>
  );
}

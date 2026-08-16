/**
 * The CreoSmith monogram: an open Sienna "C" cradling a play triangle, then an
 * "S" in `fg`. One flat two-colour glyph — the reference it came from is a
 * bevelled 3D render, and the bevel is exactly what §2 forbids, so the depth is
 * dropped and only the silhouette is kept.
 *
 * The reference's second letter is cold slate. §3 rules that out next to
 * terracotta ("a cold grey next to terracotta reads dirty"), so the S takes the
 * warm `fg` neutral instead. Neither stroke carries a literal hex.
 *
 * Geometry, so a future edit does not have to re-derive it: both letters are
 * drawn on a 48-unit body as stroked arcs, 10 units wide. The C is a 284° ring
 * about (24,24) at r=19 — butt caps make its terminals cut radially, which is
 * what opens the counter toward the play mark. The S is two 270° bowls of r=9.5
 * meeting at the waist (61,24); its caps land where the tangent is vertical, so
 * the terminals read as flat horizontals.
 *
 * The S sits at x=61 rather than tucked against the C's terminals: at 59 the two
 * letters closed to ~2.6 units and merged into one shape at bar size. 61 leaves
 * ~4.6, which is the smallest gap that still reads as two letters at 28px.
 *
 * 28px is the bar size for the same reason — at 24px the play triangle silts up
 * inside the counter. Anything smaller than 28 needs the C alone, not this
 * lockup.
 *
 * Decorative by design: the wordmark beside it in `TopBar` is what a screen
 * reader announces, so the glyph is hidden rather than given a second label.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 75.5 48"
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
        d="M38.97 12.3A19 19 0 1 0 38.97 35.7"
        className="stroke-accent"
        strokeWidth="10"
      />
      {/* The round join is what softens the triangle's corners — no separate path */}
      <path
        d="M30 24L18.75 17.5L18.75 30.5Z"
        className="fill-accent stroke-accent"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M70.5 14.5A9.5 9.5 0 1 0 61 24A9.5 9.5 0 1 1 51.5 33.5"
        className="stroke-fg"
        strokeWidth="10"
      />
    </svg>
  );
}

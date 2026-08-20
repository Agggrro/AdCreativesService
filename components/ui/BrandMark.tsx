/**
 * The CreoSmith monogram: an open accent "C" holding a play triangle, then an
 * "S". One flat two-colour glyph — the reference it came from is a bevelled 3D
 * render, and the bevel is exactly what §2 forbids, so the depth is dropped and
 * only the silhouette is kept. Reintroducing it was tried and rejected on the
 * evidence; see the design system's brand-mark section.
 *
 * The reference's second letter is cold slate. §3 rules that out next to
 * apricot ("a cold grey next to apricot reads dirty"), so the S takes the warm
 * `fg` neutral instead. Neither path carries a literal hex.
 *
 * Only the C is warm. The triangle is `fg` with the S, which splits the glyph
 * the same way the wordmark beside it splits — Creo/C warm, Smith/S dark — so
 * the two halves of the lockup explain each other.
 *
 * **Filled outlines, not stroked arcs.** The drawing this replaces approximated
 * the reference with three stroked arcs, which cannot express two things the
 * reference does: the C's terminals are cut by a *concave arc*, where a butt cap
 * can only cut radially, and the S's stroke is not of constant width. Both are
 * silhouette, so both need an outline. Dropping the strokes also unpins the
 * glyph's weight from `strokeWidth`, which used to change with the viewBox.
 *
 * The geometry is measured, not eyeballed: the reference is separated into colour
 * masks, traced with marching squares, and fitted. The fit overlays the reference
 * at IoU 0.992 / 0.991 / 0.994 (C / triangle / S), nothing off by more than
 * 3px on a 1453px body. On this 48-unit body:
 *
 *   C         a true circle, r ~23.85 outer / ~15.76 inner, stem 8.09. Both
 *             terminals are cut by a concave arc, r 14.73 and 14.69 — symmetric
 *             to 0.3%; an earlier fit put them 14% apart by folding the corner
 *             fillets into the same circle.
 *   triangle  half-angle 30.7°, edges dead straight, corners filleted at ~1.43,
 *             centroid on the C's centre to within 0.2 units
 *   S         bowls of unequal radius, stem ~7.2 — thinner than the C's 8.09
 *
 * The letters **overlap**: the C ends at x 38.7 and the S starts at 36.5. That
 * interlock is the reference's own, and it is why the lockup is 68.335 units wide
 * where the version that held them apart was 81.5.
 *
 * **The fitter is chosen per shape, and that is the whole reason the curves are
 * clean.** A fitter that subdivides until it meets a tolerance is obliged to
 * reproduce the reference render's own wobble, which at this size reads as a
 * lumpy edge. So:
 *
 * - The C and the triangle are **arc splines** — lines and circular arcs. A
 *   circular arc has constant curvature by construction, so it cannot ripple, and
 *   a straight edge stays exactly straight. The C measures as a true circle and
 *   the triangle's edges measure straight to within 0.00px, so this is exact for
 *   them rather than an approximation.
 * - The S is neither, so it takes **cubic Béziers on a fixed segment budget** —
 *   breakpoints at equal arc length, joint tangents estimated over a long
 *   baseline. Held to a budget the curve physically cannot chase pixel noise;
 *   the budget is raised only until the fit is within tolerance.
 *
 * Do not "improve" this by tightening the tolerance. The reference's S wanders
 * from any clean construction by up to ~10px, and tracking that faithfully is
 * what produced the lumpy counter this replaces.
 *
 * 28px is the bar size, and it is a floor. Because the letters overlap, the gap
 * between them is only ~1.1px at 28px tall; by ~24px the C’s open side and the S
 * stop reading as separate shapes. Below the floor the mark takes the C alone
 * rather than a shrunken lockup, which is what `app/icon.tsx` renders.
 *
 * Decorative by design: the wordmark beside it in `TopBar` is what a screen
 * reader announces, so the glyph is hidden rather than given a second label.
 */
/**
 * The glyph's geometry, exported so the large stage (`ui/BrandStage.tsx`), the
 * favicon and the OG card render the same drawing rather than a second copy of
 * it. A second drawing is how two versions of a logo start diverging.
 *
 * Every path is one closed filled loop, so `fill-rule` never enters into it.
 * `viewBox` is `0 0 68.335 48`, sized so the artwork touches all four edges — a
 * consumer that sets a height gets exactly that height of mark.
 */
export const MONOGRAM_VIEWBOX = "0 0 68.335 48";
export const MONOGRAM_C =
  "M23.109 0.017A23.877 23.877 0 0 0 4.102 37.173A24.059 24.059 0 0 0 37.556 43.358A0.64 0.64 0 0 0 37.311 42.645A14.73 14.73 0 0 1 34.586 35.849L34.498 35.639A5.043 5.043 0 0 0 33.247 36.569A15.767 15.767 0 0 1 9.529 17.513A15.773 15.773 0 0 1 31.432 9.975A15.743 15.743 0 0 1 35.391 13.059A1.035 1.035 0 0 0 35.646 12.256A14.687 14.687 0 0 1 38.586 5.344A0.253 0.253 0 0 0 38.392 4.901A23.626 23.626 0 0 0 23.109 0.017Z";
export const MONOGRAM_PLAY =
  "M19.41 15.327A1.477 1.477 0 0 0 18.282 17.109L18.346 31.393A1.407 1.407 0 0 0 20.718 32.042L32.614 24.96A1.419 1.419 0 0 0 32.16 22.472L20.09 15.367L19.41 15.327Z";
export const MONOGRAM_S =
  "M43.507 34.035C41.224 33.957 38.807 33.976 36.498 34.002C36.843 36.319 37.109 38.115 38.224 40.243C39.267 42.232 40.656 43.764 42.499 45.028C44.305 46.267 46.306 47.117 48.445 47.575C50.559 48.028 52.75 48.123 54.895 47.844C57.195 47.545 58.992 46.962 61.039 45.848C62.921 44.824 64.67 43.389 65.932 41.649C67.218 39.876 68.025 37.824 68.256 35.643C68.488 33.458 68.258 31.301 67.422 29.262C66.589 27.231 65.158 25.547 63.368 24.29C61.552 23.015 59.562 22.278 57.437 21.692C55.304 21.104 53.202 20.763 51.074 20.253C49.095 19.779 46.729 18.927 45.507 17.191C44.226 15.373 44.346 12.897 45.524 11.059C46.685 9.245 48.874 8.123 50.969 7.863C53.194 7.586 55.264 7.804 57.208 8.995C59.485 10.39 59.902 11.898 60.566 14.265C62.827 14.267 65.205 14.259 67.476 14.166C67.162 10.824 66.311 8.147 63.968 5.607C61.825 3.284 58.876 1.745 55.782 1.164C52.638 0.575 49.48 0.861 46.499 2.017C43.586 3.146 40.912 5.169 39.289 7.866C37.688 10.527 37.217 13.976 37.828 17.002C38.468 20.173 40.502 22.739 43.176 24.481C45.75 26.158 49.104 26.855 52.073 27.494C54.748 28.07 58.916 28.813 60.47 31.288C62.234 34.098 60.986 37.799 58.364 39.603C55.792 41.373 52.21 41.643 49.277 40.729C45.791 39.643 44.013 37.615 43.507 34.035Z";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={MONOGRAM_VIEWBOX}
      // The size stays in the base string rather than in the prop's default, so
      // `className` is additive: passing one adds to the mark instead of
      // silently dropping its height and letting the SVG fall back to its
      // intrinsic size.
      className={`h-7 w-auto shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={MONOGRAM_C} className="fill-accent" />
      <path d={MONOGRAM_PLAY} className="fill-fg" />
      <path d={MONOGRAM_S} className="fill-fg" />
    </svg>
  );
}

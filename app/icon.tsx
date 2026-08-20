import { ImageResponse } from "next/og";
import { MONOGRAM_C, MONOGRAM_PLAY } from "@/components/ui/BrandMark";
import { BRAND } from "@/lib/brand-palette";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * The browser-tab icon, generated from the monogram's own geometry rather than
 * from a second drawing of it.
 *
 * **The `C` alone, not the lockup** — docs/design-system.md §6 puts a hard floor
 * at 28px for the full mark: the two letters overlap, so their gap is only ~1.1px
 * at 28px tall, and below ~24px the `C`’s open side and the `S` stop reading as
 * separate shapes. A favicon is exactly the surface that rule was written for, so
 * it takes the half of the glyph that still reads: the open ring and the triangle
 * it holds.
 *
 * **A round `ground` plate, not a square and not bare transparency.** Outside the
 * circle the PNG is transparent, so nothing reads as a black box on a light tab
 * strip; inside it, the background is known to be `ground` again, which is what lets
 * the glyph keep §6's colour split — the `C` warm, the triangle `fg`. Bare
 * transparency does not: `fg` is near-white, and near-white on nothing all but
 * disappears against Chrome's ~#dee1e6 strip, measured at 16px rather than assumed.
 * The plate is also what keeps the contrast — accent on `ground` is 9.48:1 and `fg`
 * on it 16.86:1, against 1.59:1 for apricot straight onto a light strip.
 *
 * The mark is inset inside the plate rather than filling it: the `C` is itself a ring,
 * and a ring touching the edge of a disc reads as a smudge at 16px.
 *
 * It replaces `app/favicon.ico`, which was the untouched Next.js starter default.
 *
 * Colours come from `lib/brand-palette.ts` rather than from tokens: Satori has no
 * CSSOM, so a `var(--color-…)` here resolves to nothing and does so silently.
 * docs/design-system.md §12 scopes that carve-out to exactly this kind of route.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: BRAND.ground,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/*
            Cropped to the C and the triangle it holds. The lockup viewBox is
            68.335 wide because it also has to hold the S; the C alone occupies
            x[0.05..38.7] y[0..47.6] of it, so this box is a 48-unit square centred
            on exactly that. Re-measure it if the geometry moves.
          */}
          <svg width="44" height="44" viewBox="-4.62 -0.2 48 48">
            <path d={MONOGRAM_C} fill={BRAND.accent} />
            <path d={MONOGRAM_PLAY} fill={BRAND.fg} />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}

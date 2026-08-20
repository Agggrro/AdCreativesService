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
 * at 28px for the full mark, because below it the play triangle silts up inside
 * the counter and the `S` merges with the `C`. A favicon is exactly the surface
 * that rule was written for, so it takes the half of the glyph that still reads:
 * the open ring and the triangle it holds.
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
          background: BRAND.ground,
        }}
      >
        {/* The C's own 48-unit body, cropped to just that letter. */}
        <svg width="52" height="52" viewBox="2 2 44 44" fill="none">
          <path d={MONOGRAM_C} stroke={BRAND.accent} strokeWidth="10" />
          <path
            d={MONOGRAM_PLAY}
            fill={BRAND.fg}
            stroke={BRAND.fg}
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}

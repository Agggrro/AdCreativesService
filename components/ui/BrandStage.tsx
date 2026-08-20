import {
  MONOGRAM_C,
  MONOGRAM_PLAY,
  MONOGRAM_S,
  MONOGRAM_VIEWBOX,
} from "@/components/ui/BrandMark";

/**
 * The landing page's opening object: the monogram at full size, on an ambient
 * halo, above the headline (docs/design-system.md §6, "Brand stage").
 *
 * **It is a stage, not a decoration.** Its geometry is fixed so that interactive
 * mechanics can later replace what is inside it without moving anything around it
 * — the halo box and the mark's height are the contract. Do not re-tune the height
 * to close a gap somewhere else on the page.
 *
 * The drawing comes from `BrandMark`'s exported geometry rather than being redrawn
 * here; a second copy of the glyph is how two versions of a logo start diverging.
 *
 * Motion is ambient only — a slow halo rotation and a soft pulse on the play
 * triangle. Both stop under `prefers-reduced-motion` (globals.css §Motion kills
 * every animation there), and neither moves layout: they animate `transform` and
 * `opacity` on absolutely-positioned or self-contained elements.
 *
 * One per page, on `/` only. The mark anywhere else is the 28px bar lockup.
 */
export function BrandStage() {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex h-40 w-full items-center justify-center sm:h-56 lg:h-[340px]">
        {/*
          The halo is `aria-hidden` and `pointer-events-none`: it is atmosphere, and
          it must never sit between a future interactive mark and the cursor.
        */}
        <div
          aria-hidden="true"
          className="brand-halo pointer-events-none absolute aspect-square w-[300px] rounded-full blur-3xl sm:w-[440px] lg:w-[620px]"
        />
        <svg
          viewBox={MONOGRAM_VIEWBOX}
          className="relative h-32 w-auto sm:h-44 lg:h-[300px]"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={MONOGRAM_C} className="stroke-accent" strokeWidth="10" />
          <path
            d={MONOGRAM_PLAY}
            className="brand-play fill-fg stroke-fg"
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d={MONOGRAM_S} className="stroke-fg" strokeWidth="10" />
        </svg>
      </div>
    </div>
  );
}

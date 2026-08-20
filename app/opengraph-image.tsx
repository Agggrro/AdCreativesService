import { ImageResponse } from "next/og";
import {
  MONOGRAM_C,
  MONOGRAM_PLAY,
  MONOGRAM_S,
  MONOGRAM_VIEWBOX,
} from "@/components/ui/BrandMark";
import { BRAND } from "@/lib/brand-palette";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CreoSmith — interactive video ad creatives";

/**
 * The link preview card. New: the product had no `opengraph-image` at all, so a
 * shared link rendered as a bare URL.
 *
 * Deliberately **not localised.** A share card has no session and no cookie, so
 * there is no locale to read — the same reasoning §10 applies to the public VAST
 * path. It carries the industry's own English terms, which are left untranslated
 * everywhere in this product anyway.
 *
 * Colours come from `lib/brand-palette.ts`: Satori has no CSSOM, so a token
 * reference here would resolve to nothing silently. docs/design-system.md §12.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.ground,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* 85x60 is the nearest integer pair to the lockup's own 68.335:48 ratio. */}
          <svg width="85" height="60" viewBox={MONOGRAM_VIEWBOX}>
            <path d={MONOGRAM_C} fill={BRAND.accent} />
            <path d={MONOGRAM_PLAY} fill={BRAND.fg} />
            <path d={MONOGRAM_S} fill={BRAND.fg} />
          </svg>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 600 }}>
            <span style={{ color: BRAND.accent }}>Creo</span>
            <span style={{ color: BRAND.fg }}>Smith</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: BRAND.fg,
              maxWidth: 900,
            }}
          >
            Ads your viewer actually touches
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              lineHeight: 1.4,
              color: BRAND.fgSecondary,
              maxWidth: 820,
            }}
          >
            Interactive video creative and a dynamic VAST tag — no developer.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 28,
            fontSize: 22,
            letterSpacing: "0.08em",
            color: BRAND.fgMuted,
          }}
        >
          <span>SIMID 1.1</span>
          <span>VPAID 2.0</span>
          <span>VAST 4.2</span>
        </div>
      </div>
    ),
    size,
  );
}

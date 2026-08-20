/**
 * The palette, as plain values, for the two places that cannot read a CSS custom
 * property: `app/icon.tsx` and `app/opengraph-image.tsx`.
 *
 * Those render through Satori, which has no CSSOM — a `var(--color-accent)` there
 * resolves to nothing and does so **silently**, which is why this exists rather
 * than a hand-typed hex at each call site. `docs/design-system.md` §12 scopes the
 * carve-out to files whose default export returns an `ImageResponse`; nothing a
 * browser renders may import this instead of using a token.
 *
 * **These must be changed together with the `@theme` block in `app/globals.css`.**
 * They are the same colours written twice because two renderers need them in two
 * forms, not a second source of truth.
 */
export const BRAND = {
  /** --color-ground */
  ground: "#0d0b0a",
  /** --color-accent */
  accent: "#e9a57b",
  /** --color-fg */
  fg: "#f2ede6",
  /** --color-fg-secondary */
  fgSecondary: "#a79e92",
  /** --color-fg-muted */
  fgMuted: "#928879",
} as const;

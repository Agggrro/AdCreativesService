/** Public base URL (no trailing slash). Used for VAST tags, auth redirects, etc. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

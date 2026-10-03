import Script from "next/script";

/**
 * Cloudflare Web Analytics — page views and Core Web Vitals for our own pages
 * (ADR-0029, replacing Vercel Web Analytics and Speed Insights). Cookie-less.
 *
 * The site token is public by design: it rides in every page, and all it can do
 * is report a page view to this one site. Unset — locally, in CI — and nothing
 * renders, so a development session never shows up in production numbers.
 *
 * The root layout mounts this on the app domain only; see the gate there and
 * docs/security.md, "Web analytics".
 */
export function WebAnalytics() {
  const token = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN;
  if (!token) return null;
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}

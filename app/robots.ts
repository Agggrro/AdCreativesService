import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Crawl policy.
 *
 * ADR-0013's premise is that someone with a broken ad tag finds the validator by
 * searching for one, so the public surfaces are explicitly open. Everything
 * behind a session is disallowed — not as a security control (the dashboard
 * layout's auth gate is that) but because a crawler spending its budget on
 * pages that redirect to `/login` is budget not spent on the pages that matter.
 *
 * The API paths are listed for the same reason: `/api/vast` is a high-QPS ad
 * serving endpoint and has nothing to offer an index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/", "/login", "/signup", "/auth/"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}

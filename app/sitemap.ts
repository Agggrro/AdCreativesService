import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site";
import { templateSlug } from "@/lib/template-demo";
import type { Database } from "@/types/database.types";

/**
 * Rebuilt at most hourly. The published-template list changes when someone
 * publishes a template, which is rare, and a crawler should not be running a
 * database query per fetch.
 *
 * This only holds because nothing below reads a cookie: `createServerSupabase`
 * awaits `cookies()`, and any use of that API opts the route into dynamic
 * rendering, which would silently make this declaration a no-op. A sitemap has
 * no session to read anyway — it is the same list for every visitor.
 */
export const revalidate = 3600;

/**
 * The public surface, for crawlers.
 *
 * Only pages a signed-out visitor can actually read: the landing page, the
 * template catalog and its detail pages, and the free tools (ADR-0013). The
 * dashboard is deliberately absent — it would be a list of redirects to
 * `/login`.
 *
 * `/tools` itself isn't listed because it isn't a route any more — there is no
 * index page, only the two tool pages below it, reached from the top-bar
 * dropdown (`docs/design-system.md` §6, "Nav dropdown"). `/tools/vast-generator`
 * is absent too, and that is the sitemap agreeing with the `noindex` on the
 * page itself: it is a placeholder, and a thin "in development" page in the
 * index is a weak quality signal for the whole domain. It goes in when the
 * generator ships.
 *
 * Catalog entries are read with a plain anon client — the same rows RLS grants
 * a signed-out visitor through `templates_select_published`, and no service-role
 * key anywhere near a public route. A failure returns the static pages rather
 * than throwing: a sitemap is a hint, and half of one beats a 500.
 *
 * The catalog slug is derived from `templates.type`, not from a `slug` column:
 * there isn't one, by the decision recorded in `supabase/schema.sql` next to the
 * unique index on `type`. This reuses `templateSlug`, the same helper the
 * catalog grid builds its hrefs with, so the sitemap cannot drift into
 * advertising URLs that do not resolve.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/catalog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    {
      url: `${base}/tools/vast-validator`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return staticPages;

    const supabase = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: templates } = await supabase
      .from("templates")
      .select("type, updated_at")
      .eq("is_published", true);

    return [
      ...staticPages,
      ...(templates ?? [])
        .filter((template) => Boolean(template?.type))
        .map((template) => ({
          url: `${base}/catalog/${templateSlug(template.type)}`,
          lastModified: template.updated_at ? new Date(template.updated_at) : now,
          changeFrequency: "monthly" as const,
          priority: 0.7,
        })),
    ];
  } catch {
    return staticPages;
  }
}

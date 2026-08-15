import type { MetadataRoute } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { templateSlug } from "@/lib/template-demo";

export const revalidate = 3600;

/**
 * The public surface, for crawlers.
 *
 * Only pages a signed-out visitor can actually read: the landing page, the
 * template catalog and its detail pages, and the free tools (ADR-0013). The
 * dashboard is deliberately absent — it would be a list of redirects to
 * `/login`.
 *
 * `/tools/vast-generator` is absent too, and that is the sitemap agreeing with
 * the `noindex` on the page itself: it is a placeholder, and a thin
 * "in development" page in the index is a weak quality signal for the whole
 * domain. It goes in when the generator ships.
 *
 * Catalog entries are read with the anon client, the same read a visitor gets.
 * A failure returns the static pages rather than throwing — a sitemap is a hint,
 * and half of one is worth more than a 500.
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
    { url: `${base}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    {
      url: `${base}/tools/vast-validator`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];

  try {
    const supabase = await createServerSupabase();
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

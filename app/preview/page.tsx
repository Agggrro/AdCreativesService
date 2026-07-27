import { permanentRedirect } from "next/navigation";
import { templateSlug } from "@/lib/template-demo";

/**
 * `/preview` was the public demo page: a tab strip switching a single live
 * player. That experience is now the landing page itself (`/`) — restored as
 * the site's front door rather than a side page — so legacy links land there
 * with the same template preselected, instead of on `/catalog`'s per-template
 * detail page.
 *
 * The legacy `?t=` keys were runtime unit keys, which are not the catalog's
 * slugs — `shoppable` is the unit behind the `shoppable_video` template — so the
 * map is explicit rather than derived.
 */
const LEGACY_SLUGS: Record<string, string> = {
  "scratch-reveal": templateSlug("scratch_reveal"),
  slider: templateSlug("slider"),
  quiz: templateSlug("quiz"),
  "age-gate": templateSlug("age_gate"),
  shoppable: templateSlug("shoppable_video"),
};

export default async function PreviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const slug = t ? LEGACY_SLUGS[t] : undefined;
  permanentRedirect(slug ? `/?t=${slug}` : "/");
}

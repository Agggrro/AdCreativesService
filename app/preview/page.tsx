import { permanentRedirect } from "next/navigation";
import { templateSlug } from "@/lib/template-demo";

/**
 * `/preview` was the public demo page with four hardcoded fixtures. It is now
 * the catalog (ADR-0008), which is DB-backed and reachable after login.
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
  permanentRedirect(slug ? `/catalog/${slug}` : "/catalog");
}

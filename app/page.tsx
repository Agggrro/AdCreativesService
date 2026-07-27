import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { HeroShowcase, type ShowcaseTemplate } from "@/components/HeroShowcase";
import { LinkButton } from "@/components/ui/Button";
import { demoConfig, demoUnitKey, templateSlug } from "@/lib/template-demo";

/**
 * The landing page: a live, switchable demo of every template with a working
 * in-browser unit, restored as the site's front door rather than a
 * signed-out-only side page (ADR-0008 follow-up). Clicking the logo lands
 * here for a signed-out visitor (`AppTopBar`'s `brandHref`); `/catalog` stays
 * the fuller, non-live browsing surface with descriptions and purchase entry
 * points.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("templates")
    .select("id, name, type, runtime_keys, config_schema")
    .eq("is_published", true)
    .order("name");

  // Only templates with a resolvable demo unit get a tab — an honest gap
  // beats a switcher entry that renders a dead well (docs/design-system.md §6).
  const templates: ShowcaseTemplate[] = (rows ?? []).flatMap((t) => {
    const unitKey = demoUnitKey(t.runtime_keys);
    if (!unitKey) return [];
    return [
      {
        id: t.id,
        name: t.name,
        unitKey,
        config: demoConfig(t.config_schema, unitKey, "photo"),
      },
    ];
  });
  const initialId = sp.t
    ? rows?.find(
        (t) => templateSlug(t.type) === sp.t && demoUnitKey(t.runtime_keys),
      )?.id
    : undefined;

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-4">
          <h1 className="max-w-[19ch] text-[30px] font-semibold leading-9 tracking-[-0.02em] text-balance">
            {dict.landing.title}
          </h1>
          <p className="max-w-[62ch] text-[15px] leading-6 text-fg-secondary">
            {dict.landing.subtitle}
          </p>
        </div>

        {templates.length > 0 && (
          <HeroShowcase templates={templates} dict={dict} initialId={initialId} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <LinkButton
            href={user ? "/dashboard/creatives" : "/signup"}
            variant="primary"
          >
            {user ? dict.landing.ctaDashboard : dict.landing.ctaStart}
          </LinkButton>
          <Link
            href="/catalog"
            className="text-[13px] text-fg-secondary underline underline-offset-4 hover:text-fg"
          >
            {dict.catalog.seeAll}
          </Link>
        </div>
      </section>
    </main>
  );
}

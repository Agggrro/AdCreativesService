import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { CatalogGrid } from "@/components/CatalogGrid";
import { LinkButton } from "@/components/ui/Button";

/** How many tiles the landing teaser shows before sending people to /catalog. */
const TEASER_TILES = 3;

export default async function Home() {
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, description, type, supported_standards")
    .eq("is_published", true)
    .order("name");

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <section className="mx-auto flex w-full max-w-[1080px] flex-col items-start gap-8 px-6 py-16">
        <div className="flex flex-col gap-4">
          <h1 className="max-w-[19ch] text-[30px] font-semibold leading-9 tracking-[-0.02em] text-balance">
            {dict.landing.title}
          </h1>
          <p className="max-w-[62ch] text-[15px] leading-6 text-fg-secondary">
            {dict.landing.subtitle}
          </p>
        </div>
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
            {dict.landing.tryPreview}
          </Link>
        </div>
      </section>

      {/* Same component as /catalog, cut to a teaser — one grid, one definition
          of what a template tile looks like (docs/design-system.md §6). */}
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-3 px-6 pb-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="label-instr">{dict.landing.showcase}</h2>
          {(templates?.length ?? 0) > TEASER_TILES && (
            <Link
              href="/catalog"
              className="text-[13px] text-fg-secondary underline underline-offset-4 hover:text-fg"
            >
              {dict.catalog.seeAll}
            </Link>
          )}
        </div>
        <CatalogGrid
          templates={templates ?? []}
          dict={dict}
          limit={TEASER_TILES}
        />
      </section>
    </main>
  );
}

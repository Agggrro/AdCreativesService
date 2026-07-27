import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { CatalogGrid } from "@/components/CatalogGrid";

/**
 * The public template catalog. Deliberately not behind auth: it is the
 * product's most persuasive surface, and making it the same page for a visitor
 * and a signed-in buyer is what gives the buyer a way back to the demos after
 * logging in (ADR-0008). `templates_select_published` already grants anon read.
 */
export default async function CatalogPage() {
  const supabase = await createServerSupabase();
  const { dict } = await getDict();

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, description, type, supported_standards")
    .eq("is_published", true)
    .order("name");

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">
            {dict.catalog.title}
          </h1>
          <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
            {dict.catalog.subtitle}
          </p>
        </div>

        <CatalogGrid templates={templates ?? []} dict={dict} />
      </div>
    </main>
  );
}

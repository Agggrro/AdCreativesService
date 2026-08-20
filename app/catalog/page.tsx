import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { CatalogGrid } from "@/components/CatalogGrid";
import { Section } from "@/components/ui/Section";
import { PageHeader } from "@/components/ui/PageHeader";
import { Footer } from "@/components/ui/Footer";

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

      <Section tone="ground" pad="md" width="wide" innerClassName="flex flex-col gap-10">
        <PageHeader title={dict.catalog.title} subtitle={dict.catalog.subtitle} />
        <CatalogGrid templates={templates ?? []} dict={dict} />
      </Section>

      <Footer dict={dict} />
    </main>
  );
}

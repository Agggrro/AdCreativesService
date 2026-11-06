import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { withNext } from "@/lib/safe-next";
import { getCdnUrl } from "@/lib/site";
import { AppTopBar } from "@/components/AppTopBar";
import { Section } from "@/components/ui/Section";
import { PageHeader } from "@/components/ui/PageHeader";
import { VideoTagGenerator } from "@/components/vast-gen/VideoTagGenerator";
import { emptyDraft } from "@/components/vast-gen/draft";
import { createVideoCreative } from "@/app/dashboard/creatives/video-actions";

/**
 * A tab title and a SERP description are user-visible strings (§10), so they
 * come from the dictionary. Indexed since the generator shipped (ADR-0035): the
 * placeholder was `noindex` only for as long as it did nothing.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return {
    title: dict.tools.generatorMetaTitle,
    description: dict.tools.generatorMetaDescription,
  };
}

/**
 * The VAST generator (ADR-0035, ADR-0036): a VAST video creative built from a
 * form, saved to Мои креативы, served as a dynamic tag.
 *
 * Public, like every tool: a signed-out visitor configures everything, previews
 * the XML and plays it — and creating it takes an account, with the draft kept
 * in their browser across the sign-in (ADR-0036). The page reads the session
 * only to choose between those two endings; nothing is stored for a visitor.
 */
export default async function VastGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string | string[] }>;
}) {
  const { dict } = await getDict();
  const t = dict.vastGen;
  const { resume } = await searchParams;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <Section tone="surface" pad="md" width="wide" innerClassName="flex flex-col gap-8">
        <PageHeader title={t.title} />
        <VideoTagGenerator
          mode="create"
          signedIn={Boolean(user)}
          // Back from signing in, and only then, the draft kept in this
          // browser is restored: a later visit starts clean (ADR-0036).
          resume={resume === "1"}
          cdnUrl={getCdnUrl()}
          signInHref={withNext("/login", "/tools/vast-generator?resume=1")}
          action={createVideoCreative}
          initialDraft={emptyDraft()}
        />
      </Section>
    </main>
  );
}

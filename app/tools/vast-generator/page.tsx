import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { Section } from "@/components/ui/Section";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Field";

/**
 * A tab title and a SERP description are user-visible strings (§10), so they come
 * from the dictionary. `robots` does not — it is a directive to a crawler, not
 * copy — and it stays exactly as it was.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return {
    title: dict.tools.generatorMetaTitle,
    description: dict.tools.generatorMetaDescription,
    // Reachable and linked, but kept out of the index until it does something.
    // A thin "in development" page is a weak quality signal that costs the whole
    // domain, not just this URL. Comes out when the generator ships — and the
    // sitemap omits it for the same reason.
    robots: { index: false, follow: true },
  };
}

/**
 * Placeholder for the second free tool (ADR-0013).
 *
 * It exists as a route rather than a disabled row so the tools index can link
 * somewhere honest, and so the page can say what the generator will be for
 * instead of leaving a dead link that reads as a broken build.
 */
export default async function VastGeneratorPage() {
  const { dict } = await getDict();
  const t = dict.tools;

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <Section tone="ground" pad="md" width="wide" innerClassName="flex flex-col gap-8">
        <PageHeader title={t.generatorName} subtitle={t.generatorDescription} />

        <Panel className="p-8">
          <div className="flex max-w-[66ch] flex-col items-start gap-4">
            <h2 className="type-h3">{t.generatorSoonTitle}</h2>
            <p className="type-small text-fg-secondary">{t.generatorSoonBody}</p>
            {/* A control names what happens, not what it points at (§10). */}
            <LinkButton href="/tools/vast-validator" variant="secondary">
              {t.open} · {t.validatorName}
            </LinkButton>
          </div>
        </Panel>
      </Section>
    </main>
  );
}

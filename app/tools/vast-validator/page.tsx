import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { Section } from "@/components/ui/Section";
import { PageHeader } from "@/components/ui/PageHeader";
import { VastValidator } from "@/components/tools/VastValidator";

/**
 * A tab title and a SERP description are user-visible strings (§10). This page
 * reads the locale cookie already, so an English literal here meant a Russian
 * visitor got `lang="ru"` with an English title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return {
    title: dict.tools.validatorMetaTitle,
    description: dict.tools.validatorMetaDescription,
  };
}

/**
 * The public VAST validator (ADR-0013).
 *
 * Server component for the shell and the top bar; everything below is client
 * state, because a validation run is a conversation rather than a page load.
 */
export default async function VastValidatorPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>;
}) {
  const { dict } = await getDict();
  const t = dict.tools.validator;

  // `?tag=` makes a URL-mode run shareable and repeatable without storing
  // anything on our side. Reading it here rather than in the client component
  // keeps the controlled input's server and client markup identical.
  const { tag } = await searchParams;
  const initialTag = (Array.isArray(tag) ? tag[0] : tag) ?? "";

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <Section tone="surface" pad="md" width="wide" innerClassName="flex flex-col gap-8">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <VastValidator initialTag={initialTag} />
      </Section>
    </main>
  );
}

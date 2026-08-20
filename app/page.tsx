import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { HeroShowcase, type ShowcaseTemplate } from "@/components/HeroShowcase";
import { CatalogGrid, type CatalogTemplate } from "@/components/CatalogGrid";
import { LinkButton } from "@/components/ui/Button";
import { BrandStage } from "@/components/ui/BrandStage";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Footer } from "@/components/ui/Footer";
import { demoConfig, demoUnitKey, templateSlug } from "@/lib/template-demo";

/**
 * The landing page (docs/design-system.md §6, "Landing hero").
 *
 * The order is the visitor's reading order, not ours: the brand stage opens, the
 * offer is stated once, the live creative proves it, and only then do the
 * supporting sections run. Section colour is full-bleed and the content stays in a
 * container — that is what owns a wide monitor (§5), not wider paragraphs.
 *
 * Exactly one VPAID unit is ever mounted, in `HeroShowcase`. The gallery below is
 * static previews, because VPAID units share the `window.getVPAIDAd` global and a
 * second live one would render the wrong mechanic.
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
    .select(
      "id, name, description, type, supported_standards, runtime_keys, config_schema",
    )
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

  // The gallery lists every published template, including any without a demo
  // unit: a tile is a description, not a running mechanic, so nothing is broken
  // by showing one.
  const gallery: CatalogTemplate[] = (rows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    type: t.type,
    supported_standards: t.supported_standards,
  }));

  const initialId = sp.t
    ? rows?.find(
        (t) => templateSlug(t.type) === sp.t && demoUnitKey(t.runtime_keys),
      )?.id
    : undefined;

  const steps = [
    { n: "01", title: dict.landing.step1Title, body: dict.landing.step1Body },
    { n: "02", title: dict.landing.step2Title, body: dict.landing.step2Body },
    { n: "03", title: dict.landing.step3Title, body: dict.landing.step3Body },
    { n: "04", title: dict.landing.step4Title, body: dict.landing.step4Body },
  ];

  const standards = [
    { name: "VAST 4.2", role: dict.landing.stdVast },
    { name: "SIMID 1.1", role: dict.landing.stdSimid },
    { name: "VPAID 2.0", role: dict.landing.stdVpaid },
    { name: "OMID", role: dict.landing.stdOmid },
  ];

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      {/* ---- Hero. `surface` so the well, which keeps the ground tone, has
           something to sit on — a well on a ground band is invisible (§7). ---- */}
      <Section tone="surface" pad="lg" width="wide">
        <Reveal>
          <BrandStage />
        </Reveal>

        <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center text-center sm:mt-12">
          <Reveal delay={80}>
            <p className="label-instr">{dict.landing.eyebrow}</p>
          </Reveal>
          <Reveal delay={140}>
            <h1 className="type-display mt-5 max-w-[17ch]">
              {dict.landing.title}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="type-body-lg mt-6 max-w-[58ch] text-fg-secondary">
              {dict.landing.subtitle}
            </p>
          </Reveal>
          <Reveal delay={260}>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <LinkButton
                href={user ? "/dashboard/creatives" : "/signup"}
                variant="primary"
                size="lg"
              >
                {user ? dict.landing.ctaDashboard : dict.landing.ctaStart}
              </LinkButton>
              <LinkButton href="/catalog" variant="secondary" size="lg">
                {dict.landing.ctaTemplates}
              </LinkButton>
            </div>
          </Reveal>
          <Reveal delay={310}>
            <p className="data-instr mt-5 type-caption text-fg-muted">
              {dict.landing.heroNote}
            </p>
          </Reveal>
        </div>

        {templates.length > 0 && (
          <Reveal delay={360}>
            <div className="mt-14">
              <HeroShowcase
                templates={templates}
                dict={dict}
                initialId={initialId}
              />
            </div>
          </Reveal>
        )}
      </Section>

      {/* ---- How it works ---- */}
      <Section id="how" tone="ground" pad="lg" bordered>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div>
            <p className="label-instr">{dict.landing.howEyebrow}</p>
            <h2 className="type-h1 mt-5 max-w-[20ch]">{dict.landing.howTitle}</h2>
          </div>
          <p className="type-body max-w-[44ch] text-fg-secondary">
            {dict.landing.howLead}
          </p>
        </div>

        <div className="mt-14 grid gap-px border-y border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.n} delay={i * 70} className="bg-ground">
              <div className="flex h-full flex-col gap-3 px-6 py-8 lg:px-8">
                <span className="data-instr type-caption tracking-[0.1em] text-fg-muted">
                  {step.n}
                </span>
                <h3 className="type-h3">{step.title}</h3>
                <p className="type-small text-fg-secondary">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/*
          The tag is machine text — mono, identical in both locales, and it has to
          be the shape the product actually emits. It read `?c=…&fmt=simid`, a
          parameter name and a query arg that exist nowhere: the real tag is
          `{cdn}/v?creative_id={uuid}` (app/dashboard/creatives/page.tsx). §7
          forbids fabricating a response time on this screen for the same reason —
          a machine value that means nothing on the one page a prospect trusts most.
        */}
        <div className="mt-10 flex flex-col gap-4 rounded-panel border border-hairline bg-surface p-5 sm:flex-row sm:items-center sm:gap-5">
          <span className="label-instr shrink-0">{dict.landing.tagLabel}</span>
          <code className="type-data min-w-0 flex-1 truncate text-fg-secondary">
            https://ads.creosmith.com/v?creative_id=8f3a91d4-2b7e-4c05-9a11-6de0f2c48b73
          </code>
        </div>
      </Section>

      {/* ---- Templates ---- */}
      <Section tone="surface" pad="lg" bordered>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-instr">{dict.landing.templatesEyebrow}</p>
            <h2 className="type-h1 mt-5">{dict.landing.templatesTitle}</h2>
          </div>
          <Link
            href="/catalog"
            className="type-body w-fit rounded-ctl text-fg-secondary underline underline-offset-4 transition-colors duration-150 hover:text-fg"
          >
            {dict.catalog.seeAll} →
          </Link>
        </div>

        <div className="mt-12">
          <CatalogGrid templates={gallery} dict={dict} />
        </div>
      </Section>

      {/* ---- Standards and the free tools ---- */}
      <Section tone="ground" pad="lg" bordered>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-24">
          <div>
            <p className="label-instr">{dict.landing.stdEyebrow}</p>
            <h2 className="type-h1 mt-5 max-w-[16ch]">{dict.landing.stdTitle}</h2>
            <p className="type-body mt-6 max-w-[44ch] text-fg-secondary">
              {dict.landing.stdLead}
            </p>
            {/*
              A clipping parent would erase a 2px-offset focus ring (§2). Verified
              safe here and only here: every cell is a static readout with no
              focusable descendant. Put a link or a button in one and the rounding
              has to move to the cells.
            */}
            <div className="mt-10 grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-2">
              {standards.map((s) => (
                <div key={s.name} className="bg-ground px-5 py-5">
                  <div className="data-instr type-h3">{s.name}</div>
                  <div className="type-small mt-2 text-fg-muted">{s.role}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="label-instr">{dict.landing.toolsEyebrow}</p>
            <h2 className="type-h2 mt-5 max-w-[26ch]">
              {dict.landing.toolsTitle}
            </h2>
            <div className="mt-8 flex flex-col gap-4">
              <ToolCard
                href="/tools/vast-validator"
                name={dict.tools.validatorName}
                description={dict.tools.validatorDescription}
              />
              <ToolCard
                href="/tools/vast-generator"
                name={dict.tools.generatorName}
                description={dict.tools.generatorDescription}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ---- Closing call to action ---- */}
      <Section tone="surface" pad="lg" bordered innerClassName="text-center">
        <Reveal>
          <h2 className="type-display-sm mx-auto max-w-[18ch]">
            {dict.landing.finalTitle}
          </h2>
          <p className="type-body-lg mx-auto mt-6 max-w-[52ch] text-fg-secondary">
            {dict.landing.finalBody}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton
              href={user ? "/dashboard/creatives" : "/signup"}
              variant="primary"
              size="lg"
            >
              {user ? dict.landing.ctaDashboard : dict.landing.ctaStart}
            </LinkButton>
            <LinkButton
              href="/tools/vast-validator"
              variant="secondary"
              size="lg"
            >
              {dict.landing.ctaCheckTag}
            </LinkButton>
          </div>
        </Reveal>
      </Section>

      <Footer dict={dict} />
    </main>
  );
}

function ToolCard({
  href,
  name,
  description,
}: {
  href: string;
  name: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-card border border-hairline bg-surface p-6 transition-colors duration-150 hover:bg-surface-2"
    >
      <span className="type-h3">{name}</span>
      <span className="type-small text-fg-secondary">{description}</span>
    </Link>
  );
}

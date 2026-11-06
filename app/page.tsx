import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { HeroShowcase, type ShowcaseTemplate } from "@/components/HeroShowcase";
import { CatalogGrid, type CatalogTemplate } from "@/components/CatalogGrid";
import { LinkButton } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Footer } from "@/components/ui/Footer";
import { demoConfig, demoUnitKey, templateSlug } from "@/lib/template-demo";
import { freeTools } from "@/lib/tools";
import { vastTagUrl } from "@/lib/site";

/** An illustrative id: it points at nothing and shows the shape of a tag. */
const EXAMPLE_CREATIVE_ID = "8f3a91d4-2b7e-4c05-9a11-6de0f2c48b73";

/**
 * The landing page (docs/design-system.md §6, "Landing hero"; ADR-0037).
 *
 * The first screen belongs to the offer and the proof: from `lg` the headline, one
 * line, the call to action and the beta note sit beside the live creative; there
 * is no logo stage in front of them. Below the hero each band says its one thing
 * — the steps, the templates, the standards and the tools, the call to action
 * again — and nothing explains what its heading already says. Section colour is
 * full-bleed and the content stays in a container; that is what owns a wide
 * monitor (§5), not wider paragraphs.
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
    // A system template (ADR-0035) is published but is not part of the gallery.
    .eq("in_catalog", true)
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
    dict.landing.step1Title,
    dict.landing.step2Title,
    dict.landing.step3Title,
    dict.landing.step4Title,
  ];

  // Machine values: identical in both locales (§10).
  const standards = ["VAST 4.2", "SIMID 1.1", "VPAID 2.0", "OMID"];
  const tools = freeTools(dict);
  const exampleTag = vastTagUrl(EXAMPLE_CREATIVE_ID);

  const cta = user
    ? { href: "/dashboard/creatives", label: dict.landing.ctaDashboard }
    : { href: "/signup", label: dict.landing.ctaStart };

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      {/* ---- Hero. `surface` so the well, which keeps the ground tone, has
           something to sit on — a well on a ground band is invisible (§7). ---- */}
      <Section tone="surface" pad="md" width="wide">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <Reveal>
            <div className="flex flex-col items-start">
              <h1 className="type-display-sm max-w-[16ch]">
                {dict.landing.title}
              </h1>
              <p className="type-body-lg mt-5 max-w-[34ch] text-balance text-fg-secondary">
                {dict.landing.subtitle}
              </p>
              <div className="mt-8">
                <LinkButton href={cta.href} variant="primary" size="lg">
                  {cta.label}
                </LinkButton>
              </div>
              {/* A signed-in viewer has the access state in the account menu; the
                  note is for the visitor who has not signed up yet. */}
              {!user && (
                <p className="data-instr mt-5 type-caption text-fg-muted">
                  {dict.landing.heroNote}
                </p>
              )}
            </div>
          </Reveal>

          {templates.length > 0 && (
            <Reveal delay={80}>
              <HeroShowcase
                templates={templates}
                dict={dict}
                initialId={initialId}
              />
            </Reveal>
          )}
        </div>
      </Section>

      {/* ---- Steps: four titles and what the tag looks like ---- */}
      <Section tone="ground" pad="sm" bordered>
        {/*
          A clipping parent would erase a 2px-offset focus ring (§2). Verified safe
          here and only here: every cell is a static readout with no focusable
          descendant. Put a link or a button in one and the rounding has to move to
          the cells.
        */}
        <ol className="grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((title, i) => (
            <li key={title} className="flex flex-col gap-2 bg-ground px-6 py-5">
              <span className="data-instr type-caption text-fg-muted">
                {`0${i + 1}`}
              </span>
              <span className="type-h3">{title}</span>
            </li>
          ))}
        </ol>

        {/*
          The tag is machine text — mono, identical in both locales — and it has to
          be the shape the product actually emits, on the host it emits it from:
          `vastTagUrl` builds every tag the product shows, and the ad domain is its
          own (ADR-0018), so a host typed by hand is a host that does not exist. A
          fabricated machine value on the one page a prospect trusts most is the
          fault §7 names for a made-up response time. A tag URL is wide content: it
          scrolls inside its own box (§5) instead of being cut off mid-id.
        */}
        <div className="mt-4 flex flex-col gap-2 rounded-panel border border-hairline bg-surface px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
          <span className="label-instr shrink-0">{dict.landing.tagLabel}</span>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <code className="type-data whitespace-nowrap text-fg-secondary">
              {exampleTag}
            </code>
          </div>
        </div>
      </Section>

      {/* ---- Templates, in teaser form: the catalog is where they are compared ---- */}
      <Section tone="surface" pad="md" bordered>
        <div className="flex items-end justify-between gap-6">
          <h2 className="type-h1">{dict.landing.templatesTitle}</h2>
          <Link
            href="/catalog"
            className="type-body w-fit shrink-0 rounded-ctl text-fg-secondary underline underline-offset-4 transition-colors duration-150 hover:text-fg"
          >
            {dict.nav.catalog}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
        <div className="mt-8">
          <CatalogGrid templates={gallery} dict={dict} compact />
        </div>
      </Section>

      {/* ---- Standards and the free tools, by name ---- */}
      <Section tone="ground" pad="md" bordered>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4">
            <p className="label-instr">{dict.landing.standards}</p>
            {/* Same clipping check as the steps: static cells, nothing focusable. */}
            <div className="grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-2">
              {standards.map((name) => (
                <div key={name} className="bg-ground px-6 py-5">
                  <span className="data-instr type-h3">{name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <p className="label-instr">{dict.landing.toolsLabel}</p>
            <div className="divide-y divide-hairline rounded-panel border border-hairline">
              {tools.map((tool, i) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={`type-h3 flex items-center justify-between gap-4 px-6 py-5 transition-colors duration-150 hover:bg-surface-2 ${
                    i === 0 ? "rounded-t-panel" : ""
                  } ${i === tools.length - 1 ? "rounded-b-panel" : ""}`}
                >
                  {tool.name}
                  <span aria-hidden="true" className="text-fg-secondary">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ---- Closing call to action ---- */}
      <Section tone="surface" pad="md" bordered innerClassName="text-center">
        <Reveal>
          <h2 className="type-display-sm mx-auto max-w-[18ch]">
            {dict.landing.finalTitle}
          </h2>
          <div className="mt-8 flex justify-center">
            <LinkButton href={cta.href} variant="primary" size="lg">
              {cta.label}
            </LinkButton>
          </div>
        </Reveal>
      </Section>

      <Footer dict={dict} />
    </main>
  );
}

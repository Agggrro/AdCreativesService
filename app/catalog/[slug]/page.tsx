import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { demoConfig, demoUnitKey, slugToType } from "@/lib/template-demo";
import { AppTopBar } from "@/components/AppTopBar";
import { VpaidPreview } from "@/components/VpaidPreview";
import { SubscribeButton } from "@/components/SubscribeButton";
import { LinkButton } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const { dict } = await getDict();

  const [{ data: template }, { data: auth }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, description, type, supported_standards, runtime_keys, config_schema")
      .eq("type", slugToType(slug))
      .eq("is_published", true)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!template) notFound();

  const user = auth.user;
  const unitKey = demoUnitKey(template.runtime_keys);
  // "photo" (not the neutral public/demo/ placeholders): the same seeded
  // photographic demo imagery as the landing hero, so a template's own page
  // never shows an empty gray well (docs/design-system.md §6).
  const config = unitKey ? demoConfig(template.config_schema, unitKey, "photo") : null;

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-10">
        <Link
          href="/catalog"
          className="self-start text-[13px] text-fg-muted underline underline-offset-4 hover:text-fg"
        >
          {dict.catalog.backToCatalog}
        </Link>

        <div className="flex flex-col gap-3">
          <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-balance">
            {template.name}
          </h1>
          <p className="max-w-[66ch] text-[15px] leading-6 text-fg-secondary">
            {template.description}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-instr">{dict.catalog.standards}</span>
            {template.supported_standards.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user ? (
            <LinkButton
              href={`/dashboard/creatives/new?template=${template.id}`}
              variant="primary"
            >
              {dict.catalog.configure}
            </LinkButton>
          ) : (
            <LinkButton href="/signup" variant="primary">
              {dict.catalog.signInToConfigure}
            </LinkButton>
          )}
          {/* Single-template purchase lived only in the old dashboard table;
              without it here that revenue path has no entry point (ADR-0008). */}
          {user && (
            <>
              <SubscribeButton
                planKey="single_weekly"
                templateId={template.id}
                variant="secondary"
              >
                {dict.catalog.subscribeWeekly}
              </SubscribeButton>
              <SubscribeButton
                planKey="single_monthly"
                templateId={template.id}
                variant="ghost"
              >
                {dict.catalog.subscribeMonthly}
              </SubscribeButton>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="label-instr">{dict.catalog.demoTitle}</h2>
          {unitKey && config ? (
            <VpaidPreview
              templateKey={unitKey}
              config={config}
              caption={dict.catalog.demoHint}
            />
          ) : (
            <Panel className="p-5">
              <p className="text-[13px] leading-5 text-fg-muted">
                {dict.catalog.noDemo}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}

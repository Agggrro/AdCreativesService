import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createCreative } from "@/app/dashboard/creatives/actions";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { parseConfigSchema } from "@/lib/config-schema";
import { getDict } from "@/lib/i18n/server";
import { ConfiguratorForm } from "@/components/ConfiguratorForm";
import { Notice } from "@/components/ui/Field";

export default async function NewCreativePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; error?: string; field?: string }>;
}) {
  const sp = await searchParams;
  // Picking a template is the catalog's job now — there is no second picker
  // to keep in sync with it (ADR-0008).
  if (!sp.template) redirect("/catalog");

  const supabase = await createServerSupabase();
  const { dict } = await getDict();

  const { data: template } = await supabase
    .from("templates")
    .select("id, name, supported_standards, config_schema")
    .eq("id", sp.template)
    .eq("is_published", true)
    .maybeSingle();

  if (!template) {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-small text-fg-muted">
          {dict.configurator.notFound}
        </p>
        <Link
          href="/catalog"
          className="type-small font-medium text-fg underline underline-offset-4"
        >
          {dict.catalog.backToCatalog}
        </Link>
      </div>
    );
  }

  const { fields, groups } = parseConfigSchema(template.config_schema);
  const message = creativeErrorMessage(dict, sp.error, sp.field);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="type-h2">
          {dict.configurator.configureTitle}: {template.name}
        </h1>
        <p className="type-small max-w-[66ch] text-fg-secondary">
          {dict.configurator.configureSubtitle}
        </p>
      </div>

      {message && <Notice tone="dead">{message}</Notice>}

      <ConfiguratorForm
        template={template}
        fields={fields}
        groups={groups}
        action={createCreative}
        submitLabel={dict.dashboard.createCreative}
      />
    </div>
  );
}

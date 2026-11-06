import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createCreative } from "@/app/dashboard/creatives/actions";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { parseConfigSchema } from "@/lib/config-schema";
import { getDict } from "@/lib/i18n/server";
import { ConfiguratorWorkspace } from "@/components/configurator/ConfiguratorWorkspace";
import { DashboardShell } from "@/components/DashboardShell";

export default async function NewCreativePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; error?: string; field?: string }>;
}) {
  const sp = await searchParams;
  // Picking a template is the new-creative sheet's job (ADR-0038), and an address
  // that names none opens it on the list.
  if (!sp.template) redirect("/dashboard/creatives?new=1");

  const supabase = await createServerSupabase();
  const { dict } = await getDict();

  const { data: template } = await supabase
    .from("templates")
    .select("id, name, supported_standards, config_schema")
    .eq("id", sp.template)
    .eq("is_published", true)
    // A system template (ADR-0035) is configured in its own tool, never through
    // the schema-driven form: its config_schema declares only its click fields.
    .eq("in_catalog", true)
    .maybeSingle();

  if (!template) {
    return (
      <DashboardShell>
        <div className="flex flex-col gap-3">
          <p className="type-small text-fg-muted">{dict.configurator.notFound}</p>
          <Link
            href="/catalog"
            className="type-small font-medium text-fg underline underline-offset-4"
          >
            {dict.catalog.backToCatalog}
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const { fields, groups } = parseConfigSchema(template.config_schema);
  const message = creativeErrorMessage(dict, sp.error, sp.field);

  return (
    <ConfiguratorWorkspace
      mode="create"
      heading={`${dict.configurator.configureTitle}: ${template.name}`}
      template={template}
      fields={fields}
      groups={groups}
      action={createCreative}
      message={message}
    />
  );
}

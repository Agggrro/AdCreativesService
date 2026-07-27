import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createCreative } from "@/app/dashboard/creatives/actions";
import { parseConfigSchema } from "@/lib/config-schema";
import { getDict } from "@/lib/i18n/server";
import { ConfiguratorForm } from "@/components/ConfiguratorForm";
import { Notice } from "@/components/ui/Field";

/** Error codes from the save action → copy, in the reader's language (§8). */
function errorMessage(
  dict: Awaited<ReturnType<typeof getDict>>["dict"],
  code: string | undefined,
  field: string | undefined,
): string | null {
  const c = dict.configurator;
  switch (code) {
    case "format_required":
      return c.errFormatRequired;
    case "template_not_found":
      return c.errTemplateNotFound;
    case "field_required":
      return field ? `${c.errFieldRequired}: ${field}` : c.errFieldRequired;
    case "name_too_long":
      return c.errNameTooLong;
    case "save_failed":
      return c.errSaveFailed;
    default:
      return code ? c.errSaveFailed : null;
  }
}

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
        <p className="text-[13px] text-fg-muted">
          {dict.configurator.notFound}
        </p>
        <Link
          href="/catalog"
          className="text-[13px] font-medium text-fg underline underline-offset-4"
        >
          {dict.catalog.backToCatalog}
        </Link>
      </div>
    );
  }

  const { fields } = parseConfigSchema(template.config_schema);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">
          {dict.configurator.configureTitle}: {template.name}
        </h1>
        <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
          {dict.configurator.configureSubtitle}
        </p>
      </div>

      {(() => {
        const message = errorMessage(dict, sp.error, sp.field);
        return message ? <Notice tone="dead">{message}</Notice> : null;
      })()}

      <ConfiguratorForm
        template={template}
        fields={fields}
        createCreative={createCreative}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { updateCreative } from "@/app/dashboard/creatives/actions";
import { creativeErrorMessage } from "@/lib/creative-errors";
import { parseConfigSchema } from "@/lib/config-schema";
import { getDict } from "@/lib/i18n/server";
import { ConfiguratorForm } from "@/components/ConfiguratorForm";
import { Notice } from "@/components/ui/Field";

export default async function EditCreativePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const { dict } = await getDict();

  // RLS (`creatives_select_own`) already scopes this read to the caller.
  const { data: creative } = await supabase
    .from("creatives")
    .select("id, name, selected_format, template_id, config_json")
    .eq("id", id)
    .maybeSingle();
  if (!creative) notFound();

  const { data: template } = await supabase
    .from("templates")
    .select("id, name, supported_standards, config_schema")
    .eq("id", creative.template_id)
    .eq("is_published", true)
    .maybeSingle();

  if (!template) {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-small text-fg-muted">
          {dict.configurator.notFound}
        </p>
        <Link
          href="/dashboard/creatives"
          className="type-small font-medium text-fg underline underline-offset-4"
        >
          {dict.dashboard.creatives}
        </Link>
      </div>
    );
  }

  const { fields, groups } = parseConfigSchema(template.config_schema);
  const message = creativeErrorMessage(dict, sp.error, sp.field);

  // Every field starts from its saved value; a field added to the schema
  // since this creative was built (never saved, so absent from config_json)
  // falls back to "" like a fresh form, not to the schema default.
  //
  // `select` is the one exception, and it is not cosmetic: a controlled <select>
  // whose value matches no <option> renders *blank*, and a required one then
  // blocks submit outright — so a creative saved before the field existed could
  // never be edited again until the user noticed an empty dropdown. It starts at
  // the schema default instead, which is what makes adding a required select to
  // a template a no-migration change.
  const savedConfig = (creative.config_json ?? {}) as Record<string, unknown>;
  const initialFieldValues: Record<string, string> = {};
  for (const field of fields) {
    const v = savedConfig[field.name];
    if (v !== undefined && v !== null) {
      initialFieldValues[field.name] = String(v);
    } else if (field.type === "select") {
      initialFieldValues[field.name] = String(
        field.default ?? field.options?.[0]?.value ?? "",
      );
    } else {
      initialFieldValues[field.name] = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="type-h2">
          {dict.configurator.configureTitle}: {creative.name ?? template.name}
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
        action={updateCreative}
        submitLabel={dict.dashboard.saveChanges}
        cancelHref={`/dashboard/creatives/${creative.id}`}
        creativeId={creative.id}
        initialName={creative.name ?? ""}
        initialFormat={creative.selected_format}
        initialFieldValues={initialFieldValues}
      />
    </div>
  );
}

import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { createCreative } from "@/app/dashboard/creatives/actions";
import { parseConfigSchema } from "@/lib/config-schema";
import { ConfiguratorForm } from "@/components/ConfiguratorForm";

export default async function NewCreativePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabase();

  // No template chosen yet → let the user pick one.
  if (!sp.template) {
    const { data: templates } = await supabase
      .from("templates")
      .select("id, name, description")
      .eq("is_published", true)
      .order("name");

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Choose a template</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {(templates ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/creatives/new?template=${t.id}`}
              className="rounded-lg border border-gray-200 p-4 hover:border-black"
            >
              <h2 className="font-medium">{t.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{t.description}</p>
            </Link>
          ))}
          {(!templates || templates.length === 0) && (
            <p className="text-sm text-gray-500">No templates published yet.</p>
          )}
        </div>
      </div>
    );
  }

  const { data: template } = await supabase
    .from("templates")
    .select("id, name, supported_standards, config_schema")
    .eq("id", sp.template)
    .eq("is_published", true)
    .maybeSingle();

  if (!template) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Template not found.</p>
        <Link href="/dashboard/creatives/new" className="underline">
          Back to templates
        </Link>
      </div>
    );
  }

  const { fields } = parseConfigSchema(template.config_schema);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Configure: {template.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in the creative details, pick a delivery format, then try it in
          the player before saving.
        </p>
      </div>

      {sp.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.error}
        </p>
      )}

      <ConfiguratorForm
        template={template}
        fields={fields}
        createCreative={createCreative}
      />
    </div>
  );
}

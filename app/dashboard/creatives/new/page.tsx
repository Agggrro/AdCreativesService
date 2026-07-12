import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { createCreative } from "@/app/dashboard/creatives/actions";
import { parseConfigSchema, type ConfigField } from "@/lib/config-schema";

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
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Configure: {template.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in the creative details and pick a delivery format.
        </p>
      </div>

      {sp.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.error}
        </p>
      )}

      <form action={createCreative} className="space-y-5">
        <input type="hidden" name="template_id" value={template.id} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Delivery format</legend>
          <div className="flex gap-3">
            {template.supported_standards.map((s, i) => (
              <label
                key={s}
                className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="selected_format"
                  value={s}
                  defaultChecked={i === 0}
                  required
                />
                <span className="uppercase">{s}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {fields.map((field) => (
          <Field key={field.name} field={field} />
        ))}

        {fields.length === 0 && (
          <p className="text-sm text-gray-500">
            This template has no configurable fields.
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create creative
          </button>
          <Link href="/dashboard" className="text-sm text-gray-500 underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ field }: { field: ConfigField }) {
  const base =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black";
  const def = field.default;

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {field.label}
        {field.required ? " *" : ""}
      </span>

      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          required={field.required}
          placeholder={field.placeholder}
          defaultValue={typeof def === "string" ? def : undefined}
          rows={3}
          className={base}
        />
      ) : field.type === "select" ? (
        <select
          name={field.name}
          required={field.required}
          defaultValue={def !== undefined ? String(def) : undefined}
          className={base}
        >
          {!field.required && <option value="">—</option>}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "range" ? (
        <input
          name={field.name}
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 100}
          defaultValue={def !== undefined ? String(def) : undefined}
          className="w-full"
        />
      ) : (
        <input
          name={field.name}
          type={
            field.type === "number"
              ? "number"
              : field.type === "url" || field.type === "image"
                ? "url"
                : "text"
          }
          required={field.required}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          placeholder={field.placeholder}
          defaultValue={def !== undefined ? String(def) : undefined}
          className={base}
        />
      )}

      {field.help && <span className="text-xs text-gray-400">{field.help}</span>}
    </label>
  );
}

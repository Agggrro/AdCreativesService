"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseConfigSchema, coerceFieldValue } from "@/lib/config-schema";
import type { Json } from "@/types/database.types";

export async function createCreative(formData: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const templateId = String(formData.get("template_id") ?? "");
  const selectedFormat = String(formData.get("selected_format") ?? "");
  const fail = (msg: string) =>
    redirect(
      `/dashboard/creatives/new?template=${templateId}&error=${encodeURIComponent(msg)}`,
    );

  if (!templateId || !selectedFormat) fail("Template and format are required");

  // Load the template's schema and build config_json generically from it.
  const { data: template } = await supabase
    .from("templates")
    .select("config_schema")
    .eq("id", templateId)
    .eq("is_published", true)
    .maybeSingle();
  if (!template) fail("Template not found");

  const { fields } = parseConfigSchema(template!.config_schema);
  const config_json: Record<string, Json> = {};
  for (const field of fields) {
    const value = coerceFieldValue(field, String(formData.get(field.name) ?? ""));
    if (value === undefined) {
      if (field.required) fail(`${field.label} is required`);
      continue;
    }
    config_json[field.name] = value;
  }

  const { error } = await supabase.from("creatives").insert({
    user_id: user.id,
    template_id: templateId,
    selected_format: selectedFormat,
    config_json,
    status: "active",
  });
  if (error) fail(error.message);

  redirect("/dashboard");
}

"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseConfigSchema, coerceFieldValue } from "@/lib/config-schema";
import type { CreativeError } from "@/lib/creative-errors";
import type { Json } from "@/types/database.types";

export async function createCreative(formData: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const templateId = String(formData.get("template_id") ?? "");
  const selectedFormat = String(formData.get("selected_format") ?? "");

  // Redirect with an error *code*, never a message: the page renders it through
  // the dictionary, so the user sees their own language and never a raw
  // PostgREST string (docs/design-system.md §8). `field` names the offending
  // input for the one error that has one.
  const fail = (code: CreativeError, field?: string) =>
    redirect(
      `/dashboard/creatives/new?template=${templateId}&error=${code}${
        field ? `&field=${encodeURIComponent(field)}` : ""
      }`,
    );

  if (!templateId || !selectedFormat) fail("format_required");

  // Load the template's schema and build config_json generically from it.
  const { data: template } = await supabase
    .from("templates")
    .select("config_schema")
    .eq("id", templateId)
    .eq("is_published", true)
    .maybeSingle();
  if (!template) fail("template_not_found");

  const { fields } = parseConfigSchema(template!.config_schema);
  const config_json: Record<string, Json> = {};
  for (const field of fields) {
    const value = coerceFieldValue(field, String(formData.get(field.name) ?? ""));
    if (value === undefined) {
      if (field.required) fail("field_required", field.label);
      continue;
    }
    config_json[field.name] = value;
  }

  // Optional label. Empty stays NULL so the list falls back to the template
  // name rather than showing a blank cell; capped to the column's check.
  const rawName = String(formData.get("name") ?? "").trim();
  if (rawName.length > 200) fail("name_too_long");

  const { error } = await supabase.from("creatives").insert({
    user_id: user.id,
    template_id: templateId,
    name: rawName || null,
    selected_format: selectedFormat,
    config_json,
    status: "active",
  });
  // The DB message is for our logs, not for a media buyer's screen.
  if (error) {
    console.error("createCreative insert failed", error);
    fail("save_failed");
  }

  redirect("/dashboard/creatives");
}

/**
 * Same schema-driven build as createCreative, but updates an existing row in
 * place. The template a creative was built from never changes on edit — only
 * its name, delivery format, and field values do — so template_id here is
 * read-only context (the hidden field ConfiguratorForm already sends),
 * never picked from a second template.
 */
export async function updateCreative(formData: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creativeId = String(formData.get("creative_id") ?? "");
  const selectedFormat = String(formData.get("selected_format") ?? "");

  const fail = (code: CreativeError, field?: string) =>
    redirect(
      `/dashboard/creatives/${creativeId}/edit?error=${code}${
        field ? `&field=${encodeURIComponent(field)}` : ""
      }`,
    );

  if (!creativeId) fail("save_failed");
  if (!selectedFormat) fail("format_required");

  // The template comes from the stored row, not the form's hidden field: an
  // edit never changes which template a creative is built from, so trusting a
  // submitted value would let a tampered form validate the config against a
  // *different* template's schema and save it against this one. RLS
  // (`creatives_select_own`) also makes this the ownership check.
  const { data: creative } = await supabase
    .from("creatives")
    .select("template_id")
    .eq("id", creativeId)
    .maybeSingle();
  if (!creative) fail("save_failed");

  const { data: template } = await supabase
    .from("templates")
    .select("config_schema")
    .eq("id", creative!.template_id)
    .eq("is_published", true)
    .maybeSingle();
  if (!template) fail("template_not_found");

  const { fields } = parseConfigSchema(template!.config_schema);
  const config_json: Record<string, Json> = {};
  for (const field of fields) {
    const value = coerceFieldValue(field, String(formData.get(field.name) ?? ""));
    if (value === undefined) {
      if (field.required) fail("field_required", field.label);
      continue;
    }
    config_json[field.name] = value;
  }

  const rawName = String(formData.get("name") ?? "").trim();
  if (rawName.length > 200) fail("name_too_long");

  // RLS (`creatives_update_own`) already scopes this to the caller's own row;
  // an update that matches nobody's row (someone else's creative_id) just
  // affects zero rows rather than erroring.
  const { error } = await supabase
    .from("creatives")
    .update({
      name: rawName || null,
      selected_format: selectedFormat,
      config_json,
    })
    .eq("id", creativeId);
  if (error) {
    console.error("updateCreative update failed", error);
    fail("save_failed");
  }

  redirect(`/dashboard/creatives/${creativeId}`);
}

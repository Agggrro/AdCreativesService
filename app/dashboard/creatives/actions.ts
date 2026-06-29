"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

export async function createCreative(formData: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const templateId = String(formData.get("template_id") ?? "");
  const selectedFormat = String(formData.get("selected_format") ?? "");
  const videoUrl = String(formData.get("video_url") ?? "").trim();
  const clickThroughUrl = String(formData.get("click_through_url") ?? "").trim();
  const durationRaw = String(formData.get("duration_seconds") ?? "").trim();

  if (!templateId || !selectedFormat || !videoUrl) {
    redirect(
      `/dashboard/creatives/new?template=${templateId}&error=${encodeURIComponent(
        "Template, format and video URL are required",
      )}`,
    );
  }

  const config_json: Record<string, Json> = { videoUrl };
  if (clickThroughUrl) config_json.clickThroughUrl = clickThroughUrl;
  const duration = Number(durationRaw);
  if (Number.isFinite(duration) && duration > 0) {
    config_json.durationSeconds = duration;
  }

  const { error } = await supabase.from("creatives").insert({
    user_id: user.id,
    template_id: templateId,
    selected_format: selectedFormat,
    config_json,
    status: "active",
  });

  if (error) {
    redirect(
      `/dashboard/creatives/new?template=${templateId}&error=${encodeURIComponent(
        error.message,
      )}`,
    );
  }

  redirect("/dashboard");
}

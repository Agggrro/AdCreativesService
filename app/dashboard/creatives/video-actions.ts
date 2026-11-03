"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { MEDIA_MAX_BYTES, ownMediaRefs } from "@/lib/creative-media";
import { objectSize, r2 } from "@/lib/r2";
import { publishOrClear } from "@/lib/serving/publish-or-clear";
import { getCdnUrl, getSiteUrl } from "@/lib/site";
import { UUID_RE } from "@/lib/uuid";
import { inspect } from "@/lib/vast-inspect";
import type { InspectReport } from "@/lib/vast-inspect/model";
import type { GeneratorActionState } from "@/lib/vast-gen/action-state";
import { buildVideoVast } from "@/lib/vast-gen/build";
import { VIDEO_FORMAT, VIDEO_TEMPLATE_TYPE } from "@/lib/vast-gen/kind";
import type { VideoConfig } from "@/lib/vast-gen/model";
import { PREVIEW_CREATIVE_ID, previewBeacons } from "@/lib/vast-gen/preview";
import { parseVideoConfig } from "@/lib/vast-gen/validate";
import type { Json } from "@/types/database.types";

/**
 * Saving a VAST video creative (ADR-0035). Both actions are reachable by
 * anyone who can POST (docs: Next "Server Actions", Security), so each one
 * re-derives everything from the session and the submitted config, and trusts
 * neither the form's own validation nor anything it claims about a file.
 *
 * What only the server can add, on top of `parseVideoConfig`'s `save` mode:
 * - every upload is HEAD-ed in R2, so a creative is never saved pointing at a
 *   file that is not there, and the video's size — and with it the bitrate — is
 *   R2's, not the browser's. An upload that cannot be HEAD-ed is refused;
 * - the document the creative will serve is built and run through our own
 *   validator, and any error or warning refuses the save. A tag our validator
 *   would flag is a defect in one of the two, and must not reach a DSP.
 *
 * The columns written are exactly the ones `authenticated` is granted on
 * `creatives` (docs/security.md, "Column grants on `creatives`").
 */

/** The raw form value, before JSON.parse — the validator's own cap is on the parsed object. */
const MAX_CONFIG_CHARS = 64 * 1024;
/** `creatives.name`'s check. */
const NAME_MAX_LENGTH = 200;

type Prepared =
  | { ok: true; config: VideoConfig; name: string }
  | { ok: false; state: GeneratorActionState };

/**
 * The size of every upload the config points at, keyed by URL — or why not.
 * R2 has no RLS: the key shape and the owner prefix were checked by the
 * validator; this confirms each object exists. The legacy Supabase store, or a
 * deployment without R2, cannot be asked, so its upload is refused rather than
 * saved on the browser's word.
 */
async function uploadSizes(
  config: VideoConfig,
  ownerId: string,
): Promise<{ ok: true; sizes: Map<string, number> } | { ok: false; state: GeneratorActionState }> {
  const store = r2();
  const refs = ownMediaRefs(config, ownerId);
  if (refs.some((ref) => ref.store !== "r2") || (refs.length > 0 && !store)) {
    return { ok: false, state: { error: "media_missing" } };
  }
  const results = await Promise.allSettled(refs.map((ref) => objectSize(store!, ref.key)));
  const sizes = new Map<string, number>();
  let missing = false;
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error("video creative save: R2 HEAD failed", { key: refs[index].key, err: String(result.reason) });
      return { ok: false, state: { error: "save_failed" } };
    }
    const size = result.value;
    if (size === null || !Number.isFinite(size) || size <= 0 || size > MEDIA_MAX_BYTES) missing = true;
    else sizes.set(refs[index].url, size);
  }
  return missing ? { ok: false, state: { error: "media_missing" } } : { ok: true, sizes };
}

async function prepare(formData: FormData, ownerId: string): Promise<Prepared> {
  const raw = formData.get("config");
  if (typeof raw !== "string" || !raw) {
    return { ok: false, state: { error: "issues", issues: [{ path: "", code: "bad_shape" }] } };
  }
  if (raw.length > MAX_CONFIG_CHARS) {
    return { ok: false, state: { error: "issues", issues: [{ path: "", code: "too_large" }] } };
  }
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { ok: false, state: { error: "issues", issues: [{ path: "", code: "bad_shape" }] } };
  }

  const parsed = parseVideoConfig(input, { mode: "save", ownerId });
  if (!parsed.ok) return { ok: false, state: { error: "issues", issues: parsed.issues } };

  const uploads = await uploadSizes(parsed.config, ownerId);
  if (!uploads.ok) return { ok: false, state: uploads.state };
  // The video's size is R2's. Parsed once more with it, so the bitrate is
  // derived where it always is, and the object stored is exactly one the
  // validator accepts — size cap included — which is what `/v` will read.
  const videoBytes = uploads.sizes.get(parsed.config.media.url);
  const final = parseVideoConfig(
    { ...parsed.config, media: { ...parsed.config.media, ...(videoBytes !== undefined ? { bytes: videoBytes } : {}) } },
    { mode: "save", ownerId },
  );
  if (!final.ok) return { ok: false, state: { error: "issues", issues: final.issues } };
  const config = final.config;

  // Our own validator on the document this creative will serve: placeholder
  // beacons stand in for the signed ones, and the click-throughs go through
  // `/r` as they will on air, so the check sees what a player will.
  const xml = buildVideoVast(config, previewBeacons(getCdnUrl(), { routeClicks: true }), {
    creativeId: PREVIEW_CREATIVE_ID,
  });
  let report: InspectReport;
  try {
    report = await inspect({ mode: "xml", value: xml, pixelMode: "live", origin: getSiteUrl() });
  } catch (err) {
    console.error("video creative save: our own validator threw", { err: String(err) });
    return { ok: false, state: { error: "save_failed" } };
  }
  const loud = report.findings.find((finding) => finding.severity !== "advisory");
  if (loud || report.degraded.length > 0) {
    console.error("video creative save: refused by our own validator", {
      ruleId: loud?.ruleId,
      degraded: report.degraded,
    });
    return {
      ok: false,
      state: { error: "self_check", ...(loud ? { finding: loud.message } : {}) },
    };
  }

  // An unnamed creative is named after its tag's title, so the list never shows
  // the system template's own name for every row.
  const typed = String(formData.get("name") ?? "").trim() || config.adTitle;
  const name = Array.from(typed).slice(0, NAME_MAX_LENGTH).join("");
  return { ok: true, config, name };
}

export async function createVideoCreative(
  _state: GeneratorActionState,
  formData: FormData,
): Promise<GeneratorActionState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const prepared = await prepare(formData, user.id);
  if (!prepared.ok) return prepared.state;

  // The system template is found by type: it is published, so RLS lets the
  // session read it, and the trigger checks `video` against its standards.
  const { data: template } = await supabase
    .from("templates")
    .select("id")
    .eq("type", VIDEO_TEMPLATE_TYPE)
    .eq("is_published", true)
    .maybeSingle();
  if (!template) {
    console.error("createVideoCreative: the vast_video system template is missing or unpublished");
    return { error: "save_failed" };
  }

  const { data: created, error } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      template_id: template.id,
      name: prepared.name,
      selected_format: VIDEO_FORMAT,
      config_json: prepared.config as unknown as Json,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("createVideoCreative insert failed", error);
    return { error: "save_failed" };
  }

  await publishOrClear(created.id);
  redirect(`/dashboard/creatives/${created.id}`);
}

export async function updateVideoCreative(
  _state: GeneratorActionState,
  formData: FormData,
): Promise<GeneratorActionState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  // Lower-cased: the snapshot keys are, and a failed publish must clear the
  // key the serving path reads, not a differently-cased twin of it.
  const creativeId = String(formData.get("creative_id") ?? "").toLowerCase();
  if (!UUID_RE.test(creativeId)) return { error: "not_found" };

  // RLS (`creatives_select_own`) makes this the ownership check, and the format
  // is read from the row: a video action never rewrites an interactive creative.
  const { data: existing } = await supabase
    .from("creatives")
    .select("id, selected_format")
    .eq("id", creativeId)
    .maybeSingle();
  if (!existing || existing.selected_format !== VIDEO_FORMAT) return { error: "not_found" };

  const prepared = await prepare(formData, user.id);
  if (!prepared.ok) return prepared.state;

  const { data: updated, error } = await supabase
    .from("creatives")
    .update({
      name: prepared.name,
      config_json: prepared.config as unknown as Json,
    })
    .eq("id", creativeId)
    .select("id");
  if (error || !updated || updated.length === 0) {
    console.error("updateVideoCreative update failed", { creativeId, error });
    return { error: "save_failed" };
  }

  await publishOrClear(creativeId);
  redirect(`/dashboard/creatives/${creativeId}`);
}

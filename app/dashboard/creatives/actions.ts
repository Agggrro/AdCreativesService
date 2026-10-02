"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseConfigSchema, buildConfigFromValues } from "@/lib/config-schema";
import type { CreativeError } from "@/lib/creative-errors";
import {
  CREATIVE_MEDIA_BUCKET,
  ownMediaRefs,
  type MediaRef,
} from "@/lib/creative-media";
import { deleteObjects, r2 } from "@/lib/r2";
import { UUID_RE } from "@/lib/uuid";
import {
  publishCreativeSnapshot,
  unpublishCreativeSnapshot,
} from "@/lib/serving/publish";

/**
 * Publish the creative's serving snapshot, and on failure make sure no *stale*
 * snapshot is left behind (ADR-0015).
 *
 * A save is not rolled back when publishing fails, and the user is not shown an
 * error: the row is already committed, and `GET /api/vast` falls back to
 * Postgres whenever a snapshot is missing — so the tag keeps serving, correctly,
 * off the database. Telling a media buyer their save failed when it did not
 * would only produce duplicate creatives.
 *
 * Deleting on failure is the part that matters. A stale snapshot is worse than
 * no snapshot: it would serve the *previous* configuration indefinitely, while
 * its absence degrades to the fallback, which is right by construction.
 * `npm run snapshot:backfill` repairs the missing object afterwards.
 */
async function publishOrClear(creativeId: string): Promise<void> {
  try {
    await publishCreativeSnapshot(creativeId);
  } catch (err) {
    console.error("snapshot publish failed; clearing to force DB fallback", {
      creativeId,
      err,
    });
    try {
      await unpublishCreativeSnapshot(creativeId);
    } catch (clearErr) {
      // Both legs failed: the CDN may still hold an older configuration. Loud,
      // because only a backfill run will fix it.
      console.error("snapshot clear ALSO failed; stale snapshot may be serving", {
        creativeId,
        clearErr,
      });
    }
  }
}

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
  const { config: config_json, missingField } = buildConfigFromValues(fields, (name) =>
    String(formData.get(name) ?? ""),
  );
  if (missingField) fail("field_required", missingField);

  // Optional label. Empty stays NULL so the list falls back to the template
  // name rather than showing a blank cell; capped to the column's check.
  const rawName = String(formData.get("name") ?? "").trim();
  if (rawName.length > 200) fail("name_too_long");

  // `.select("id")` is what makes the row's id available to publish against;
  // RLS (`creatives_select_own`) scopes the read back to the caller's own row.
  const { data: created, error } = await supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      template_id: templateId,
      name: rawName || null,
      selected_format: selectedFormat,
      config_json,
      status: "active",
    })
    .select("id")
    .single();
  // The DB message is for our logs, not for a media buyer's screen.
  if (error || !created) {
    console.error("createCreative insert failed", error);
    fail("save_failed");
  }

  await publishOrClear(created!.id);

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
  const { config: config_json, missingField } = buildConfigFromValues(fields, (name) =>
    String(formData.get(name) ?? ""),
  );
  if (missingField) fail("field_required", missingField);

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

  await publishOrClear(creativeId);

  redirect(`/dashboard/creatives/${creativeId}`);
}

/**
 * Remove a deleted creative's media, best-effort, from both stores (ADR-0028).
 * Runs after the row is gone; a failure is logged, never surfaced.
 *
 * A file another of the user's creatives still references is kept. A buyer can
 * paste one of their uploads into a second creative — the field shows it as
 * theirs — and deleting it would break that creative's live tag. If the other
 * creatives cannot be read, nothing is deleted: an orphan is recoverable by
 * hand, a broken tag on a live campaign is not.
 *
 * Every remaining key goes to both stores. A migrated file keeps its Supabase
 * original under the same key (`npm run media:migrate` leaves it as the
 * rollback), and a copy that a half-finished migration left in R2 is no less
 * public. A key that is not there is no error in either store.
 */
async function removeMedia(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  creativeId: string,
  refs: MediaRef[],
): Promise<void> {
  const { data: others, error } = await supabase.from("creatives").select("config_json");
  if (error || !others) {
    console.error("deleteCreative kept its media: could not read the other creatives", {
      creativeId,
      error,
    });
    return;
  }
  const stillUsed = new Set(
    others.flatMap((row) => ownMediaRefs(row.config_json, userId).map((ref) => ref.key)),
  );
  const keys = [...new Set(refs.map((ref) => ref.key))].filter((key) => !stillUsed.has(key));
  if (keys.length === 0) return;

  const { error: storageError } = await supabase.storage
    .from(CREATIVE_MEDIA_BUCKET)
    .remove(keys);
  if (storageError) {
    console.error("deleteCreative left orphaned media", { creativeId, store: "supabase", keys, storageError });
  }

  // With the server's bucket-scoped key, never the user's session — R2 has no
  // RLS. `deleteObjects` refuses anything outside the user's prefix itself.
  const store = r2();
  if (store) {
    const failed = await deleteObjects(store, userId, keys);
    if (failed.length > 0) {
      console.error("deleteCreative left orphaned media", { creativeId, store: "r2", keys: failed });
    }
  } else if (refs.some((ref) => ref.store === "r2")) {
    console.error("deleteCreative left orphaned media", {
      creativeId,
      store: "r2",
      keys,
      reason: "R2 is not configured",
    });
  }
}

/**
 * Deletes a creative and the media it uploaded.
 *
 * Hard delete, not an archive: the row goes, and `creative_events` goes with it
 * through the FK cascade. That is a real loss of the buyer's delivery history,
 * so the confirmation dialog says so in as many words — see
 * `dashboard.deleteConfirmBody`. The schema does carry an `archived` status
 * that `should_serve` already gates on, which would kill the tag while keeping
 * the funnel; offering that instead is a product decision, not one this action
 * can make on its own.
 *
 * The media are collected **before** the row is deleted, because `config_json`
 * is the only record of which objects belonged to this creative. Lose the row
 * first and those files are unattributable forever — and both stores are
 * public-read, so they would stay fetchable at a URL that has been published in
 * every VAST tag ever served. The objects themselves are removed after the row,
 * for the reason given at that step. ADR-0010 deferred delete-time cleanup explicitly
 * "because there is no `deleteCreative` action yet"; this is that action, so the
 * deferral no longer applies.
 */
export async function deleteCreative(formData: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creativeId = String(formData.get("creative_id") ?? "");
  // Shape-check before any DB call, the house rule in docs/security.md.
  if (!UUID_RE.test(creativeId)) redirect("/dashboard/creatives");

  // Read the config first — RLS scopes this to the caller's own row, so a
  // foreign id simply finds nothing and we delete no files.
  const { data: existing } = await supabase
    .from("creatives")
    .select("config_json")
    .eq("id", creativeId)
    .maybeSingle();

  // This null check is now an authorization gate, not just a convenience. Under
  // RLS "belongs to someone else" and "does not exist" are the same zero rows,
  // and everything below has side effects outside the row's own RLS scope — the
  // snapshot delete especially. Without stopping here, posting a stranger's
  // creative_id would unpublish their snapshot.
  if (!existing) {
    console.error("deleteCreative found no owned row", { creativeId });
    redirect("/dashboard/creatives?error=delete_failed");
  }

  const media = ownMediaRefs(existing.config_json, user.id);

  // Snapshot before row — the opposite order to the media cleanup below, and
  // for the opposite reason. An orphaned media file merely occupies space; an
  // orphaned snapshot keeps serving ads for a creative the user has been told
  // is gone, because the serving path would never reach the database to
  // discover the row is missing. So this one is a precondition, not a
  // best-effort follow-up: if it fails, the row stays and the user is told the
  // delete failed.
  try {
    await unpublishCreativeSnapshot(creativeId);
  } catch (err) {
    console.error("deleteCreative could not remove the snapshot; row kept", {
      creativeId,
      err,
    });
    redirect("/dashboard/creatives?error=delete_failed");
  }

  // RLS (`creatives_delete_own`) scopes this to the caller's own row; an id
  // that matches nobody's row (someone else's creative) deletes zero rows
  // rather than erroring. `.select()` is what makes that visible: without it
  // the action has no signal that it did anything, so if the policy were ever
  // dropped every delete would silently no-op while the UI reported success.
  // Telling the user "nothing was deleted" leaks nothing — under RLS, "belongs
  // to someone else" and "does not exist" are the same zero rows.
  const { data: deleted, error } = await supabase
    .from("creatives")
    .delete()
    .eq("id", creativeId)
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    console.error("deleteCreative affected no rows", { creativeId, error });
    redirect("/dashboard/creatives?error=delete_failed");
  }

  // Best-effort, and deliberately after the row is gone: a storage failure must
  // not resurrect a creative the user has already been told is deleted. The
  // orphan is recoverable by hand; a half-deleted creative is not.
  if (media.length > 0) await removeMedia(supabase, user.id, creativeId, media);

  redirect("/dashboard/creatives");
}

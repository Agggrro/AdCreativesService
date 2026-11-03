import { requestMediaUpload, type MediaUploadTicket } from "@/app/dashboard/creatives/media-actions";
import { CREATIVE_MEDIA_BUCKET, buildMediaObjectPath } from "@/lib/creative-media";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Uploading one advertiser file from the browser, shared by the configurator's
 * media field and the VAST generator (ADR-0035). The server action mints the
 * key and checks the session, type and size; the bytes go straight from the
 * browser to the store (ADR-0028).
 */

export type UploadFailure = "wrong_type" | "too_large" | "unauthorized" | "failed";

/**
 * PUT the file to a presigned R2 URL (ADR-0028). The `Content-Type` sent must
 * be the one that was signed; the browser adds the matching `Content-Length`
 * itself, and R2 refuses the upload if either differs from the declaration.
 */
async function uploadToR2(
  ticket: Extract<MediaUploadTicket, { store: "r2" }>,
  file: File,
): Promise<string | null> {
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  return res.ok ? ticket.publicUrl : null;
}

/**
 * The pre-ADR-0028 path, for a deployment without the R2 variables: straight
 * into the Storage bucket, under the user's own prefix (its RLS insert policy).
 */
async function uploadToSupabase(file: File): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = user ? buildMediaObjectPath(user.id, file.type) : null;
  if (!path) return null;
  const { error } = await supabase.storage
    .from(CREATIVE_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return null;
  return supabase.storage.from(CREATIVE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Upload `file`; its public URL, or why not. Never throws. */
export async function uploadMediaFile(file: File): Promise<{ url: string } | { error: UploadFailure }> {
  try {
    const ticket = await requestMediaUpload(file.type, file.size);
    if ("error" in ticket) return { error: ticket.error };
    const url = ticket.store === "r2" ? await uploadToR2(ticket, file) : await uploadToSupabase(file);
    return url ? { url } : { error: "failed" };
  } catch {
    return { error: "failed" };
  }
}

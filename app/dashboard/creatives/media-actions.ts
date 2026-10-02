"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  MEDIA_MAX_BYTES,
  buildMediaObjectPath,
  isAllowedMediaMime,
  r2MediaUrl,
} from "@/lib/creative-media";
import { presignUpload, r2 } from "@/lib/r2";

/**
 * Where the browser should put one file (ADR-0028).
 *
 * - `r2`: PUT the file to `uploadUrl`, then store `publicUrl` in the config.
 * - `supabase`: this deployment has no R2 variables — upload to the Storage
 *   bucket exactly as before ADR-0028.
 * - `error`: nothing to upload to; the codes map onto the field's own messages.
 */
export type MediaUploadTicket =
  | { store: "r2"; uploadUrl: string; publicUrl: string }
  | { store: "supabase" }
  | { error: "unauthorized" | "wrong_type" | "too_large" | "failed" };

/**
 * Mint an upload for the signed-in user. Both arguments come from the browser
 * and are checked here, not trusted: the type against the same allow-list the
 * Storage bucket enforces, the size against the same cap. Both are then signed
 * into the URL, so R2 refuses a body that differs from what was declared — the
 * check and the bytes cannot drift apart. The key is minted here, under the
 * caller's own prefix; the browser never names it.
 */
export async function requestMediaUpload(
  type: string,
  size: number,
): Promise<MediaUploadTicket> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  if (typeof type !== "string" || !isAllowedMediaMime(type)) return { error: "wrong_type" };
  if (!Number.isSafeInteger(size) || size <= 0) return { error: "failed" };
  if (size > MEDIA_MAX_BYTES) return { error: "too_large" };

  const store = r2();
  if (!store) return { store: "supabase" };

  const key = buildMediaObjectPath(user.id, type);
  const publicUrl = key ? r2MediaUrl(key) : null;
  if (!key || !publicUrl) return { error: "failed" };

  try {
    return { store: "r2", uploadUrl: await presignUpload(store, key, type, size), publicUrl };
  } catch (err) {
    console.error("requestMediaUpload could not sign an upload", { err });
    return { error: "failed" };
  }
}

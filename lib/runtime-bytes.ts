import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { CREATIVES_BUCKET } from "@/lib/storage";
import { runtimeAsset } from "@/lib/runtime-manifest";

/**
 * Read the bytes of one runtime object, for the proxy routes that must re-serve
 * it with headers of our own (`/api/creative/simid/[token]`, and the VPAID
 * fallback route).
 *
 * Prefers the public CDN copy recorded in `runtime/manifest.ts`: it is
 * content-addressed and cached for a year, so this fetch is almost always an
 * edge hit rather than a trip to origin storage.
 *
 * Falls back to the Supabase `creatives` bucket for any key not yet pushed to
 * the public store. That fallback is what lets this ship before the store
 * exists; it can go once `npm run runtime:push` has run for every template and
 * the manifest is committed.
 *
 * Returns null on every failure — both routes fail closed to a 404.
 */
export async function loadRuntimeBytes(
  logicalPath: string,
): Promise<ArrayBuffer | null> {
  const asset = runtimeAsset(logicalPath);

  if (asset) {
    try {
      const response = await fetch(asset.url);
      if (response.ok) return await response.arrayBuffer();
      // A manifest entry pointing at a missing object is a real problem — the
      // push and the commit have diverged — so say so rather than silently
      // falling back and hiding it.
      console.error("runtime manifest points at an unreachable object", {
        logicalPath,
        url: asset.url,
        status: response.status,
      });
    } catch (err) {
      console.error("runtime asset fetch failed", { logicalPath, err });
    }
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(CREATIVES_BUCKET)
      .download(logicalPath);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch {
    return null;
  }
}

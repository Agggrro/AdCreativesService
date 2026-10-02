import "server-only";
import { AwsClient } from "aws4fetch";
import { MEDIA_KEY_RE, MEDIA_MAX_BYTES, mediaExtension, mediaHost } from "@/lib/creative-media";

/**
 * Cloudflare R2 — the store behind media.smithcdn.net (ADR-0028) — over its S3
 * API, signed with aws4fetch rather than a hand-rolled SigV4.
 *
 * The credential is a token with object read and write on one bucket and
 * nothing else. It can still overwrite or delete any advertiser's media, and R2
 * has no row-level security, so the guards that RLS gives the Storage bucket
 * live here, in the functions that use the key: nothing is signed or deleted
 * that is not a key we mint, of a type we allow, under the right owner.
 */

export interface R2 {
  accountId: string;
  bucket: string;
  client: AwsClient;
}

/**
 * The R2 connection, or null unless every variable is set. Null is the switch
 * ADR-0028 describes: without R2, uploads go to Supabase Storage as before.
 * The media host is required too — an object nobody can fetch is no use in a tag.
 */
export function r2(): R2 | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !mediaHost()) return null;
  return {
    accountId,
    bucket,
    // aws4fetch retries a 5xx or 429 ten times with exponential backoff by
    // default — up to ~50 s, which a user deleting a creative would sit through.
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 2 }),
  };
}

/**
 * The S3 URL of one object. The key is validated and never encoded: its
 * alphabet (hex, `-`, `/`, `.`) needs no escaping, and refusing everything else
 * is what stops a crafted key from being normalized into another prefix.
 */
function objectUrl(r: R2, key: string): string {
  if (!MEDIA_KEY_RE.test(key)) throw new Error("not a media key");
  return `https://${r.accountId}.r2.cloudflarestorage.com/${r.bucket}/${key}`;
}

/**
 * How long a presigned upload stays usable. R2 checks the expiry when the
 * request starts, so a 25 MB upload begun at second 299 still finishes.
 */
export const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * A URL the browser can PUT exactly one file to: this key, this type, this
 * many bytes. `allHeaders` puts `content-type` and `content-length` in the
 * signature (aws4fetch leaves both out by default), so R2 answers a body of
 * any other size or type with `403 SignatureDoesNotMatch`. The type must be
 * one we allow and match the key's extension, and the size must be within the
 * cap — checked here as well as by the caller, because what this signs is what
 * R2 will accept.
 */
export async function presignUpload(
  r: R2,
  key: string,
  contentType: string,
  contentLength: number,
): Promise<string> {
  const ext = mediaExtension(contentType);
  if (!ext || !key.endsWith(`.${ext}`)) throw new Error("type does not match the key");
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MEDIA_MAX_BYTES) {
    throw new Error("size out of range");
  }
  const signed = await r.client.sign(
    new Request(`${objectUrl(r, key)}?X-Amz-Expires=${UPLOAD_URL_TTL_SECONDS}`, {
      method: "PUT",
      headers: { "content-type": contentType, "content-length": String(contentLength) },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

/** The size of an object in bytes, or null when there is none. Throws when R2 cannot say. */
export async function objectSize(r: R2, key: string): Promise<number | null> {
  const res = await r.client.fetch(objectUrl(r, key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
  return Number(res.headers.get("content-length") ?? NaN);
}

/** Store one object. Used by the migration from Supabase; uploads go browser-to-R2. */
export async function putObject(
  r: R2,
  key: string,
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<void> {
  const res = await r.client.fetch(objectUrl(r, key), {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}`);
}

/** Per-request ceiling on a delete, which runs while a user waits on a redirect. */
const DELETE_TIMEOUT_MS = 5000;

/**
 * Delete `ownerId`'s objects, one request each — a creative holds a handful.
 * Returns the keys that were not deleted, including any outside the owner's
 * prefix, which are refused rather than sent: the caller's own filter is not
 * the only guard. Only a 2xx counts — R2 answers 204 for a key that is already
 * gone, so a 404 here means a wrong bucket, not a done job.
 */
export async function deleteObjects(r: R2, ownerId: string, keys: string[]): Promise<string[]> {
  const failed: string[] = [];
  await Promise.all(
    keys.map(async (key) => {
      if (!key.startsWith(`${ownerId}/`)) {
        failed.push(key);
        return;
      }
      try {
        const res = await r.client.fetch(objectUrl(r, key), {
          method: "DELETE",
          signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
        });
        if (!res.ok) failed.push(key);
      } catch {
        failed.push(key);
      }
    }),
  );
  return failed;
}

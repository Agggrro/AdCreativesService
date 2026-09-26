import { createServiceClient } from "@/lib/supabase/service";
import { isPostbackSuccess, parsePostback, POSTBACK_KEY_RE } from "@/lib/postback";

// S2S conversion postbacks from partner networks (ADR-0023), public as `/pb`.
// Server to server: the caller is a network's backend, never a browser, so
// there is no CORS and no session. The key in the URL is the authentication.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
} as const;

/**
 * Plain text, because the body is what a network shows in its own postback log
 * — the owner reads "unknown_click" there before they ever open ours.
 */
function reply(status: number, body: string): Response {
  return new Response(body, { status, headers: HEADERS });
}

/**
 * Query string first, then a form body on top: most networks send GET, some
 * send a form POST with the same parameters. JSON bodies are not read — no
 * network among the common ones needs it, and it is one more parser on a
 * public endpoint.
 */
/** A postback is a handful of short fields; nothing past this is read. */
const BODY_MAX_BYTES = 8192;

/**
 * Read at most `max` bytes of the body and stop — rather than `text()`, which
 * buffers whatever arrives (up to the platform's 4.5 MB) before anything could
 * truncate it.
 */
async function readBody(request: Request, max: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes.subarray(0, max));
}

async function readParams(request: Request): Promise<URLSearchParams> {
  const params = new URL(request.url).searchParams;
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/x-www-form-urlencoded")) {
      const body = await readBody(request, BODY_MAX_BYTES);
      for (const [name, value] of new URLSearchParams(body)) params.set(name, value);
    }
  }
  return params;
}

async function handle(request: Request): Promise<Response> {
  let params: URLSearchParams;
  try {
    params = await readParams(request);
  } catch {
    return reply(400, "bad_request");
  }

  // Shape-checked before any database call, like every id on a public path
  // (docs/security.md): a junk key costs a regex, not a round trip.
  const key = (params.get("key") ?? "").trim().toLowerCase();
  if (!POSTBACK_KEY_RE.test(key)) return reply(403, "unknown_key");

  const input = parsePostback((name) => params.get(name));

  const { data, error } = await createServiceClient().rpc("record_postback", {
    p_key: key,
    p_click_id: input.clickId,
    p_status: input.status,
    p_payout: input.payout,
    p_currency: input.currency,
    p_txid: input.txid,
    p_error: input.error,
    p_params: input.params,
  });

  // 503, not 400: the network did nothing wrong, and most of them retry a 5xx.
  if (error || typeof data !== "string") return reply(503, "unavailable");

  if (isPostbackSuccess(data)) return reply(200, "OK");
  if (data === "unknown_key") return reply(403, data);
  return reply(400, data);
}

export function GET(request: Request): Promise<Response> {
  return handle(request);
}

export function POST(request: Request): Promise<Response> {
  return handle(request);
}

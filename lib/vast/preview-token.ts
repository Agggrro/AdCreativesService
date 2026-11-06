import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PreviewServingInput } from "./preview-context";

/**
 * Stateless, self-contained preview tokens: no DB row, no server-side cache
 * (the stack has neither Redis nor a shared-memory serverless runtime — see
 * ADR-0004). Short TTL mirrors lib/storage.ts's SIGNED_URL_TTL_SECONDS
 * convention (ADR-0003: short-lived, signed, per-request access).
 */
const PREVIEW_TTL_SECONDS = 120;
/**
 * The token travels as a URL *path segment*, base64url-encoded, so this bounds
 * the request line: 5600 bytes of payload is ~7.5KB of request line, just under
 * the 8KB most CDN front-ends allow (nginx's default
 * `large_client_header_buffers 4 8k`). That, not Vercel's larger URL+headers
 * budget, is the binding limit — which puts the architectural ceiling for this
 * mechanism at roughly 5.6KB. Past it the answer is a short opaque id backed by
 * a row, not a bigger token (ADR-0006, ADR-0011).
 *
 * Callers must reject earlier than this with their own limit: exceeding it
 * throws, and a throw on the mint path is a 500 where a 413 was intended.
 */
const MAX_PAYLOAD_BYTES = 5600;

/**
 * Either the whole preview, or — for a config past the ceiling above — a
 * reference to one kept under its id in KV (lib/vast/preview-store.ts,
 * ADR-0039). Both carry the same expiry and the same signature.
 */
export type PreviewTokenPayload =
  | (PreviewServingInput & { exp: number; ref?: undefined })
  | { pid: string; exp: number; ref: 1 };

function secret(): string {
  const s = process.env.PREVIEW_TOKEN_SECRET;
  if (!s) throw new Error("Missing PREVIEW_TOKEN_SECRET");
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

/** Mint a short-TTL preview token. Throws if the config is implausibly large. */
export function signPreviewToken(input: Omit<PreviewServingInput, "pid">): {
  token: string;
  previewId: string;
  expiresInSeconds: number;
} {
  const pid = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS;
  const payload: PreviewTokenPayload = { ...input, pid, exp };

  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error("Preview payload too large");
  }

  const payloadB64 = Buffer.from(json, "utf8").toString("base64url");
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return { token, previewId: pid, expiresInSeconds: PREVIEW_TTL_SECONDS };
}

/**
 * Mint a token that names a stored preview rather than carrying it. The caller
 * stores the config under `pid` first (storePreviewInput); a token for an id
 * nothing was stored under verifies fine and then finds nothing, which the
 * route answers with an empty VAST.
 */
export function signPreviewRefToken(pid: string): {
  token: string;
  previewId: string;
  expiresInSeconds: number;
} {
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS;
  const payload: PreviewTokenPayload = { pid, exp, ref: 1 };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${payloadB64}.${sign(payloadB64)}`,
    previewId: pid,
    expiresInSeconds: PREVIEW_TTL_SECONDS,
  };
}

/**
 * Verify a token's signature and expiry. Returns null on ANY problem — callers
 * must fail closed (empty VAST), exactly like the real /api/vast endpoint does
 * for a bad creative_id.
 */
export function verifyPreviewToken(token: string): PreviewTokenPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payloadB64), "base64url");
    actual = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Partial<PreviewServingInput> & { exp?: unknown; ref?: unknown };
    if (!parsed || typeof parsed.pid !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (parsed.ref === 1) return { pid: parsed.pid, exp: parsed.exp, ref: 1 };
    if (
      typeof parsed.tid !== "string" ||
      typeof parsed.fmt !== "string" ||
      !parsed.cfg ||
      typeof parsed.cfg !== "object" ||
      Array.isArray(parsed.cfg)
    ) {
      return null;
    }
    return parsed as PreviewTokenPayload;
  } catch {
    return null;
  }
}

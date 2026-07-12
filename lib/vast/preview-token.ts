import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PreviewServingInput } from "./preview-context";

/**
 * Stateless, self-contained preview tokens: no DB row, no server-side cache
 * (the stack has neither Redis nor a shared-memory serverless runtime — see
 * ADR-0004). Short TTL mirrors lib/storage.ts's SIGNED_URL_TTL_SECONDS
 * convention (ADR-0003: short-lived, signed, per-request access).
 */
const PREVIEW_TTL_SECONDS = 120;
const MAX_PAYLOAD_BYTES = 4096;

export interface PreviewTokenPayload extends PreviewServingInput {
  exp: number;
}

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
    ) as Partial<PreviewTokenPayload>;
    if (
      !parsed ||
      typeof parsed.pid !== "string" ||
      typeof parsed.tid !== "string" ||
      typeof parsed.fmt !== "string" ||
      typeof parsed.exp !== "number" ||
      !parsed.cfg ||
      typeof parsed.cfg !== "object" ||
      Array.isArray(parsed.cfg)
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed as PreviewTokenPayload;
  } catch {
    return null;
  }
}

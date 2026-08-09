import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authorizes exactly one Storage object path through the SIMID proxy route
 * (app/api/creative/simid/[token]/route.ts). Exists because Supabase Storage
 * always downgrades .html objects to `text/plain` with a script-blocking
 * `Content-Security-Policy: sandbox` — a deliberate, non-configurable
 * anti-XSS-hosting policy, not a bug in our bucket config — which silently
 * kills the SIMID postMessage handshake in every player. The interactive
 * document has to be re-served from our own domain with the right headers
 * instead of a direct Storage signed URL.
 *
 * Short TTL mirrors lib/storage.ts's SIGNED_URL_TTL_SECONDS convention
 * (ADR-0003: short-lived, signed, per-request access).
 */
const INTERACTIVE_TOKEN_TTL_SECONDS = 120;

/** Only ever proxy our own runtime SIMID documents, never an arbitrary bucket path. */
const SAFE_PATH_RE = /^[a-z0-9_-]+\/simid\/index\.html$/i;

interface InteractiveTokenPayload {
  path: string;
  exp: number;
}

/**
 * HMAC-derived, domain-separated key (track-token.ts's pattern): a fixed
 * label under PREVIEW_TOKEN_SECRET, not secret reuse, so this ships without a
 * new Vercel environment variable.
 */
function deriveKey(): Buffer {
  const master = process.env.PREVIEW_TOKEN_SECRET;
  if (!master) throw new Error("Missing PREVIEW_TOKEN_SECRET");
  return createHmac("sha256", master)
    .update("adinteract:interactive-token:v1")
    .digest();
}

function sign(payloadB64: string): string {
  return createHmac("sha256", deriveKey()).update(payloadB64).digest("base64url");
}

/** Mint a short-TTL token for one Storage object path. Throws if the path looks wrong. */
export function signInteractiveToken(path: string): {
  token: string;
  expiresInSeconds: number;
} {
  if (!SAFE_PATH_RE.test(path)) {
    throw new Error(`Refusing to mint an interactive token for an unexpected path: ${path}`);
  }
  const exp = Math.floor(Date.now() / 1000) + INTERACTIVE_TOKEN_TTL_SECONDS;
  const payloadB64 = Buffer.from(JSON.stringify({ path, exp }), "utf8").toString("base64url");
  return { token: `${payloadB64}.${sign(payloadB64)}`, expiresInSeconds: INTERACTIVE_TOKEN_TTL_SECONDS };
}

/**
 * Verify a token's signature, expiry, and path shape. Returns null on ANY
 * problem — the route must fail closed (404), exactly like /api/vast fails
 * closed to empty VAST.
 */
export function verifyInteractiveToken(token: string): { path: string } | null {
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
    ) as Partial<InteractiveTokenPayload>;
    if (typeof parsed.path !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (!SAFE_PATH_RE.test(parsed.path)) return null;
    return { path: parsed.path };
  } catch {
    return null;
  }
}

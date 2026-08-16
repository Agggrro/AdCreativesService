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
 * The lifetime of an interactive asset URL, and the single definition of it —
 * `lib/storage.ts` imports this rather than declaring its own. The dependency
 * runs in that direction and only that direction: storage already imports
 * `signInteractiveToken` from here, so pointing this constant the other way
 * makes the two modules circular, and the failure is `SIGNED_URL_TTL_SECONDS is
 * not initialized` at request time — invisible to typecheck, lint and build.
 *
 * Deliberately a little longer than the VAST response cache, so a cached VAST
 * can never hand a player a URL that has already expired (ADR-0003:
 * short-lived, signed, per-request access).
 */
export const INTERACTIVE_TOKEN_TTL_SECONDS = 120;

/**
 * Only ever proxy our own runtime objects, never an arbitrary bucket path — one
 * closed list of shapes per kind, matching the keys `runtime/build.mjs` writes
 * and `templates.runtime_keys` stores.
 *
 * The kind is carried by the path rather than by a field in the payload, and
 * each route demands its own: that is what stops a token minted for a SIMID
 * document being replayed against the VPAID route and re-served as
 * `application/javascript` (or the reverse).
 */
const SAFE_PATHS = {
  simid: /^[a-z0-9_-]+\/simid\/index\.html$/i,
  vpaid: /^[a-z0-9_-]+\/(?:vpaid\.js|vpaid\/unit\.js)$/i,
} as const;

export type InteractiveKind = keyof typeof SAFE_PATHS;

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
export function signInteractiveToken(
  path: string,
  kind: InteractiveKind,
): {
  token: string;
  expiresInSeconds: number;
} {
  if (!SAFE_PATHS[kind].test(path)) {
    throw new Error(
      `Refusing to mint a ${kind} interactive token for an unexpected path: ${path}`,
    );
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
export function verifyInteractiveToken(
  token: string,
  kind: InteractiveKind,
): { path: string } | null {
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
    // Re-checked against the *calling route's* kind, not just any known shape.
    if (!SAFE_PATHS[kind].test(parsed.path)) return null;
    return { path: parsed.path };
  } catch {
    return null;
  }
}

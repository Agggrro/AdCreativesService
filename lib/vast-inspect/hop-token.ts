import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authorizes one wrapper hop through the dry-run proxy
 * (app/api/tools/vast/hop/route.ts).
 *
 * In dry-run the player must walk the same chain shape the real tag has, but
 * every hop has to reach us rather than the third-party ad server, so that its
 * trackers can be neutralized before the player sees them. The next hop's URL
 * therefore travels inside a signed token instead of as an open query
 * parameter — otherwise the route would be a plain open proxy that anyone could
 * point at anything.
 *
 * Signing is not the security boundary for SSRF: fetch-tag.ts re-validates
 * every address at connect time regardless of how the URL arrived. Signing is
 * what stops the route being usable by anyone but us.
 *
 * Follows lib/vast/interactive-token.ts: same envelope, same domain-separated
 * key derivation, so no new environment variable is needed.
 */
const HOP_TOKEN_TTL_SECONDS = 300;

interface HopTokenPayload {
  u: string;
  exp: number;
}

function deriveKey(): Buffer {
  const master = process.env.PREVIEW_TOKEN_SECRET;
  if (!master) throw new Error("Missing PREVIEW_TOKEN_SECRET");
  return createHmac("sha256", master).update("creosmith:vast-hop-token:v1").digest();
}

function sign(payloadB64: string): string {
  return createHmac("sha256", deriveKey()).update(payloadB64).digest("base64url");
}

/** Absolute http(s) only — the same shape the fetcher will accept later. */
function isAcceptable(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function signHopToken(url: string): string {
  if (!isAcceptable(url)) {
    throw new Error("Refusing to mint a hop token for a non-http(s) URL");
  }
  const payload: HopTokenPayload = {
    u: url,
    exp: Math.floor(Date.now() / 1000) + HOP_TOKEN_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Returns null on any problem: the route fails closed with an empty VAST. */
export function verifyHopToken(token: string): { url: string } | null {
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
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Partial<HopTokenPayload>;
    if (typeof parsed.u !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (!isAcceptable(parsed.u)) return null;
    return { url: parsed.u };
  } catch {
    return null;
  }
}

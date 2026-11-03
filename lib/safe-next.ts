/**
 * Where to send a visitor after signing in or up, from a `next` they carried
 * through the auth pages (ADR-0036) — or null, which means the default.
 *
 * `next` is attacker-controlled: anyone can link to `/login?next=…`, so taken
 * as given it is an open redirect off our own sign-in page, the most trusted
 * screen we have. Only a same-site *path* under an allow-listed prefix passes:
 * nothing absolute, nothing protocol-relative (`//evil`), no backslash (which
 * browsers read as a slash: `/\evil`), no control character or whitespace that
 * a parser might strip into one of those.
 */
const ALLOWED_PREFIXES = ["/tools/vast-generator", "/dashboard"] as const;
const MAX_LENGTH = 512;

export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  // Resolved against a throwaway origin: anything that escapes it was never a path.
  let url: URL;
  try {
    url = new URL(raw, "https://creosmith.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://creosmith.invalid") return null;
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  if (!allowed) return null;
  // Normalising percent-encodes what was typed raw, so the result can outgrow
  // the input; capping it too keeps the check idempotent, which every hop
  // re-running it relies on.
  const result = `${url.pathname}${url.search}`;
  return result.length > MAX_LENGTH ? null : result;
}

/**
 * `path` with a checked `next` appended — the one way the auth pages and the
 * generator build a link that carries one, so none of them can drop the
 * encoding or the check. A `next` that does not pass is left off.
 */
export function withNext(path: string, next: unknown): string {
  const checked = safeNext(next);
  if (!checked) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(checked)}`;
}

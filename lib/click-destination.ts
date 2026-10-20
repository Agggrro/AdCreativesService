/**
 * The pure half of click tracking (ADR-0023): what a click destination is,
 * what a click id looks like, and how our macros expand. No signing, no
 * `node:crypto` — so the configurator (a client component), the postback parser
 * and the dashboard can share these without pulling signing code into their
 * bundles. The signed half is lib/click-url.ts.
 */

/** A click id as `/r` mints it: 12 random bytes, lower-case hex (see schema.sql). */
export const CLICK_ID_RE = /^[0-9a-f]{24}$/;

/** A config field name as `private.creative_serving.click_fields` admits one. */
export const CLICK_FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** The tag-level destination. `/r` falls back to it, like the quiz unit does. */
export const TAG_CLICK_FIELD = "clickThroughUrl";

/**
 * Schemes that run code or read local state where they are opened. A player
 * `window.open`s a click destination, and on a player that does so inside the
 * publisher's page a `javascript:` destination is script in someone else's
 * site. `<input type="url">` accepts every one of these — they are syntactically
 * valid URLs — so the browser is no defence.
 */
const SCRIPT_SCHEMES = new Set(["javascript:", "vbscript:", "data:", "blob:", "file:", "about:"]);

/** True when a value is a URL a tag must never carry as a click destination. */
export function isScriptUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return SCRIPT_SCHEMES.has(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}

/** True for an absolute http(s) URL — the only kind `/r` redirects to and tracks. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export interface ClickMacroValues {
  /** Empty when the click was not recorded — a stale link, a probe, a crawler. */
  click_id: string;
  creative_id: string;
  /** The exit the viewer left through — the config field name. */
  outcome: string;
}

/**
 * Brace macros in either spelling: `{click_id}` as typed, and `%7Bclick_id%7D`,
 * which is what a macro in a URL *path* becomes once anything normalizes the
 * URL (braces are in the WHATWG path percent-encode set, not the query one).
 */
const MACRO_RE = /\{(click_id|creative_id|outcome)\}|%7B(click_id|creative_id|outcome)%7D/gi;

/** Fill our macros into the destination the owner configured. */
export function expandClickMacros(destination: string, values: ClickMacroValues): string {
  return destination.replace(MACRO_RE, (_match, typed?: string, encoded?: string) => {
    const name = (typed ?? encoded ?? "").toLowerCase() as keyof ClickMacroValues;
    return encodeURIComponent(values[name] ?? "");
  });
}

/** Whether a destination carries `{click_id}` — without it no conversion can attribute. */
export function hasClickIdMacro(destination: string): boolean {
  return /\{click_id\}|%7Bclick_id%7D/i.test(destination);
}

/**
 * The query parameters a click link carries for `/r` itself
 * (lib/click-url.ts, clickUrl). Never forwarded to the destination.
 */
const CLICK_LINK_PARAMS = new Set(["cid", "f", "exp", "sig"]);

/** A parameter name `/r` forwards — the shape of a query key a landing reads. */
export const FORWARD_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
/** A value `/r` forwards: a picked option's id, never free text or a URL. */
// No `.`: an option id needs none, and without it a value cannot be a hostname
// for a landing's own redirect parameter to follow.
export const FORWARD_VALUE_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** At most this many are forwarded per click; the rest are dropped. */
export const MAX_FORWARDED_PARAMS = 8;

/**
 * The destination with what the viewer picked inside the ad appended
 * (ADR-0031). A template such as Step Builder adds its picks to the click link
 * as ordinary query parameters; `/r` carries them on, so the landing opens at
 * the step the ad stopped at instead of the start.
 *
 * The destination stays the owner's: the link still names only a field, and
 * this appends to the URL that field holds — host, path and every parameter the
 * owner wrote are untouched. A parameter the destination already has is never
 * added again, so a crafted link cannot override an affiliate id, a sub-id or
 * the `{click_id}` the network attributes by. Names and values are held to a
 * narrow pattern and a small count, which keeps out anything but an option id.
 *
 * Appended as text rather than through `URLSearchParams`, which would
 * re-serialize the owner's whole query (`%20` becoming `+`, and so on) and send
 * the viewer to a URL the owner never wrote. Nothing appended needs encoding.
 */
export function appendForwardedParams(destination: string, link: URLSearchParams): string {
  // Compared without case: some servers read `AFF` as `aff`, and a crafted
  // link must not reach the owner's parameter that way either.
  let have: Set<string>;
  try {
    have = new Set([...new URL(destination).searchParams.keys()].map((k) => k.toLowerCase()));
  } catch {
    return destination;
  }
  const add: string[] = [];
  for (const [key, value] of link) {
    if (add.length >= MAX_FORWARDED_PARAMS) break;
    if (CLICK_LINK_PARAMS.has(key.toLowerCase()) || have.has(key.toLowerCase())) continue;
    if (!FORWARD_KEY_RE.test(key) || !FORWARD_VALUE_RE.test(value)) continue;
    have.add(key.toLowerCase());
    add.push(`${key}=${value}`);
  }
  if (add.length === 0) return destination;
  const cut = destination.indexOf("#");
  const base = cut < 0 ? destination : destination.slice(0, cut);
  const hash = cut < 0 ? "" : destination.slice(cut);
  const sep = !base.includes("?") ? "?" : /[?&]$/.test(base) ? "" : "&";
  return `${base}${sep}${add.join("&")}${hash}`;
}

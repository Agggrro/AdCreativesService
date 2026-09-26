import { CLICK_ID_RE } from "@/lib/click-destination";
import type { ConversionStatus } from "@/types/database.types";

/**
 * Parsing a partner network's S2S postback (ADR-0023).
 *
 * Pure and dependency-free on purpose: this is the trust boundary for data a
 * third party's server sends us, and the whole of its policy — which statuses
 * mean what, what a payout may look like, what counts as "the network forgot
 * to fill its macro" — should be readable in one place and testable without a
 * database.
 *
 * The URL the owner pastes into their network, with that network's own macros
 * on the right-hand side:
 *
 *   /pb?key=<key>&click_id=<the sub-id our {click_id} went into>
 *      &status=<status>&payout=<payout>&currency=<ISO code>&txid=<transaction id>
 */

/** A postback key as ensure_postback_key() mints it: 32 lower-case hex. */
export const POSTBACK_KEY_RE = /^[0-9a-f]{32}$/;

/** The parameters `/pb` reads. Anything else in the request is ignored. */
export const POSTBACK_PARAMS = ["click_id", "status", "payout", "currency", "txid"] as const;

/**
 * What a network may send as a status, and what it means here.
 *
 * `lead` is pending, as in Keitaro: in CPA a lead is a conversion the
 * advertiser has not yet accepted, and counting it as revenue would overstate
 * every report until the network's rejections arrived. Numeric codes follow the
 * most common convention; a network that uses others can send words.
 *
 * Arrays rather than an object keyed by word, because the settings page prints
 * them in this order — and an object would hoist the integer-like keys ("1",
 * "0") ahead of the words.
 */
export const STATUS_ALIASES: Record<ConversionStatus, readonly string[]> = {
  approved: ["approved", "approve", "confirmed", "confirm", "accepted", "sale", "paid", "1"],
  pending: ["pending", "hold", "lead", "wait", "waiting", "processing", "0"],
  rejected: [
    "rejected",
    "reject",
    "declined",
    "decline",
    "canceled",
    "cancelled",
    "trash",
    "fraud",
    "-1",
  ],
};

const STATUS_WORDS = new Map<string, ConversionStatus>(
  (Object.keys(STATUS_ALIASES) as ConversionStatus[]).flatMap((status) =>
    STATUS_ALIASES[status].map((word) => [word, status] as const),
  ),
);

/**
 * Whether a record_postback() result means the network's report landed —
 * including `unchanged`, a retry or a late `pending` that had nothing left to
 * change. The route answers these 200 so the network stops retrying; the log
 * rails them `live`.
 */
export function isPostbackSuccess(result: string): boolean {
  return result === "created" || result === "updated" || result === "unchanged";
}

/**
 * Rejection codes produced here, before the database. The rest —
 * `unknown_key`, `unknown_click`, `expired_click` — come from
 * record_postback(). All fit postback_log.result's 32 characters.
 */
export type PostbackParseError =
  | "missing_click_id"
  | "bad_click_id"
  | "unexpanded_macro"
  | "bad_status"
  | "bad_payout"
  | "bad_currency"
  | "bad_txid";

export interface PostbackInput {
  clickId: string | null;
  status: ConversionStatus | null;
  payout: number | null;
  currency: string | null;
  txid: string;
  error: PostbackParseError | null;
  /** The raw parameters as received, truncated — what the owner's log shows. */
  params: Record<string, string>;
}

/** Longest raw value kept in the log, per parameter. */
const LOG_VALUE_MAX = 128;

/**
 * A network that does not support a macro sends it back literally:
 * `status={status}`. That is a setup fault, never a value, and reading it as
 * "not sent" would guess — a lead recorded as approved, revenue as zero — so it
 * is an error the owner reads in the log. The click id keeps a code of its own
 * (`bad_click_id`), being the one required parameter.
 */
function isUnexpandedMacro(value: string): boolean {
  return /[{}]/.test(value) || /%7B|%7D/i.test(value) || /^\[.*\]$/.test(value);
}

/**
 * NUL cannot be stored in Postgres text or jsonb: one `%00` in any parameter
 * would fail the whole write, the route would answer 503, and the network would
 * retry that postback forever. Removed before anything else reads the value.
 */
function withoutNul(value: string | null): string | null {
  return value === null ? null : value.replace(/\u0000/g, "");
}

/** Parse one postback. Never throws: a malformed input is an `error`, logged for the owner. */
export function parsePostback(readRaw: (name: string) => string | null): PostbackInput {
  const read = (name: string) => withoutNul(readRaw(name));

  const params: Record<string, string> = {};
  for (const name of POSTBACK_PARAMS) {
    const value = read(name);
    if (value !== null) params[name] = value.slice(0, LOG_VALUE_MAX);
  }

  const fail = (error: PostbackParseError): PostbackInput => ({
    clickId: null,
    status: null,
    payout: null,
    currency: null,
    txid: "",
    error,
    params,
  });

  const rawClickId = (read("click_id") ?? "").trim();
  if (rawClickId === "") return fail("missing_click_id");
  const clickId = rawClickId.toLowerCase();
  if (!CLICK_ID_RE.test(clickId)) return fail("bad_click_id");

  // Absent or empty is "not sent"; a literal macro is a fault (see above).
  let unexpanded = false;
  const optional = (name: string): string | null => {
    const v = (read(name) ?? "").trim();
    if (v === "") return null;
    if (isUnexpandedMacro(v)) unexpanded = true;
    return v;
  };
  const rawStatus = optional("status");
  const rawPayout = optional("payout");
  const rawCurrency = optional("currency");
  const rawTxid = optional("txid");
  if (unexpanded) return fail("unexpanded_macro");

  // No status at all is approved: a network that sends none fires only on the
  // conversions it pays for. An unknown word is an error rather than a guess —
  // guessing wrong in either direction misstates revenue.
  let status: ConversionStatus = "approved";
  if (rawStatus !== null) {
    const known = STATUS_WORDS.get(rawStatus.toLowerCase());
    if (!known) return fail("bad_status");
    status = known;
  }

  // Decimal comma accepted: plenty of networks format money for their locale.
  // Except in the one shape that is also an en-US thousands separator: `1,234`
  // is 1.234 to one network and 1234 to another, and guessing wrong is a payout
  // off by a factor of a thousand, so it is refused rather than read.
  let payout: number | null = null;
  if (rawPayout !== null) {
    if (/^\d{1,3}(,\d{3})+$/.test(rawPayout)) return fail("bad_payout");
    const n = Number(rawPayout.replace(",", "."));
    // numeric(14, 4) holds just under 1e10; anything near that is a bug on
    // the network's side, not a payout.
    if (!Number.isFinite(n) || Math.abs(n) >= 1e9) return fail("bad_payout");
    payout = n;
  }

  let currency: string | null = null;
  if (rawCurrency !== null) {
    if (!/^[A-Za-z]{3}$/.test(rawCurrency)) return fail("bad_currency");
    currency = rawCurrency.toUpperCase();
  }

  const txid = rawTxid ?? "";
  if (txid.length > 128) return fail("bad_txid");

  return { clickId, status, payout, currency, txid, error: null, params };
}


import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupAddress } from "node:dns";

/**
 * The only place in this codebase that issues an outbound request to a URL a
 * stranger chose. Everything else talks to Supabase, Stripe, or ourselves.
 *
 * That makes this file the whole SSRF surface of the product, so the guards are
 * not optional and not configurable by the caller:
 *
 *   1. http/https only — no file:, gopher:, data:, ftp:
 *   2. every resolved address must be publicly routable
 *   3. the socket connects to the address we validated, not to whatever DNS
 *      answers a second time (see `guardedLookup`)
 *   4. redirects are followed by hand, re-validated, and capped
 *   5. a hard deadline and a hard byte cap, both enforced on the stream
 *
 * Guard 3 is the one that is easy to get wrong. Validating with dns.lookup and
 * then handing the URL to fetch() leaves a window where the second resolution
 * returns 127.0.0.1 — classic DNS rebinding. Passing our own `lookup` into the
 * socket options closes it: the connection can only go to an address that
 * already passed `isPublicAddress`, while TLS still sees the hostname and so
 * still validates the certificate normally.
 *
 * Note what is deliberately NOT here: a rate limit. Access to the validator is
 * open by product decision; see docs/security.md for the standing gap.
 */

export const MAX_REDIRECTS = 5;
export const MAX_BYTES = 512 * 1024;
export const TIMEOUT_MS = 5000;

export type FetchFailure =
  | "blocked"
  | "scheme"
  | "dns"
  | "timeout"
  | "network"
  | "too-many-redirects"
  | "bad-url";

export class TagFetchError extends Error {
  readonly reason: FetchFailure;

  constructor(reason: FetchFailure, message: string) {
    super(message);
    this.name = "TagFetchError";
    this.reason = reason;
  }
}

export interface FetchedTag {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType?: string;
  body: string;
  bytes: number;
  /** True when the response was cut off at MAX_BYTES. */
  truncated: boolean;
  redirects: string[];
  elapsedMs: number;
}

/* ---------- address classification ---------- */

function ipv4ToInt(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

/** [network, prefix length] pairs that must never be reachable from here. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — includes 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes 255.255.255.255
];

function isBlockedV4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === undefined) return true; // unparseable is not provably public
  for (const [network, prefix] of BLOCKED_V4) {
    const base = ipv4ToInt(network);
    if (base === undefined) continue;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((value & mask) >>> 0 === (base & mask) >>> 0) return true;
  }
  return false;
}

/** Expand an IPv6 address to its eight 16-bit groups. */
function ipv6Groups(address: string): number[] | undefined {
  const zone = address.indexOf("%");
  let bare = zone === -1 ? address : address.slice(0, zone);

  // A trailing dotted quad — ::ffff:8.8.8.8 — is two 16-bit groups written in
  // IPv4 notation. Folding it back into hex here is what lets `embeddedV4`
  // recognise the v4-mapped prefix; parsing "8.8.8.8" as a single hex group
  // instead yields a garbage address that classifies by accident.
  const dotted = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(bare);
  if (dotted) {
    const value = ipv4ToInt(dotted[1]);
    if (value === undefined) return undefined;
    const high = (value >>> 16).toString(16);
    const low = (value & 0xffff).toString(16);
    bare = `${bare.slice(0, dotted.index)}:${high}:${low}`;
  }

  const [head, tail] = bare.split("::");
  const parse = (chunk: string): number[] =>
    chunk === "" ? [] : chunk.split(":").map((piece) => Number.parseInt(piece, 16));

  let left: number[];
  let right: number[];
  if (tail === undefined) {
    left = parse(head);
    right = [];
    if (left.length !== 8) return undefined;
  } else {
    left = parse(head);
    right = parse(tail);
  }

  const groups = [...left, ...new Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) {
    return undefined;
  }
  return groups;
}

/**
 * An IPv4 address wearing an IPv6 costume. `::ffff:127.0.0.1` and
 * `64:ff9b::7f00:1` both reach loopback if the v4 half is not unwrapped and
 * checked on its own terms.
 */
function embeddedV4(groups: number[]): string | undefined {
  const isV4Mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  const isV4Compat = groups.slice(0, 6).every((g) => g === 0) && (groups[6] !== 0 || groups[7] !== 0);
  const isNat64 = groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);
  if (!isV4Mapped && !isV4Compat && !isNat64) return undefined;
  const high = groups[6];
  const low = groups[7];
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isBlockedV6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return true;

  const mapped = embeddedV4(groups);
  if (mapped) return isBlockedV4(mapped);

  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // documentation
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((g) => g === 0)) return true; // discard
  return false;
}

/** The single predicate every address must pass, at every hop and redirect. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !isBlockedV4(address);
  if (family === 6) return !isBlockedV6(address);
  return false;
}

/* ---------- guarded connection ---------- */

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | LookupAddress[],
  family?: number,
) => void;

/**
 * Node types `lookup`'s callback as always receiving an address, which does not
 * model the error path the runtime actually supports (`callback(err)` alone, as
 * every built-in lookup does). The cast at the call site below is that gap, not
 * a loosening of any check here.
 */
type GuardedLookup = (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => void;

/**
 * A drop-in replacement for dns.lookup that refuses to hand back a private
 * address. Installed on the socket, so it governs the address actually dialled
 * rather than merely a pre-flight check.
 *
 * Every resolved address is examined, not just the one we return: a host that
 * answers with one public and one loopback address is a rebinding attempt, and
 * picking the public one this time would only postpone the problem.
 */
const guardedLookup: GuardedLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    const resolved = addresses as LookupAddress[];
    if (resolved.length === 0) {
      callback(new TagFetchError("dns", `${hostname} did not resolve.`) as NodeJS.ErrnoException);
      return;
    }
    const offender = resolved.find((entry) => !isPublicAddress(entry.address));
    if (offender) {
      callback(
        new TagFetchError(
          "blocked",
          `${hostname} resolves to a non-public address (${offender.address}).`,
        ) as NodeJS.ErrnoException,
      );
      return;
    }
    if (options.all) callback(null, resolved);
    else callback(null, resolved[0].address, resolved[0].family);
  });
};

function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TagFetchError("bad-url", "That is not a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TagFetchError("scheme", `Only http and https are supported (got ${url.protocol}).`);
  }
  // An IP literal never goes through DNS, so it must be judged here as well.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new TagFetchError("blocked", `${host} is not a publicly routable address.`);
  }
  return url;
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  bytes: number;
  truncated: boolean;
}

/** One request, no redirect following, hard-capped in both time and size. */
function requestOnce(url: URL, deadlineMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const request = transport.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup as unknown as net.LookupFunction,
        headers: {
          // Identifying ourselves is the courteous thing to do when knocking on
          // someone else's ad server, and it makes our traffic filterable.
          // The one URL we show to a stranger's server. It names the tool so an
          // ad server operator seeing us in their logs can find out what we are,
          // which means it has to be the domain a human would actually land on.
          "user-agent": "AdInteract-VAST-Validator/1.0 (+https://creosmith.com/tools/vast-validator)",
          accept: "application/xml, text/xml, */*",
          "accept-encoding": "identity",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;

        response.on("data", (chunk: Buffer) => {
          if (truncated) return;
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (bytes - MAX_BYTES)));
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () =>
          finish(() =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString("utf8"),
              bytes: Math.min(bytes, MAX_BYTES),
              truncated,
            }),
          ),
        );

        // A destroy() we triggered ourselves at the cap is a success, not a
        // failure: we have as much of the document as we are willing to read.
        response.on("close", () => {
          if (truncated) {
            finish(() =>
              resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                body: Buffer.concat(chunks).toString("utf8"),
                bytes: MAX_BYTES,
                truncated: true,
              }),
            );
          }
        });

        response.on("error", (cause) =>
          finish(() => reject(new TagFetchError("network", cause.message))),
        );
      },
    );

    const timer = setTimeout(() => {
      request.destroy();
      finish(() => reject(new TagFetchError("timeout", `No response within ${TIMEOUT_MS} ms.`)));
    }, deadlineMs);

    request.on("error", (cause) =>
      finish(() =>
        reject(
          cause instanceof TagFetchError
            ? cause
            : new TagFetchError("network", cause.message),
        ),
      ),
    );

    request.end();
  });
}

/**
 * Fetch one VAST document, following redirects by hand so each `Location` is
 * re-validated before it is dialled.
 */
export async function fetchTag(rawUrl: string): Promise<FetchedTag> {
  const startedAt = Date.now();
  const redirects: string[] = [];
  let url = assertFetchableUrl(rawUrl);

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const elapsed = Date.now() - startedAt;
    const remaining = TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      throw new TagFetchError("timeout", `No response within ${TIMEOUT_MS} ms.`);
    }

    const response = await requestOnce(url, remaining);
    const location = response.headers.location;

    if (response.status >= 300 && response.status < 400 && location) {
      if (attempt === MAX_REDIRECTS) {
        throw new TagFetchError(
          "too-many-redirects",
          `More than ${MAX_REDIRECTS} redirects.`,
        );
      }
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new TagFetchError("bad-url", `Redirect target is not a valid URL: ${location}`);
      }
      // Full re-validation: the scheme may have changed, the host certainly has.
      url = assertFetchableUrl(next.toString());
      redirects.push(url.toString());
      continue;
    }

    const contentType = response.headers["content-type"];
    return {
      requestedUrl: rawUrl,
      finalUrl: url.toString(),
      status: response.status,
      contentType: typeof contentType === "string" ? contentType : undefined,
      body: response.body,
      bytes: response.bytes,
      truncated: response.truncated,
      redirects,
      elapsedMs: Date.now() - startedAt,
    };
  }

  throw new TagFetchError("too-many-redirects", `More than ${MAX_REDIRECTS} redirects.`);
}

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupAddress } from "node:dns";
import { isWorkersRuntime } from "@/lib/runtime-env";
import { isPublicIpAddress } from "./address";

/**
 * The only place in this codebase that issues an outbound request to a URL a
 * stranger chose. Everything else talks to Supabase, Cloudflare, or ourselves.
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

/**
 * The single predicate every address must pass, at every hop and redirect.
 *
 * `net.isIP` decides the family, so what reaches the classifier is exactly what
 * Node will dial; the CIDR tables themselves live in ./address.ts, which has no
 * Node dependency, so the VAST generator can apply the same verdict to a URL a
 * viewer's browser will fetch (ADR-0035).
 */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4 || family === 6) return isPublicIpAddress(address, family);
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
          "user-agent": "CreoSmith-VAST-Validator/1.0 (+https://creosmith.com/tools/vast-validator)",
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

/* ---------- the same guards on a Cloudflare Worker (ADR-0029) ---------- */

/**
 * On a Worker the socket-level guard above cannot exist: workerd's
 * `http.request` is a shim over `fetch` with no socket to pin, and refuses a
 * custom `lookup` outright ("not implemented") — so the Node path would fail
 * closed there, but it would also never work. The Worker path checks before it
 * fetches instead:
 *
 *   - no IP literal, no `localhost`/`*.localhost`, no single-label name: a
 *     Worker cannot fetch an IP host at all, and the others only ever mean "here";
 *   - every A and AAAA answer must pass `isPublicAddress` — resolved through
 *     `node:dns`, which on Workers is DNS-over-HTTPS to 1.1.1.1;
 *   - then `fetch`, redirects by hand, the deadline and the byte cap on the stream.
 *
 * What it gives up is guard 3: `fetch` resolves the name again, so a rebinding
 * answer between the check and the connection is not caught here. What is left
 * behind that window is small — a Worker has no private network, no metadata
 * endpoint and no loopback service to reach, and Cloudflare does not route its
 * subrequests to private ranges — and it is written down in docs/security.md.
 */
async function assertResolvesPublic(url: URL, deadlineMs: number): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(host)) {
    throw new TagFetchError("blocked", `${host} is an address, not a name; only hostnames are fetched.`);
  }
  if (host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) {
    throw new TagFetchError("blocked", `${host} is not a public hostname.`);
  }

  const lookup = async (resolve: (h: string) => Promise<string[]>): Promise<string[]> => {
    try {
      return await resolve(host);
    } catch (cause) {
      // No record of this type is an empty answer, not a failure.
      const code = (cause as NodeJS.ErrnoException)?.code;
      if (code === "ENODATA" || code === "ENOTFOUND") return [];
      throw cause;
    }
  };

  let addresses: string[];
  try {
    const answers = await Promise.race([
      Promise.all([lookup(dns.promises.resolve4), lookup(dns.promises.resolve6)]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TagFetchError("timeout", `No answer within ${TIMEOUT_MS} ms.`)), deadlineMs),
      ),
    ]);
    addresses = answers.flat();
  } catch (cause) {
    if (cause instanceof TagFetchError) throw cause;
    throw new TagFetchError("dns", `${host} could not be resolved.`);
  }

  // workerd's resolver lists a CNAME's target *name* among the answers
  // (`www.github.com` → A ["github.com.", "4.225.11.194"]). Names are not
  // addresses: judged as one, every CNAME'd host — most ad servers and CDNs —
  // would be refused. Only the addresses are judged, and there must be one.
  addresses = addresses.filter((answer) => net.isIP(answer) !== 0);
  if (addresses.length === 0) throw new TagFetchError("dns", `${host} did not resolve.`);
  const offender = addresses.find((address) => !isPublicAddress(address));
  if (offender) {
    throw new TagFetchError("blocked", `${host} resolves to a non-public address (${offender}).`);
  }
}

/** `requestOnce` for a Worker: one fetch, no redirect following, capped in time and size. */
async function requestOnceViaFetch(url: URL, deadlineMs: number): Promise<RawResponse> {
  const startedAt = Date.now();
  await assertResolvesPublic(url, deadlineMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(1, deadlineMs - (Date.now() - startedAt))),
      headers: {
        "user-agent": "CreoSmith-VAST-Validator/1.0 (+https://creosmith.com/tools/vast-validator)",
        accept: "application/xml, text/xml, */*",
      },
    });
  } catch (cause) {
    const name = (cause as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new TagFetchError("timeout", `No response within ${TIMEOUT_MS} ms.`);
    }
    throw new TagFetchError("network", (cause as Error)?.message ?? "fetch failed");
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  const reader = response.body?.getReader();
  try {
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        // As on Node: stopping at the cap is a success, with as much of the
        // document as we are willing to read.
        chunks.push(value.subarray(0, value.byteLength - (bytes - MAX_BYTES)));
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
  } catch (cause) {
    const name = (cause as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new TagFetchError("timeout", `No response within ${TIMEOUT_MS} ms.`);
    }
    throw new TagFetchError("network", (cause as Error)?.message ?? "read failed");
  }

  const body = new Uint8Array(Math.min(bytes, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers: http.IncomingHttpHeaders = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    status: response.status,
    headers,
    body: new TextDecoder().decode(body),
    bytes: Math.min(bytes, MAX_BYTES),
    truncated,
  };
}

/**
 * Fetch one VAST document, following redirects by hand so each `Location` is
 * re-validated before it is dialled.
 */
export async function fetchTag(rawUrl: string): Promise<FetchedTag> {
  const startedAt = Date.now();
  const redirects: string[] = [];
  const request = isWorkersRuntime() ? requestOnceViaFetch : requestOnce;
  let url = assertFetchableUrl(rawUrl);

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const elapsed = Date.now() - startedAt;
    const remaining = TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      throw new TagFetchError("timeout", `No response within ${TIMEOUT_MS} ms.`);
    }

    const response = await request(url, remaining);
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

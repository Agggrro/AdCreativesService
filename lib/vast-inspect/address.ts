/**
 * Which IP addresses a URL we fetch, or publish for a viewer's browser to fetch,
 * must never resolve to. Pure — no Node, no DNS — so the inspector's fetcher
 * (./fetch-tag.ts, after `net.isIP` has named the family) and the VAST
 * generator's URL policy (lib/vast-gen, ADR-0035: a tracker pointed at a
 * viewer's own network) share one set of CIDR tables.
 */

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
  if ((groups[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated, still routed internally)
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // documentation
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((g) => g === 0)) return true; // discard
  return false;
}

/** True when `address`, of the IP family `family` names, is publicly routable. */
export function isPublicIpAddress(address: string, family: 4 | 6): boolean {
  return family === 4 ? !isBlockedV4(address) : !isBlockedV6(address);
}

/**
 * The IP literal a URL's hostname names, or undefined when it is a name.
 *
 * Takes `URL.hostname` as WHATWG URL serializes it: the parser has already
 * canonicalized `2130706433`, `0x7f.1` and `0177.0.0.1` to a dotted quad, and
 * wraps an IPv6 literal in brackets — so a shape test is all that is left to do.
 */
export function ipLiteral(hostname: string): { address: string; family: 4 | 6 } | undefined {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return { address: hostname.slice(1, -1), family: 6 };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return { address: hostname, family: 4 };
  return undefined;
}

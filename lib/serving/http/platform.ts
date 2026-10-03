import type { SnapshotStore } from "../store";

/**
 * What a handler on the ad path needs from whatever runs it (ADR-0029).
 *
 * The handlers in this directory are the ad path — `/v`, `/t`, `/r` and the
 * interactive documents — written once and run twice: by the ad Worker on the ad
 * domain (workers/ads), and by thin Next routes for `npm run dev` and the legacy
 * `/api/*` paths on the app domain. Everything that differs between those two
 * runtimes is in this interface, and it is deliberately small.
 */
export interface ServingPlatform {
  /** Where serving snapshots are read. */
  snapshots: SnapshotStore;
  /**
   * Keep a promise alive after the response has gone. The viewer is waiting on
   * the response; the write it causes is not something they should wait for.
   * Must never be handed a promise that can reject — the handlers settle their
   * own.
   */
  waitUntil(promise: Promise<unknown>): void;
  /** The viewer's country, ISO 3166-1 alpha-2, or null. Never their address. */
  country(request: Request): string | null;
}

/**
 * Two capital letters, or nothing. Cloudflare reports `XX` when it does not
 * know and `T1` for Tor; neither is a country, and a report grouped by them
 * would only be noise.
 */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw || !/^[A-Z]{2}$/.test(raw) || raw === "XX") return null;
  return raw;
}

/**
 * The country from Cloudflare's geo header, which the edge overwrites on every
 * request it proxies to the app's Worker. Only that one: another platform's
 * geo header (`x-vercel-ip-country`, say) is passed through untouched — it is
 * whatever the client typed, and reading it would let a click choose its own
 * country in the report. Under `npm run dev` nothing sets it.
 */
export function countryFromHeaders(request: Request): string | null {
  return normalizeCountry(request.headers.get("cf-ipcountry"));
}

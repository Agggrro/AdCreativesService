import "server-only";
import { after } from "next/server";
import { snapshots } from "@/lib/serving";
import { countryFromHeaders, type ServingPlatform } from "./platform";

/**
 * The ad path as the Next app runs it: under `npm run dev`, and for the legacy
 * `/api/*` paths on the app domain (ADR-0029). The ad domain itself is served by
 * workers/ads, which builds its own platform from its bindings.
 *
 * `after()` rather than a platform's `waitUntil`: it is Next's own hook, so it
 * works wherever the app runs — the Worker through OpenNext, and `next dev`.
 */
export const nextPlatform: ServingPlatform = {
  snapshots,
  waitUntil: (promise) => after(promise),
  country: countryFromHeaders,
};

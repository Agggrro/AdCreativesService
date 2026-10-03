import "server-only";
import { after } from "next/server";
import { snapshots } from "@/lib/serving";
import { countryFromHeaders, type ServingPlatform } from "./platform";

/**
 * The ad path as the Next app runs it: under `npm run dev`, and for the legacy
 * `/api/*` paths on the app domain (ADR-0029). The ad domain itself is served by
 * workers/ads, which builds its own platform from its bindings.
 *
 * `after()` rather than `@vercel/functions`' `waitUntil`: it is Next's own hook,
 * so it works on every host the app runs on — Vercel, a Worker through OpenNext,
 * and `next dev`, where the old import was a silent no-op.
 */
export const nextPlatform: ServingPlatform = {
  snapshots,
  waitUntil: (promise) => after(promise),
  country: countryFromHeaders,
};

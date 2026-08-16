import { notFound } from "next/navigation";

/**
 * Where the ad domain sends every path that is not an ad path or its own
 * information page (see the beforeFiles lockdown in next.config.ts).
 *
 * A 404 rather than a redirect to the app: the ad domain is not an alias of the
 * product, and bouncing a player — or a crawler — to a different host would
 * invite exactly the confusion between the two that ADR-0018 exists to prevent.
 */
export default function CdnBlockedPage() {
  notFound();
}

import type { Metadata } from "next";
import { getAllowedParentOrigins } from "@/lib/site";
import { SandboxStage } from "@/components/validator/SandboxStage";

/**
 * The VAST validator's player frame.
 *
 * A page whose entire job is to be a different origin from the app. The
 * validator plays a stranger's tag through Google IMA in `VpaidMode.INSECURE`,
 * which runs third-party JavaScript in the hosting document's origin — so the
 * hosting document is this one, which owns nothing: no session cookie can be
 * scoped to the ad domain (middleware.ts refuses to write one there, ADR-0018),
 * there is no `localStorage` of ours here, and no API of ours answers to it.
 *
 * It lives under `/c/` because that prefix is already the one thing the ad
 * domain serves besides the tag and the beacons — see the `beforeFiles` rewrite
 * in `next.config.ts`, which 404s every other path on that host.
 *
 * The page is inert until spoken to: it renders a black rectangle, announces
 * itself to its parent, and does nothing else until a document arrives from an
 * origin on `getAllowedParentOrigins()`.
 */

export const metadata: Metadata = {
  title: "Player frame",
  // It is an implementation surface, not a destination. Keeping it out of the
  // index also keeps it out of the "why is this domain in search results"
  // conversation ADR-0018 exists to avoid.
  robots: { index: false, follow: false },
};

export default function SandboxPlayerPage() {
  return <SandboxStage allowedParents={getAllowedParentOrigins()} />;
}

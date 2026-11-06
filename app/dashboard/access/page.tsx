import { permanentRedirect } from "next/navigation";

/**
 * The closed-beta status page lived here until ADR-0037. The state is now a row of
 * the account menu and, for an account without access, a notice at the top of
 * Creatives; the address stays as a redirect because it is linked from old
 * footers and from browser history, and a 404 on a bookmarked page reads as the
 * product breaking.
 *
 * Signed-out visitors never get this far: the dashboard layout sends them to
 * `/login` first.
 */
export default function AccessRedirect() {
  permanentRedirect("/dashboard/creatives");
}

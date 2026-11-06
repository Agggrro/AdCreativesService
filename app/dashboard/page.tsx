import { redirect } from "next/navigation";

/**
 * `/dashboard` is no longer a page — an account lives on Creatives (ADR-0037).
 * It stays as a redirect because old links, and the default destination after
 * sign-in and sign-up, still point here.
 *
 * An account with no creatives lands on the same list. Its empty state is the
 * title and one button that opens the template sheet, and it is where the access
 * notice is shown; the catalog is no longer part of the signed-in navigation, so
 * sending a newcomer there would leave both out (ADR-0038).
 */
export default function DashboardIndex(): never {
  redirect("/dashboard/creatives");
}

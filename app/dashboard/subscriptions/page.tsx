import { redirect } from "next/navigation";

/**
 * The billing page lived here until the closed beta (ADR-0034). The address
 * stays as a redirect: it is linked from old footers in browser history and
 * from the catalog pages of the Stripe era, and a 404 on a page a user has
 * bookmarked reads as the product breaking.
 */
export default function SubscriptionsRedirect() {
  redirect("/dashboard/access");
}

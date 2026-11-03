import type { Dict } from "@/lib/i18n/dictionaries";

/** Error codes the closed-beta grant actions redirect back with (ADR-0034). */
export type AdminError = "grant" | "revoke" | "publish";

/** Error code → copy, in the reader's language — the `creativeErrorMessage` shape. */
export function adminErrorMessage(dict: Dict, code: string | undefined): string | null {
  switch (code) {
    case "grant":
      return dict.admin.errorGrant;
    case "revoke":
      return dict.admin.errorRevoke;
    case "publish":
      return dict.admin.errorPublish;
    default:
      // An unrecognised code says nothing useful; say nothing.
      return null;
  }
}

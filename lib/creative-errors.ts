import type { Dict } from "@/lib/i18n/dictionaries";

/** Error codes the create/update actions redirect back with. */
export type CreativeError =
  | "format_required"
  | "template_not_found"
  | "field_required"
  | "name_too_long"
  | "save_failed"
  | "delete_failed";

/** Error code → copy, in the reader's language (§8). Shared by the create and edit pages. */
export function creativeErrorMessage(
  dict: Dict,
  code: string | undefined,
  field: string | undefined,
): string | null {
  const c = dict.configurator;
  switch (code) {
    case "format_required":
      return c.errFormatRequired;
    case "template_not_found":
      return c.errTemplateNotFound;
    case "field_required":
      return field ? `${c.errFieldRequired}: ${field}` : c.errFieldRequired;
    case "name_too_long":
      return c.errNameTooLong;
    case "save_failed":
      return c.errSaveFailed;
    case "delete_failed":
      return c.errDeleteFailed;
    default:
      // An unrecognised code says nothing useful, and guessing "could not save"
      // is wrong on a page that never saves anything. Say nothing.
      return null;
  }
}

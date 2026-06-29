import type { DeliveryFormat } from "../../../types/database.types";
import type { FormatAdapter } from "../types";
import { simidAdapter } from "./simid";
import { vpaidAdapter } from "./vpaid";

const registry: Record<string, FormatAdapter> = {
  [simidAdapter.format]: simidAdapter,
  [vpaidAdapter.format]: vpaidAdapter,
};

/**
 * Look up the adapter for a delivery format. Returns undefined for an unknown
 * format so callers can fail closed (empty VAST).
 */
export function getAdapter(format: string): FormatAdapter | undefined {
  return registry[format];
}

/** Formats we currently ship adapters for. */
export const supportedFormats = Object.keys(registry) as DeliveryFormat[];

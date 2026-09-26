import type { Json } from "@/types/database.types";

/**
 * Narrow an arbitrary `Json` value — a jsonb column, a config — to a plain
 * object, or `{}` when it is anything else. The one copy: it had been written
 * out privately in the VAST builder, and the conversion work (ADR-0023) was
 * about to add four more.
 */
export function asJsonObject(json: Json | undefined): Record<string, Json | undefined> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, Json | undefined>)
    : {};
}

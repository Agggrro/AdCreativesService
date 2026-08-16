import type { CreativeServing } from "@/types/database.types";
import { isEntitled, shouldServe } from "./entitlement";
import type { CreativeSnapshot, EntitlementSnapshot } from "./types";

/**
 * Rebuild the row shape that `lib/vast/builder.ts` and `lib/storage.ts` already
 * consume, from the two snapshots.
 *
 * Keeping `CreativeServing` as the currency downstream is what makes the
 * snapshot read a drop-in for the RPC: the builder, the adapters and the
 * storage resolver are untouched by ADR-0015, and the fallback path produces
 * the identical shape by definition.
 *
 * The two computed columns are filled in here rather than stored — that is the
 * whole point of the design, see lib/serving/entitlement.ts.
 */
export function snapshotToServing(
  snapshot: CreativeSnapshot,
  entitlement: EntitlementSnapshot | null,
  now: Date = new Date(),
): CreativeServing {
  return {
    creative_id: snapshot.creative_id,
    user_id: snapshot.user_id,
    template_id: snapshot.template_id,
    selected_format: snapshot.selected_format,
    config_json: snapshot.config_json,
    creative_status: snapshot.creative_status,
    template_type: snapshot.template_type,
    runtime_keys: snapshot.runtime_keys,
    supported_standards: snapshot.supported_standards,
    is_entitled: isEntitled(entitlement, snapshot.template_id, now),
    should_serve: shouldServe(snapshot, entitlement, now),
  };
}

import type { CreativeServing, Json } from "../../types/database.types";

/**
 * Fields needed to build a synthetic serving context for the live preview
 * feature (see app/api/vast/preview/*). Also doubles as the preview token's
 * payload shape (lib/vast/preview-token.ts) so mint-time and fetch-time always
 * agree on what a preview is.
 */
export interface PreviewServingInput {
  /** Synthetic creative_id for this preview only — never written to the DB. */
  pid: string;
  tid: string;
  fmt: string;
  cfg: Record<string, Json>;
  /** template.runtime_keys, verbatim. */
  rk: Json;
}

/**
 * Build a CreativeServing-shaped context for a preview, so the existing
 * resolveInteractiveUrl()/buildInlineVast() run completely unmodified. Unlike
 * the real serving path, is_entitled/should_serve are hardcoded true here —
 * entitlement intentionally does not gate this authenticated preview surface.
 */
export function buildPreviewServing(input: PreviewServingInput): CreativeServing {
  return {
    creative_id: input.pid,
    user_id: "",
    template_id: input.tid,
    selected_format: input.fmt,
    config_json: input.cfg,
    creative_status: "draft",
    template_type: "",
    runtime_keys: input.rk,
    supported_standards: [input.fmt],
    is_entitled: true,
    should_serve: true,
  };
}

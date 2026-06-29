import type { Json } from "../../types/database.types";
import type { CreativeConfig } from "./types";

/** Defensively parse a creative's raw config_json into a typed CreativeConfig. */
export function parseCreativeConfig(json: Json): CreativeConfig {
  const obj =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  return {
    videoUrl: str(obj.videoUrl),
    videoMimeType: str(obj.videoMimeType),
    durationSeconds: num(obj.durationSeconds),
    clickThroughUrl: str(obj.clickThroughUrl),
    width: num(obj.width),
    height: num(obj.height),
  };
}

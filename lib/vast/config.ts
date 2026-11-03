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
  // The two numbers reach the document as values the XSD types narrowly:
  // width and height as `xs:integer` attributes, the duration as an
  // `xs:time`, which ends at 23:59:59. An owner can write any number into
  // their own `config_json` (docs/security.md, "Column grants on `creatives`"),
  // so `640.5`, `1e21` or a day of seconds falls back to the default rather
  // than making the tag invalid.
  const dimension = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 7680 ? v : undefined;
  const seconds = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 3600 ? v : undefined;

  return {
    videoUrl: str(obj.videoUrl),
    videoMimeType: str(obj.videoMimeType),
    durationSeconds: seconds(obj.durationSeconds),
    clickThroughUrl: str(obj.clickThroughUrl),
    productName: str(obj.productName),
    productImageUrl: str(obj.productImageUrl),
    width: dimension(obj.width),
    height: dimension(obj.height),
    verificationVendor: str(obj.verificationVendor),
    verificationScriptUrl: str(obj.verificationScriptUrl),
    verificationParameters: str(obj.verificationParameters),
  };
}

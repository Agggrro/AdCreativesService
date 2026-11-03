import type { VastVersion } from "@/lib/vast-inspect/model";
import type { CreativeServing } from "@/types/database.types";
import { servingBeacons } from "./beacons";
import { buildVideoVast } from "./build";
import { declaredVersion, parseVideoConfig } from "./validate";

export type ServedVideo = { ok: true; xml: string } | { ok: false; version?: VastVersion };

/**
 * The served document for an entitled, active VAST video creative — or why not.
 *
 * The stored config is parsed again here, on every build, because the server
 * action is not the control: an owner can PATCH their own `config_json` through
 * PostgREST (docs/security.md, "Column grants on `creatives`"). `serve` mode
 * drops an invalid optional part and keeps the ad; an invalid required one ends
 * in no ad, at the version the config declares when it declares one.
 *
 * Called only after the `should_serve` gate, so nothing here decides access.
 */
export function serveVideo(serving: CreativeServing, siteUrl: string): ServedVideo {
  const parsed = parseVideoConfig(serving.config_json, { mode: "serve", ownerId: serving.user_id });
  if (!parsed.ok) {
    // Stable prefix, so a stored config the validator now refuses is findable
    // in the logs rather than reading as a creative that simply has no fill.
    console.warn("[vast-gen] stored config refused at serve time", {
      creativeId: serving.creative_id,
      issues: parsed.issues.slice(0, 5),
    });
    return { ok: false, version: declaredVersion(serving.config_json) };
  }
  const clickFields = Array.isArray(serving.click_fields) ? serving.click_fields : [];
  const beacons = servingBeacons(siteUrl, serving.creative_id, serving.user_id, clickFields);
  const xml = buildVideoVast(parsed.config, beacons, { creativeId: serving.creative_id });
  return { ok: true, xml };
}

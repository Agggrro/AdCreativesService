import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "../vast-inspect/index.ts";
import { VAST_VERSIONS, type VastVersion } from "../vast-inspect/model.ts";
import { descendants, parseXml } from "../vast-inspect/xml-tree.ts";
import type { CreativeServing } from "../../types/database.types";
import { servingBeacons } from "./beacons.ts";
import { buildVideoVast, vastTime } from "./build.ts";
import type { VideoConfig } from "./model.ts";
import { previewBeacons } from "./preview.ts";
import { serveVideo } from "./serve.ts";
import { supports, trackerEvents } from "./spec.ts";
import { parseVideoConfig } from "./validate.ts";

/**
 * `npm run test:vast`. The VAST generator's documents (ADR-0035):
 *
 * - **Goldens.** The exact bytes per version, signatures included, in
 *   `lib/vast/__golden__/` beside the interactive builder's. `UPDATE_GOLDEN=1`
 *   rewrites them — only after reading the diff, and running the
 *   vast-spec-reviewer on it.
 * - **Self-consistency.** Every version, at its minimum and at everything it
 *   can carry, through our own validator: zero errors, zero warnings, no rule
 *   that threw, and no feature present that the declared version lacks. A
 *   generator our validator would flag is a defect in one of the two.
 * - **A hostile stored row**, through the same entry point `/v` uses.
 */

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "vast", "__golden__");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

/** The interactive goldens' instant and fixtures, so both sets sign identically. */
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const CREATIVE_ID = "11111111-2222-4333-8444-555555555555";
const OWNER_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const SITE = "https://smithcdn.net";
/** The system template's `click_fields` (supabase/seed.sql), as the serving snapshot carries them. */
const CLICK_FIELDS = ["clickThroughUrl", "companionClickThroughUrl"];

process.env.NEXT_PUBLIC_MEDIA_URL = "https://media.smithcdn.net";
const VIDEO_URL = `https://media.smithcdn.net/${OWNER_ID}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mp4`;
const BANNER_URL = `https://media.smithcdn.net/${OWNER_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`;
const ICON_URL = `https://media.smithcdn.net/${OWNER_ID}/abababab-cdcd-4efe-8a9a-bcbcbcbcbcbc.png`;

function signed<T>(fn: () => T): T {
  const saved = { preview: process.env.PREVIEW_TOKEN_SECRET, track: process.env.TRACK_TOKEN_SECRET };
  process.env.PREVIEW_TOKEN_SECRET = "golden-preview-secret";
  process.env.TRACK_TOKEN_SECRET = "golden-track-secret";
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    return fn();
  } finally {
    mock.timers.reset();
    for (const [name, value] of [
      ["PREVIEW_TOKEN_SECRET", saved.preview],
      ["TRACK_TOKEN_SECRET", saved.track],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function golden(name: string, actual: string): void {
  const path = join(GOLDEN_DIR, name);
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.equal(actual, readFileSync(path, "utf8"), `${name} drifted from its golden copy`);
}

function minimal(version: VastVersion): Record<string, unknown> {
  return {
    v: 1,
    version,
    adTitle: "Spring sale",
    media: {
      source: "upload",
      url: VIDEO_URL,
      mime: "video/mp4",
      width: 1280,
      height: 720,
      durationMs: 15_000,
      bytes: 1_500_000,
    },
    trackers: {},
    companions: [],
  };
}

/** Everything `version` can carry, and only that — so the save validator drops nothing. */
function maximal(version: VastVersion): Record<string, unknown> {
  const wanted = ["mute", "pause", "skip", "fullscreen", "playerExpand", "closeLinear"];
  const events = trackerEvents(version)
    .filter((event) => wanted.includes(event))
    .map((event) => ({ event, url: `https://t.example.com/${event}?cb=[CACHEBUSTING]` }));
  return {
    ...minimal(version),
    adTitle: "Spring sale — 30% off",
    description: "Linear spot with a companion banner",
    ...(supports(version, "advertiser") ? { advertiser: "Example Brand" } : {}),
    clickThroughUrl: "https://advertiser.example/landing?utm=vast&click={click_id}",
    companionClickThroughUrl: "https://advertiser.example/banner?click={click_id}",
    ...(supports(version, "skip") ? { skipOffsetMs: 5_000 } : {}),
    ...(supports(version, "universalAdId") ? { universalAdId: { registry: "ad-id.org", value: "EXMP0001000H" } } : {}),
    ...(supports(version, "omid")
      ? {
          verification: {
            vendor: "example.com-omid",
            scriptUrl: "https://verify.example.com/omid.js",
            parameters: '{"key":"value","other":"a&b"}',
          },
        }
      : {}),
    trackers: {
      impression: ["https://t.example.com/impression?cb=[CACHEBUSTING]"],
      error: supports(version, "thirdPartyError") ? ["https://t.example.com/error?code=[ERRORCODE]"] : [],
      click: ["https://t.example.com/click"],
      events,
      ...(supports(version, "viewableImpression")
        ? {
            viewable: ["https://t.example.com/viewable"],
            notViewable: ["https://t.example.com/not-viewable"],
            viewUndetermined: ["https://t.example.com/undetermined"],
          }
        : {}),
    },
    companions: [
      {
        image: { source: "upload", url: BANNER_URL, mime: "image/png" },
        width: 300,
        height: 250,
        altText: "Spring sale banner",
        creativeView: ["https://t.example.com/companion-view"],
        clickTracking: supports(version, "companionClickTracking") ? ["https://t.example.com/companion-click"] : [],
      },
      {
        image: { source: "external", url: "https://cdn.example.com/banner-728x90.gif", mime: "image/gif" },
        width: 728,
        height: 90,
        creativeView: [],
        clickTracking: [],
      },
    ],
    ...(supports(version, "icon")
      ? {
          icon: {
            program: "AdChoices",
            image: { source: "upload", url: ICON_URL, mime: "image/png" },
            width: 20,
            height: 20,
            xPosition: "right",
            yPosition: "top",
            offsetMs: 0,
            durationMs: 15_000,
            clickThroughUrl: "https://www.example.com/privacy",
            clickTracking: ["https://t.example.com/icon-click"],
            viewTracking: ["https://t.example.com/icon-view"],
          },
        }
      : {}),
  };
}

function config(raw: Record<string, unknown>): VideoConfig {
  const parsed = parseVideoConfig(raw, { mode: "save", ownerId: OWNER_ID });
  if (!parsed.ok) throw new Error(`fixture refused: ${JSON.stringify(parsed.issues)}`);
  assert.deepEqual(parsed.dropped, [], "a fixture must carry only what its version allows");
  return parsed.config;
}

function served(raw: Record<string, unknown>): string {
  return signed(() =>
    buildVideoVast(config(raw), servingBeacons(SITE, CREATIVE_ID, OWNER_ID, CLICK_FIELDS), { creativeId: CREATIVE_ID }),
  );
}

async function selfCheck(label: string, xml: string, version: VastVersion): Promise<void> {
  const report = await inspect({ mode: "xml", value: xml, pixelMode: "live", origin: "https://creosmith.com" });
  const loud = report.findings
    .filter((finding) => finding.severity !== "advisory")
    .map((finding) => `${finding.severity} ${finding.ruleId} @ ${finding.path}: ${finding.message.en}`);
  assert.deepEqual(loud, [], `${label}: our validator flags our own document`);
  assert.deepEqual(report.degraded, [], `${label}: rules threw`);
  assert.equal(report.effectiveVersion, version, `${label}: declared version`);
  for (const feature of report.features) {
    if (feature.present) {
      assert.ok(feature.availableAtDeclaredVersion, `${label}: ${feature.id} is present but unavailable at ${version}`);
    }
  }
}

test("goldens: one document per version, signatures included", () => {
  golden("video-2.0.xml", served(maximal("2.0")));
  golden("video-3.0.xml", served(maximal("3.0")));
  golden("video-4.0.xml", served(maximal("4.0")));
  golden("video-4.1.xml", served(maximal("4.1")));
  golden("video-4.3.xml", served(maximal("4.3")));
  golden("video-4.2-max.xml", served(maximal("4.2")));
  golden("video-4.2-min.xml", served(minimal("4.2")));
});

test("self-consistency: every version passes our own validator, minimal and maximal", async () => {
  for (const version of VAST_VERSIONS) {
    await selfCheck(`${version} minimal`, served(minimal(version)), version);
    await selfCheck(`${version} maximal`, served(maximal(version)), version);
  }
});

test("self-consistency: the awkward values escape and still pass", async () => {
  const awkward = {
    ...maximal("4.2"),
    adTitle: "Цена ]]> <script>alert(1)</script> & co",
    description: "Описание с кириллицей и ]]> внутри",
    media: {
      source: "external",
      url: "https://cdn.example.com/media/12345",
      mime: "video/webm",
      width: 640,
      height: 360,
      durationMs: 9_500,
    },
    trackers: {
      impression: ["https://t.example.com/i?a=1&b=2&cb=[CACHEBUSTING]"],
      error: ["https://t.example.com/e?c=[ERRORCODE]&x=%5D%5D%3E"],
      click: [],
      events: [],
    },
    skipOffsetMs: 4_000,
    icon: undefined,
  };
  const xml = served(awkward);
  // Inside CDATA `<script>` is text; what matters is that a parser reads it as
  // the title's text and builds no element from it.
  const parsed = parseXml(xml);
  assert.ok(parsed.root, "the document must stay well-formed");
  assert.equal(descendants(parsed.root, "script").length, 0, "markup in a title must stay text");
  assert.equal(descendants(parsed.root, "AdTitle")[0]?.text, awkward.adTitle);
  await selfCheck("4.2 awkward", xml, "4.2");
});

test("VerificationParameters and a multi-line description pass through exactly, line breaks and all", async () => {
  const parameters = '{"partner":"x",\n  "nested": {\n\t"k": "v  w"\n  }}';
  const description = "Первая строка\n  вторая, с отступом";
  const xml = served({
    ...maximal("4.2"),
    description,
    verification: { vendor: "vendor.example-omid", scriptUrl: "https://vendor.example/omid.js", parameters },
  });
  const parsed = parseXml(xml);
  assert.equal(descendants(parsed.root, "VerificationParameters")[0]?.text, parameters, "ADR-0012: opaque");
  assert.equal(descendants(parsed.root, "Description")[0]?.text, description);
  await selfCheck("4.2 multi-line", xml, "4.2");
});

test("a title like Big [SALE] is a title, not an unfilled macro", async () => {
  await selfCheck("4.2 bracket title", served({ ...maximal("4.2"), adTitle: "Big [SALE]" }), "4.2");
});

test("the preview signs nothing and points its beacons nowhere countable", () => {
  const xml = buildVideoVast(config(maximal("4.2")), previewBeacons(SITE), { creativeId: CREATIVE_ID });
  assert.ok(!/sig=/.test(xml), "a preview carries no signature");
  assert.ok(xml.includes(`${SITE}/t?cid=preview&e=q25`));
  // The buyer's own destination, not a /r link that does not exist yet.
  assert.ok(xml.includes("https://advertiser.example/landing?utm=vast&click={click_id}"));
});

test("time values follow the version", () => {
  assert.equal(vastTime(15_000, "2.0"), "00:00:15");
  assert.equal(vastTime(9_500, "2.0"), "00:00:10");
  assert.equal(vastTime(9_500, "3.0"), "00:00:09.500");
  assert.equal(vastTime(3_723_004, "4.2"), "01:02:03.004");
});

function row(config_json: unknown): CreativeServing {
  return {
    creative_id: CREATIVE_ID,
    user_id: OWNER_ID,
    template_id: "00000000-0000-4000-8000-000000000100",
    selected_format: "video",
    config_json: config_json as CreativeServing["config_json"],
    creative_status: "active",
    template_type: "vast_video",
    runtime_keys: {},
    supported_standards: ["video"],
    is_entitled: true,
    should_serve: true,
    click_fields: ["clickThroughUrl", "companionClickThroughUrl"],
  };
}

test("a hostile stored config is cleaned at serve time, or serves nothing", () => {
  // Hand-written through PostgREST, past every server action.
  const hostile = {
    ...minimal("4.2"),
    clickThroughUrl: "javascript:alert(document.cookie)",
    trackers: {
      impression: ["http://plain.example/i", "https://10.0.0.1/i", "https://smithcdn.net/t?cid=other", "https://ok.example/i"],
      error: ["https://t.example.com/e"],
      events: [{ event: "start", url: "https://ok.example/start" }, { event: "creativeView<x>", url: "https://x/y" }],
    },
    icon: { program: "AdChoices", image: { source: "external", url: "javascript:1", mime: "image/png" } },
    apiFramework: "VPAID",
  };
  const result = signed(() => serveVideo(row(hostile), SITE));
  assert.ok(result.ok);
  const xml = result.xml;
  for (const forbidden of ["javascript:", "http://plain.example", "10.0.0.1", "cid=other", "apiFramework", "creativeView<x>"]) {
    assert.ok(!xml.includes(forbidden), `${forbidden} reached the document`);
  }
  assert.ok(xml.includes("https://ok.example/i"));
  assert.ok(xml.includes("https://ok.example/start"));
  // Our MediaFile is the only one, and never an executable type.
  assert.equal(xml.match(/<MediaFile /g)?.length, 1);
  assert.ok(xml.includes('type="video/mp4"'));

  for (const media of [
    { ...(minimal("4.2").media as object), url: "javascript:alert(1)" },
    { source: "external", url: "https://cdn.example.com/unit.js", mime: "application/javascript", width: 640, height: 360, durationMs: 5_000 },
    { source: "external", url: "https://127.0.0.1/a.mp4", mime: "video/mp4", width: 640, height: 360, durationMs: 5_000 },
  ]) {
    const refused = signed(() => serveVideo(row({ ...minimal("3.0"), media }), SITE));
    assert.deepEqual(refused, { ok: false, version: "3.0" }, JSON.stringify(media));
  }
  assert.deepEqual(signed(() => serveVideo(row("not an object"), SITE)), { ok: false, version: undefined });
});

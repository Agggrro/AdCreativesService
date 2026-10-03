import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateVast, emptyVast, parseCreativeConfig } from "./index.ts";
import { signInteractiveToken, verifyInteractiveToken } from "./interactive-token.ts";
import { signTrackToken, verifyTrackToken } from "../track-token.ts";
import { checkClickToken, clickUrl } from "../click-url.ts";
import type { CreativeServing, Json } from "../../types/database.types";

/**
 * Run with `npm run test:vast`. `UPDATE_GOLDEN=1 npm run test:vast` rewrites the
 * documents in `__golden__/` — only after reading the diff and deciding the change
 * is the one you meant (and running the vast-spec-reviewer on it).
 *
 * Pins the exact bytes the ad path emits: the VAST documents and every signature
 * inside them. Byte-for-byte on purpose. Since ADR-0029 the same modules serve
 * the tag from two runtimes — a Cloudflare Worker on the ad domain and Next on
 * the app domain — and a signature that one of them mints must verify on the
 * other, while a tag that changes shape without anyone deciding it should is a
 * campaign that changes behaviour in some player nobody tested.
 *
 * The clock and the secret are fixed, so each signature here is a constant.
 * They are fixtures, not secrets.
 */

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "__golden__");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

/** 2026-10-03T12:00:00Z — any fixed instant; the expiries below follow from it. */
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

const CREATIVE_ID = "11111111-2222-4333-8444-555555555555";
const OWNER_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const TEMPLATE_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const SITE = "https://smithcdn.net";

function withSecrets(secrets: { preview: string; track?: string }, fn: () => void): void {
  const saved = {
    preview: process.env.PREVIEW_TOKEN_SECRET,
    track: process.env.TRACK_TOKEN_SECRET,
  };
  process.env.PREVIEW_TOKEN_SECRET = secrets.preview;
  if (secrets.track) process.env.TRACK_TOKEN_SECRET = secrets.track;
  else delete process.env.TRACK_TOKEN_SECRET;
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    fn();
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
  // Compared as bytes, including the absence of a trailing newline.
  assert.equal(actual, readFileSync(path, "utf8"), `${name} drifted from its golden copy`);
}

function serving(overrides: Partial<CreativeServing> & { config_json: Json }): CreativeServing {
  return {
    creative_id: CREATIVE_ID,
    user_id: OWNER_ID,
    template_id: TEMPLATE_ID,
    selected_format: "vpaid",
    creative_status: "active",
    template_type: "quiz",
    runtime_keys: { vpaid: "quiz/vpaid.js" },
    supported_standards: ["vpaid"],
    is_entitled: true,
    should_serve: true,
    click_fields: [],
    ...overrides,
  };
}

function build(row: CreativeServing, interactiveUrl: string): string {
  return generateVast({
    serving: row,
    config: parseCreativeConfig(row.config_json),
    rawConfig: row.config_json,
    interactiveUrl,
    siteUrl: SITE,
  });
}

/**
 * A quiz-shaped VPAID creative: a tag-level destination, two per-exit
 * destinations (one in a script scheme, which must be dropped), an app-store
 * deep link that passes through untracked, and free text that needs escaping.
 */
const VPAID_ROW = serving({
  config_json: {
    videoUrl: "https://media.smithcdn.net/u/clip.mp4",
    clickThroughUrl: "https://advertiser.example/landing?x=1&y=2",
    exitUrlA: "https://advertiser.example/a?click={click_id}",
    exitUrlB: "javascript:alert(1)",
    storeUrl: "market://details?id=example",
    coverText: "Привет & <b>«ok»</b> ]]> end",
    durationSeconds: 15,
    width: 640,
    height: 360,
  },
  click_fields: ["clickThroughUrl", "exitUrlA", "exitUrlB"],
});

/** Shoppable SIMID with an OMID vendor (ADR-0012) and a webm base video. */
const SIMID_ROW = serving({
  selected_format: "simid",
  template_type: "shoppable",
  runtime_keys: { simid: "shoppable/simid/index.html", vpaid: "shoppable/vpaid/unit.js" },
  supported_standards: ["simid", "vpaid"],
  config_json: {
    videoUrl: "https://media.smithcdn.net/u/clip.webm",
    clickThroughUrl: "https://shop.example/item/42",
    productName: "Shoes",
    productImageUrl: "https://media.smithcdn.net/u/p.png",
    verificationVendor: "dv.example-omid",
    verificationScriptUrl: "https://cdn.dv.example/omid.js",
    verificationParameters: "a=b&c]]>d",
  },
  click_fields: ["clickThroughUrl"],
});

test("VPAID document, byte for byte", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    golden(
      "vpaid.xml",
      build(VPAID_ROW, "https://media.smithcdn.net/runtime/quiz/vpaid.8eeec37b.js"),
    );
  });
});

test("SIMID document with an OMID verification node, byte for byte", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    const { token } = signInteractiveToken("shoppable/simid/index.html", "simid");
    golden("simid.xml", build(SIMID_ROW, `${SITE}/c/s/${token}`));
  });
});

test("a dedicated TRACK_TOKEN_SECRET changes the beacon key, not the document's shape", () => {
  withSecrets({ preview: "golden-preview-secret", track: "golden-track-secret" }, () => {
    golden(
      "vpaid-track-secret.xml",
      build(VPAID_ROW, "https://media.smithcdn.net/runtime/quiz/vpaid.8eeec37b.js"),
    );
  });
});

test("the fail-closed answers are the empty document", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    const empty = '<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="4.2"></VAST>';
    assert.equal(emptyVast(), empty);
    assert.equal(build({ ...VPAID_ROW, should_serve: false }, "https://x.example/u.js"), empty);
    assert.equal(build({ ...VPAID_ROW, selected_format: "mraid" }, "https://x.example/u.js"), empty);
    assert.equal(build(VPAID_ROW, ""), empty);
    // SIMID layers over a video; without one there is nothing to serve.
    assert.equal(
      build({ ...SIMID_ROW, config_json: { clickThroughUrl: "https://shop.example" } }, "u"),
      empty,
    );
  });
});

test("beacon signatures are pinned under both key sources", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    assert.deepEqual(signTrackToken(CREATIVE_ID, "impression"), {
      exp: NOW / 1000 + 3600,
      sig: "M_2tWRJ42mC6qNnJ3jIkKeIewR4Pn5b98zckbD70tZo",
    });
  });
  withSecrets({ preview: "golden-preview-secret", track: "golden-track-secret" }, () => {
    assert.deepEqual(signTrackToken(CREATIVE_ID, "impression"), {
      exp: NOW / 1000 + 3600,
      sig: "lyOQiFyXJ2ZQhVu4QotpOKOgg4oirxE-Hb8y-EU6pHc",
    });
  });
});

test("beacon verification: fresh, expired, forged, and the click grace", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    const { exp, sig } = signTrackToken(CREATIVE_ID, "viewable");
    assert.equal(verifyTrackToken(CREATIVE_ID, "viewable", String(exp), sig), true);
    assert.equal(verifyTrackToken(CREATIVE_ID, "impression", String(exp), sig), false);
    assert.equal(verifyTrackToken(CREATIVE_ID, "viewable", String(exp + 1), sig), false);
    assert.equal(verifyTrackToken(CREATIVE_ID, "viewable", String(exp), `${sig}A`), false);
    assert.equal(verifyTrackToken(CREATIVE_ID, "viewable", null, sig), false);

    const old = signTrackToken(CREATIVE_ID, "viewable", -10);
    assert.equal(verifyTrackToken(CREATIVE_ID, "viewable", String(old.exp), old.sig), false);
    assert.equal(verifyTrackToken(CREATIVE_ID, "viewable", String(old.exp), old.sig, 60), true);
  });
});

test("click links: the URL, and fresh / stale / invalid", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    const link = clickUrl(`${SITE}/`, CREATIVE_ID, OWNER_ID, "exitUrlA");
    golden("click-url.txt", link);

    const url = new URL(link);
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    assert.equal(checkClickToken(CREATIVE_ID, OWNER_ID, "exitUrlA", exp, sig), "fresh");
    // Another owner, another field: never a redirect.
    assert.equal(checkClickToken(CREATIVE_ID, TEMPLATE_ID, "exitUrlA", exp, sig), "invalid");
    assert.equal(checkClickToken(CREATIVE_ID, OWNER_ID, "exitUrlB", exp, sig), "invalid");
  });
  // A day and a minute later: past the TTL, inside the week's grace.
  withSecrets({ preview: "golden-preview-secret" }, () => {
    mock.timers.setTime(NOW - (24 * 3600 + 60) * 1000);
    const link = new URL(clickUrl(SITE, CREATIVE_ID, OWNER_ID, "exitUrlA"));
    mock.timers.setTime(NOW);
    assert.equal(
      checkClickToken(
        CREATIVE_ID,
        OWNER_ID,
        "exitUrlA",
        link.searchParams.get("exp"),
        link.searchParams.get("sig"),
      ),
      "stale",
    );
  });
});

test("interactive tokens: pinned, kind-bound, and expiring", () => {
  withSecrets({ preview: "golden-preview-secret" }, () => {
    const { token, expiresInSeconds } = signInteractiveToken("shoppable/simid/index.html", "simid");
    assert.equal(expiresInSeconds, 600);
    golden("interactive-token.txt", token);

    assert.deepEqual(verifyInteractiveToken(token, "simid"), {
      path: "shoppable/simid/index.html",
    });
    // A SIMID token is never accepted as a VPAID unit, or the reverse.
    assert.equal(verifyInteractiveToken(token, "vpaid"), null);
    assert.equal(verifyInteractiveToken(`${token}x`, "simid"), null);
    assert.throws(() => signInteractiveToken("../etc/passwd", "simid"));

    mock.timers.setTime(NOW + 601 * 1000);
    assert.equal(verifyInteractiveToken(token, "simid"), null);
  });
});

test("every unit in the manifest is a content-addressed object on the media host", async () => {
  const { RUNTIME_MANIFEST } = await import("../../runtime/manifest.ts");
  const { RUNTIME_KEY_RE } = await import("../runtime-keys.ts");
  const entries = Object.entries(RUNTIME_MANIFEST.assets);
  assert.ok(entries.length > 0, "the manifest is empty");
  for (const [logicalKey, asset] of entries) {
    const url = new URL(asset.url);
    // A push run with the wrong NEXT_PUBLIC_MEDIA_URL would put that host into
    // every tag; this is the one place it would be caught before a deploy.
    assert.equal(url.origin, "https://media.smithcdn.net", logicalKey);
    const key = url.pathname.slice(1);
    assert.ok(RUNTIME_KEY_RE.test(key), `${logicalKey}: ${key}`);
    assert.ok(key.includes(`.${asset.sha256.slice(0, 8)}.`), `${logicalKey}: hash not in key`);
  }
});

test("a served tag names the unit's media URL; a preview names it on its own origin", async () => {
  const { resolveInteractiveUrl } = await import("../storage.ts");
  const { RUNTIME_MANIFEST } = await import("../../runtime/manifest.ts");
  const asset = RUNTIME_MANIFEST.assets["quiz/vpaid.js"];
  assert.ok(asset);
  const row = serving({ config_json: {}, runtime_keys: { vpaid: "quiz/vpaid.js" } });
  assert.equal(resolveInteractiveUrl(row, SITE), asset.url);
  assert.equal(
    resolveInteractiveUrl(row, "https://creosmith.com/", { sameOriginUnit: true }),
    `https://creosmith.com/c/u${new URL(asset.url).pathname}`,
  );
});

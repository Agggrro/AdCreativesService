import test from "node:test";
import assert from "node:assert/strict";
import { declaredVersion, LIMITS, parseVideoConfig } from "./validate.ts";

// parseOwnMediaUrl reads the media host from the environment on every call, as
// the app does.
process.env.NEXT_PUBLIC_MEDIA_URL = "https://media.smithcdn.net";

/**
 * `npm run test:vast`. The VAST generator's config validator (ADR-0035) — the
 * control that stands between a buyer's form, or a hand-written PATCH, and a
 * document a stranger's player executes on a publisher's page.
 */

const OWNER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const OTHER = "12121212-3434-4565-8787-909090909090";
const VIDEO_KEY = `${OWNER}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mp4`;
const VIDEO_URL = `https://media.smithcdn.net/${VIDEO_KEY}`;
const IMAGE_URL = `https://media.smithcdn.net/${OWNER}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`;

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    version: "4.2",
    adTitle: "Spring sale",
    media: { source: "upload", url: VIDEO_URL, mime: "video/mp4", width: 1280, height: 720, durationMs: 15_000 },
    trackers: {},
    companions: [],
    ...overrides,
  };
}

function save(config: unknown) {
  return parseVideoConfig(config, { mode: "save", ownerId: OWNER });
}

function codes(result: ReturnType<typeof save>): string[] {
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}:${issue.code}`);
}

test("a minimal config is accepted and normalised", () => {
  const result = save(base());
  assert.ok(result.ok, JSON.stringify(codes(result)));
  assert.equal(result.config.adTitle, "Spring sale");
  assert.equal(result.config.media.mime, "video/mp4");
  assert.deepEqual(result.config.trackers.impression, []);
  assert.deepEqual(result.dropped, []);
});

test("required parts fail in every mode", () => {
  for (const mode of ["save", "serve"] as const) {
    const run = (config: unknown) => parseVideoConfig(config, { mode, ownerId: OWNER });
    assert.deepEqual(codes(run(base({ version: "5.0" }))), ["version:bad_version"]);
    assert.deepEqual(codes(run(base({ adTitle: "   " }))), ["adTitle:required"]);
    assert.deepEqual(codes(run(base({ adTitle: "x".repeat(LIMITS.text + 1) }))), ["adTitle:too_long"]);
    assert.ok(!run(base({ media: undefined })).ok);
  }
});

test("a save or a serve without an owner is refused outright", () => {
  assert.ok(!parseVideoConfig(base(), { mode: "save" }).ok);
  assert.ok(!parseVideoConfig(base(), { mode: "serve" }).ok);
});

test("an upload must be one of ours, under the owner's own prefix, mp4 or webm", () => {
  const foreign = `https://media.smithcdn.net/${OTHER}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mp4`;
  assert.deepEqual(codes(save(base({ media: { ...(base().media as object), url: foreign } }))), [
    "media.url:not_own_media",
  ]);
  const mov = `https://media.smithcdn.net/${OWNER}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mov`;
  assert.deepEqual(codes(save(base({ media: { ...(base().media as object), url: mov } }))), ["media.url:bad_mime"]);
  // Path traversal never parses as one of our keys.
  const traversal = `https://media.smithcdn.net/${OWNER}/../${OTHER}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mp4`;
  assert.deepEqual(codes(save(base({ media: { ...(base().media as object), url: traversal } }))), [
    "media.url:not_own_media",
  ]);
  // The preview has no owner, and accepts any well-formed upload URL.
  assert.ok(parseVideoConfig(base({ media: { ...(base().media as object), url: foreign } }), { mode: "preview" }).ok);
});

test("an upload's bitrate is derived from its size, never taken from the browser", () => {
  const result = save(
    base({ media: { ...(base().media as object), bytes: 1_500_000, bitrateKbps: 99_999, durationMs: 15_000 } }),
  );
  assert.ok(result.ok);
  assert.equal(result.config.media.bitrateKbps, 800);
  const external = save(
    base({
      media: { source: "external", url: "https://cdn.example.com/a.mp4", mime: "video/mp4", width: 640, height: 360, durationMs: 10_000, bytes: 5 },
    }),
  );
  assert.ok(external.ok);
  assert.equal(external.config.media.bytes, undefined);
  assert.equal(external.config.media.bitrateKbps, undefined);
});

test("a linked video is https on a public host that is not ours, of a declared type that matches its extension", () => {
  const media = (url: string, mime = "video/mp4") =>
    save(base({ media: { source: "external", url, mime, width: 640, height: 360, durationMs: 10_000 } }));
  assert.ok(media("https://cdn.example.com/a.mp4").ok);
  assert.ok(media("https://cdn.example.com/media/12345").ok, "an extension-less URL takes the declared type");
  assert.deepEqual(codes(media("http://cdn.example.com/a.mp4")), ["media.url:not_https"]);
  assert.deepEqual(codes(media("https://cdn.example.com/a.webm")), ["media.mime:mime_mismatch"]);
  assert.deepEqual(codes(media("https://cdn.example.com/a.mov", "video/quicktime")), ["media.mime:bad_mime"]);
  assert.deepEqual(codes(media(VIDEO_URL)), ["media.url:own_host"]);
  assert.deepEqual(codes(media("https://192.168.1.10/a.mp4")), ["media.url:private_host"]);
  // WHATWG URL canonicalises a decimal address to its dotted quad: 127.0.0.1.
  assert.deepEqual(codes(media("https://2130706433/a.mp4")), ["media.url:private_host"]);
  assert.deepEqual(codes(media("https://localhost/a.mp4")), ["media.url:private_host"]);
  assert.deepEqual(codes(media("https://cdn.example.com/a.mp4?cb=[CACHEBUSTING]")), ["media.url:bad_url"]);
});

test("trackers are https pixels on public hosts that are not ours, with only player macros", () => {
  const impression = (url: string) => save(base({ trackers: { impression: [url] } }));
  assert.ok(impression("https://t.example.com/i?cb=[CACHEBUSTING]&ts=[TIMESTAMP]").ok);
  assert.ok(impression("https://t.example.com/i?u={user}").ok, "curly macros are left to whoever wrote them");
  assert.deepEqual(codes(impression("http://t.example.com/i")), ["trackers.impression.0:not_https"]);
  assert.deepEqual(codes(impression("javascript:alert(1)")), ["trackers.impression.0:script_scheme"]);
  assert.deepEqual(codes(impression("https://t.example.com/i?x=[NOT_A_MACRO]")), [
    "trackers.impression.0:unknown_macro",
  ]);
  assert.deepEqual(codes(impression("https://t.example.com/i x")), ["trackers.impression.0:bad_url"]);
  // `]]>` can never reach a CDATA section through a URL: angle brackets are refused.
  assert.deepEqual(codes(impression("https://t.example.com/i?x=]]>")), ["trackers.impression.0:bad_url"]);
  for (const own of [
    "https://smithcdn.net/t?cid=x",
    "https://SMITHCDN.NET./t?cid=x",
    "https://media.smithcdn.net/x",
    "https://creosmith.com/r?cid=x",
    "https://www.creosmith.com/",
  ]) {
    assert.deepEqual(codes(impression(own)), ["trackers.impression.0:own_host"], own);
  }
  for (const privateHost of ["https://10.0.0.1/i", "https://[::1]/i", "https://intranet/i", "https://printer.local/i"]) {
    assert.deepEqual(codes(impression(privateHost)), ["trackers.impression.0:private_host"], privateHost);
  }
  // A lookalike in punycode is somebody else's host, and nothing to refuse.
  assert.ok(impression("https://xn--crosmth-9ya.com/i").ok);
});

test("a buyer's error pixel is a 4.0+ feature, and carries [ERRORCODE]", () => {
  const error = (version: string, url: string) => save(base({ version, trackers: { error: [url] } }));
  assert.ok(error("4.2", "https://t.example.com/e?c=[ERRORCODE]").ok);
  assert.deepEqual(codes(error("4.0", "https://t.example.com/e")), ["trackers.error.0:error_macro_missing"]);
  // 2.0 and 3.0 allow one <Error>, and it is ours: the buyer's is dropped, and named.
  for (const version of ["2.0", "3.0"]) {
    const result = error(version, "https://t.example.com/e?c=[ERRORCODE]");
    assert.ok(result.ok);
    assert.deepEqual(result.config.trackers.error, []);
    assert.deepEqual(result.dropped, ["thirdPartyError"]);
  }
});

test("lists are bounded and free of duplicates", () => {
  const many = Array.from({ length: LIMITS.impression + 1 }, (_, n) => `https://t.example.com/i${n}`);
  assert.deepEqual(codes(save(base({ trackers: { impression: many } }))), ["trackers.impression:too_many"]);
  const twice = ["https://t.example.com/i", "https://t.example.com/i"];
  assert.deepEqual(codes(save(base({ trackers: { impression: twice } }))), ["trackers.impression.1:duplicate"]);
});

test("an event tracker names an event its version's XSD enumerates", () => {
  const events = (version: string, event: string) =>
    save(base({ version, trackers: { events: [{ event, url: "https://t.example.com/e" }] } }));
  assert.ok(events("4.2", "mute").ok);
  assert.ok(events("3.0", "fullscreen").ok);
  assert.deepEqual(codes(events("4.0", "fullscreen")), ["trackers.events.0.event:bad_event"]);
  assert.deepEqual(codes(events("4.0", "closeLinear")), ["trackers.events.0.event:bad_event"]);
  assert.ok(events("4.1", "closeLinear").ok);
  assert.deepEqual(codes(events("2.0", "skip")), ["trackers.events.0.event:bad_event"]);
  assert.deepEqual(codes(events("4.2", "progress")), ["trackers.events.0.event:bad_event"]);
});

test("what a version cannot carry is dropped and named", () => {
  const everything = {
    advertiser: "Example Brand",
    skipOffsetMs: 5_000,
    universalAdId: { registry: "ad-id.org", value: "ABCD1234000H" },
    verification: { vendor: "example.com-omid", scriptUrl: "https://verify.example.com/omid.js" },
    trackers: { viewable: ["https://t.example.com/v"] },
    companions: [
      {
        image: { source: "upload", url: IMAGE_URL, mime: "image/png" },
        width: 300,
        height: 250,
        creativeView: [],
        clickTracking: ["https://t.example.com/cc"],
      },
    ],
    icon: {
      program: "AdChoices",
      image: { source: "upload", url: IMAGE_URL, mime: "image/png" },
      width: 20,
      height: 20,
      xPosition: "right",
      yPosition: "top",
      offsetMs: 0,
      clickTracking: [],
      viewTracking: [],
    },
  };
  const at = (version: string) => {
    const result = save(base({ version, ...everything }));
    assert.ok(result.ok, `${version}: ${JSON.stringify(codes(result))}`);
    return result;
  };
  assert.deepEqual(
    [...at("2.0").dropped].sort(),
    ["advertiser", "companionClickTracking", "icon", "omid", "skip", "universalAdId", "viewableImpression"],
  );
  assert.deepEqual([...at("3.0").dropped].sort(), ["companionClickTracking", "omid", "universalAdId", "viewableImpression"]);
  assert.deepEqual(at("4.0").dropped, ["omid"]);
  const full = at("4.2");
  assert.deepEqual(full.dropped, []);
  assert.equal(full.config.skipOffsetMs, 5_000);
  assert.equal(full.config.icon?.program, "AdChoices");
  assert.equal(full.config.verification?.vendor, "example.com-omid");
  assert.equal(at("2.0").config.skipOffsetMs, undefined);
});

test("offsets stay inside the video", () => {
  assert.deepEqual(codes(save(base({ skipOffsetMs: 15_000 }))), ["skipOffsetMs:out_of_range"]);
  assert.ok(save(base({ skipOffsetMs: 14_999 })).ok);
});

test("destinations are http(s), never a script, never ours", () => {
  assert.ok(save(base({ clickThroughUrl: "http://advertiser.example/landing?c={click_id}" })).ok);
  assert.deepEqual(codes(save(base({ clickThroughUrl: "javascript:alert(1)" }))), ["clickThroughUrl:script_scheme"]);
  assert.deepEqual(codes(save(base({ clickThroughUrl: "market://details?id=x" }))), ["clickThroughUrl:not_http"]);
  assert.deepEqual(codes(save(base({ clickThroughUrl: "https://smithcdn.net/r?cid=x" }))), ["clickThroughUrl:own_host"]);
});

test("the companions' destination needs a companion", () => {
  const result = save(base({ companionClickThroughUrl: "https://advertiser.example/c" }));
  assert.ok(result.ok);
  assert.equal(result.config.companionClickThroughUrl, undefined);
});

test("serve mode drops a broken optional part and keeps the ad", () => {
  const serve = (config: unknown) => parseVideoConfig(config, { mode: "serve", ownerId: OWNER });
  const result = serve(
    base({
      clickThroughUrl: "javascript:alert(1)",
      trackers: { impression: ["https://t.example.com/ok", "http://t.example.com/plain", "https://10.0.0.1/x"] },
      icon: { program: "AdChoices" },
    }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.config.trackers.impression, ["https://t.example.com/ok"]);
  assert.equal(result.config.clickThroughUrl, undefined);
  assert.equal(result.config.icon, undefined);
  // …but a hand-edited config pointing at another tenant's upload serves nothing.
  const foreign = `https://media.smithcdn.net/${OTHER}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mp4`;
  assert.ok(!serve(base({ media: { ...(base().media as object), url: foreign } })).ok);
});

test("a config past the size cap is refused whole", () => {
  assert.deepEqual(codes(save(base({ description: "x".repeat(LIMITS.configChars) }))), [":too_large"]);
});

test("declaredVersion reads only the version", () => {
  assert.equal(declaredVersion({ version: "3.0", media: null }), "3.0");
  assert.equal(declaredVersion({ version: "9.9" }), undefined);
  assert.equal(declaredVersion(null), undefined);
});

test("a macro in the host is refused: the player would substitute it into an address nobody checked", () => {
  const impression = (url: string) => save(base({ trackers: { impression: [url] } }));
  assert.deepEqual(codes(impression("https://192.168.1.[ADCOUNT]/p")), ["trackers.impression.0:macro_in_host"]);
  assert.deepEqual(codes(impression("https://127.[CACHEBUSTING]/p")), ["trackers.impression.0:macro_in_host"]);
  assert.deepEqual(codes(impression("https://smithcdn.net%%X%%/t")), ["trackers.impression.0:macro_in_host"]);
  assert.ok(impression("https://t.example.com/[ADCOUNT]/p?cb=[CACHEBUSTING]#[TIMESTAMP]").ok, "path, query and fragment may carry macros");
});

test("macros are held to the kind of pixel a player substitutes them in (IAB's macro data)", () => {
  const trackers = (value: Record<string, unknown>) => save(base({ trackers: value }));
  assert.ok(trackers({ impression: ["https://t.example.com/i?gpp=[GPPSTRING]&sid=[GPPSECTIONID]"] }).ok);
  assert.ok(trackers({ click: ["https://t.example.com/c?pos=[CLICKPOS]"] }).ok);
  assert.deepEqual(codes(trackers({ impression: ["https://t.example.com/i?pos=[CLICKPOS]"] })), [
    "trackers.impression.0:unknown_macro",
  ]);
  assert.deepEqual(codes(trackers({ impression: ["https://t.example.com/i?e=[ERRORCODE]"] })), [
    "trackers.impression.0:unknown_macro",
  ]);
  assert.deepEqual(codes(trackers({ impression: ["https://t.example.com/i?cat=[ADCATEGORIES]"] })), [
    "trackers.impression.0:unknown_macro",
  ]);
  assert.deepEqual(codes(trackers({ impression: ["https://t.example.com/i?cb=%%CACHEBUSTER%%"] })), [
    "trackers.impression.0:unknown_macro",
  ]);
  assert.deepEqual(codes(trackers({ impression: ["https://t.example.com/i?x=[BREAKMINADDURATION]"] })), [
    "trackers.impression.0:unknown_macro",
  ]);
});

test("the OMID script carries no macro at all: a player loads it, it does not ping it", () => {
  const omid = (scriptUrl: string) => save(base({ verification: { vendor: "v.example-omid", scriptUrl } }));
  assert.ok(omid("https://v.example.com/omid.js").ok);
  assert.deepEqual(codes(omid("https://v.example.com/omid.js?cb=[CACHEBUSTING]")), [
    "verification.scriptUrl:unknown_macro",
  ]);
});

test("credentials, backslashes and empty host labels are refused in every URL", () => {
  const impression = (url: string) => save(base({ trackers: { impression: [url] } }));
  assert.deepEqual(codes(impression("https://u:p@t.example.com/i")), ["trackers.impression.0:credentials_in_url"]);
  assert.deepEqual(codes(impression(String.raw`https://t.example\@smithcdn.net/t`)), ["trackers.impression.0:bad_url"]);
  assert.deepEqual(codes(impression("https://smithcdn.net../t")), ["trackers.impression.0:own_host"]);
  assert.deepEqual(codes(save(base({ clickThroughUrl: "https://creosmith.com@elsewhere.example/" }))), [
    "clickThroughUrl:credentials_in_url",
  ]);
});

test("names that resolve only inside the viewer's network are private", () => {
  const impression = (url: string) => save(base({ trackers: { impression: [url] } }));
  for (const host of ["router.home.arpa", "nas.lan", "localhost.localdomain", "wiki.corp", "printer.home"]) {
    assert.deepEqual(codes(impression(`https://${host}/i`)), ["trackers.impression.0:private_host"], host);
  }
  assert.deepEqual(codes(impression("https://[fec0::1]/i")), ["trackers.impression.0:private_host"]);
});

test("a click destination carries no bracket macro: the click reaches it through /r", () => {
  assert.deepEqual(codes(save(base({ clickThroughUrl: "https://shop.example/?sub=[SUBID]" }))), [
    "clickThroughUrl:destination_macro",
  ]);
  assert.ok(save(base({ clickThroughUrl: "https://shop.example/?sub={click_id}" })).ok);
});

test("serve mode drops a tracker list of the wrong shape instead of the whole ad", () => {
  const result = parseVideoConfig(base({ trackers: { impression: "https://t.example.com/i" } }), {
    mode: "serve",
    ownerId: OWNER,
  });
  assert.ok(result.ok, JSON.stringify(codes(result)));
  assert.deepEqual(result.config.trackers.impression, []);
});

test("the stored object is held to the size cap, not only the input", () => {
  const urls = (path: string, length: number) =>
    Array.from({ length: 10 }, (_, i) => `https://t.example.com/${path}${i}?p=${"a".repeat(length)}`);
  const config = (clickLength: number) =>
    base({ companions: undefined, trackers: { impression: urls("i", 1900), click: urls("c", clickLength) } });
  // Grown to a few characters under the cap as input; the normalised config
  // adds the empty lists it was missing and lands over it.
  const room = LIMITS.configChars - 4 - JSON.stringify(config(0)).length;
  const input = config(Math.floor(room / 10));
  assert.ok(JSON.stringify(input).length <= LIMITS.configChars);
  assert.deepEqual(codes(save(input)), [":too_large"]);
});

test("an icon must end within the ad", () => {
  const icon = (offsetMs: number, durationMs: number) =>
    save(
      base({
        version: "4.2",
        icon: {
          program: "AdChoices",
          image: { source: "upload", url: IMAGE_URL, mime: "image/png" },
          width: 20,
          height: 20,
          xPosition: "right",
          yPosition: "top",
          offsetMs,
          durationMs,
        },
      }),
    );
  assert.ok(icon(5_000, 10_000).ok);
  assert.deepEqual(codes(icon(10_000, 10_000)), ["icon.durationMs:out_of_range"]);
});

test("a UniversalAdId placeholder is not an identifier", () => {
  assert.deepEqual(codes(save(base({ universalAdId: { registry: "ad-id.org", value: "unknown" } }))), [
    "universalAdId.value:placeholder_value",
  ]);
});

test("characters XML cannot carry are stripped from text", () => {
  const result = save(base({ adTitle: "Sale\uFFFF\uD800" }));
  assert.ok(result.ok);
  assert.equal(result.config.adTitle, "Sale");
});

test("our own and the legacy media hosts are ours for a linked file too", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  try {
    const linked = save(
      base({
        media: {
          source: "external",
          url: `https://project.supabase.co/storage/v1/object/public/creative-media/${OTHER}/0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b.mp4`,
          mime: "video/mp4",
          width: 640,
          height: 360,
          durationMs: 10_000,
        },
      }),
    );
    assert.deepEqual(codes(linked), ["media.url:own_host"]);
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  }
});

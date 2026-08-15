import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Assert the VAST inspection engine against its fixture corpus.
 *
 * The corpus used to carry its expectations in a comment — "the catalogue must
 * report zero findings here" — which is a wish, not a test. Several real errors
 * survived to code review because nothing checked it: a rule demanding
 * AdServingId of Wrappers, a hard error on VPAID in a VAST 4.3 document, and a
 * dry-run leak where a self-closing `<Impression/>` let the next real tracker
 * through untouched.
 *
 * Runs against a live dev server rather than importing the engine directly:
 * the engine is TypeScript with extensionless imports, which Node's type
 * stripping cannot resolve, and this project has no test runner or build step
 * for library code. Going through the route also exercises the HTTP contract
 * the browser actually uses.
 *
 *   npm run dev          # in one terminal
 *   npm run check:vast   # in another
 */

const BASE = process.env.VAST_CHECK_BASE ?? "http://localhost:3000";
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "vast-inspect", "__fixtures__");

/**
 * `rules` are ids that MUST be reported; `absent` are ids that must NOT be.
 * The `absent` lists are the regressions — each one is a false positive that
 * shipped once.
 */
const EXPECTATIONS = [
  {
    file: "clean-inline-42.xml",
    verdict: "pass",
    // The whole point of this fixture: a correct tag produces no error and no
    // warning. Advisories are opportunities and are allowed.
    maxErrors: 0,
    maxWarnings: 0,
    absent: [
      "VAST-adserving-id-required",
      "VPAID-deprecated",
      // The fixture used to be out of order while claiming to be clean, which
      // is what motivated the ordering rule at all.
      "VAST-child-order-inline",
    ],
  },
  {
    file: "broken-inline.xml",
    verdict: "fail",
    rules: [
      "VAST-inline-adtitle",
      "VAST-inline-impression",
      "VAST-linear-duration-format",
      "VAST-linear-skipoffset-format",
      "VAST-mediafile-required-attributes",
      "VAST-mediafile-delivery-value",
      "VAST-tracking-event-missing",
      "VAST-tracking-event-known",
      "VAST-progress-offset",
      "VAST-url-whitespace",
      "VAST-tracker-https",
      "VAST-error-macro",
      "VAST-unreplaced-macro",
      "VAST-mediafile-type-matches-extension",
    ],
  },
  {
    file: "vpaid-in-43.xml",
    // VPAID is deprecated, never invalid — 4.3 did not remove it. A hard error
    // here would be a fabricated spec violation on a conformant tag.
    verdict: "warn",
    maxErrors: 0,
    rules: ["VPAID-deprecated", "VPAID-no-video-fallback", "VAST-universal-ad-id-unknown"],
    absent: ["VPAID-removed-in-43"],
  },
  {
    file: "simid-omid-misplaced.xml",
    verdict: "fail",
    rules: ["OMID-verifications-placement", "SIMID-https", "SIMID-variable-duration"],
    absent: ["InteractiveCreativeFile-requires-40"],
  },
  {
    file: "playable-inline.xml",
    verdict: "pass",
    maxErrors: 0,
    maxWarnings: 0,
  },
  {
    file: "out-of-order.xml",
    // Order is normative (xs:sequence) but most players forgive it, so this is
    // a warning. Zero errors proves the rule does not drag other findings along.
    verdict: "warn",
    maxErrors: 0,
    rules: ["VAST-child-order-inline"],
  },
  {
    file: "malformed.xml",
    verdict: "fail",
    rules: ["VAST-xml-well-formed"],
  },
];

/** Dry-run must never let a third-party tracking host survive into playback. */
const LEAK_PROBE = `<VAST version="4.2"><Ad><InLine>
  <Impression/>
  <Impression><![CDATA[https://leak.invalid/imp1]]></Impression>
  <Impression><![CDATA[https://leak.invalid/imp2]]></Impression>
  <Creatives><Creative><Linear><TrackingEvents>
    <Tracking event="start"/>
    <Tracking event="complete"><![CDATA[https://leak.invalid/complete]]></Tracking>
  </TrackingEvents></Linear></Creative></Creatives>
</InLine></Ad></VAST>`;

async function inspect(body) {
  const response = await fetch(`${BASE}/api/tools/vast/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data.error) throw new Error(`${response.status}: ${data.error}`);
  return data;
}

const failures = [];
const note = (message) => failures.push(message);

for (const expected of EXPECTATIONS) {
  const xml = readFileSync(join(FIXTURES, expected.file), "utf8");
  let report;
  try {
    report = await inspect({ mode: "xml", value: xml, pixelMode: "dryRun" });
  } catch (cause) {
    note(`${expected.file}: request failed — ${cause.message}`);
    continue;
  }

  const ids = new Set(report.findings.map((finding) => finding.ruleId));
  const summary = `E${report.counts.error} W${report.counts.warning} A${report.counts.advisory}`;

  if (report.verdict !== expected.verdict) {
    note(`${expected.file}: verdict ${report.verdict}, expected ${expected.verdict} (${summary})`);
  }
  if (expected.maxErrors !== undefined && report.counts.error > expected.maxErrors) {
    note(
      `${expected.file}: ${report.counts.error} errors, expected at most ${expected.maxErrors} — ` +
        report.findings.filter((f) => f.severity === "error").map((f) => f.ruleId).join(", "),
    );
  }
  if (expected.maxWarnings !== undefined && report.counts.warning > expected.maxWarnings) {
    note(
      `${expected.file}: ${report.counts.warning} warnings, expected at most ${expected.maxWarnings} — ` +
        report.findings.filter((f) => f.severity === "warning").map((f) => f.ruleId).join(", "),
    );
  }
  for (const rule of expected.rules ?? []) {
    if (!ids.has(rule)) note(`${expected.file}: expected rule ${rule} did not fire`);
  }
  for (const rule of expected.absent ?? []) {
    if (ids.has(rule)) note(`${expected.file}: rule ${rule} fired but must not`);
  }
  if (report.degraded?.length) {
    note(`${expected.file}: rules threw — ${report.degraded.join(", ")}`);
  }

  console.log(`  ${expected.file.padEnd(28)} ${report.verdict.padEnd(5)} ${summary}`);
}

// The dry-run guarantee, checked as a property rather than by inspection.
try {
  const report = await inspect({ mode: "xml", value: LEAK_PROBE, pixelMode: "dryRun" });
  const leaked = [...new Set([...(report.playback.adsResponse ?? "").matchAll(/leak\.invalid\/\w+/g)].map((m) => m[0]))];
  if (leaked.length) note(`dry-run leaked third-party trackers: ${leaked.join(", ")}`);
  console.log(`  ${"dry-run leak probe".padEnd(28)} ${leaked.length ? "LEAK" : "clean"}`);
} catch (cause) {
  note(`dry-run leak probe: request failed — ${cause.message}`);
}

// Live mode must hand the player the user's original bytes, unmodified.
try {
  const report = await inspect({ mode: "xml", value: LEAK_PROBE, pixelMode: "live" });
  if (report.playback.adsResponse !== LEAK_PROBE) note("live mode altered the document");
  console.log(`  ${"live passthrough".padEnd(28)} ${report.playback.adsResponse === LEAK_PROBE ? "identical" : "ALTERED"}`);
} catch (cause) {
  note(`live passthrough: request failed — ${cause.message}`);
}

console.log("");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
console.log(`All ${EXPECTATIONS.length} fixtures and 2 playback properties OK.`);

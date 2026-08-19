import type { ChainResult } from "./chain";
import { detectFeatures } from "./features";
import {
  normalizeVersion,
  SEVERITY_ORDER,
  type InspectReport,
  type InteractiveHit,
  type ParsedFacts,
  type Playback,
  type Severity,
  type Verdict,
} from "./model";
import { isPlayableVideoType } from "./rules/kit";
import { attr, descendants, type VNode } from "./xml-tree";

/**
 * Assembly of the final report.
 *
 * Findings come in as a flat list from the rule runner; everything else here is
 * the interpretation layer — what standard is actually in play, what the whole
 * thing amounts to, and what the reader should do about it.
 */

/* ---------- interactive standards ---------- */

/**
 * The VPAID / SIMID / OMID section.
 *
 * Kept separate from the rule findings because it answers a different question.
 * Findings say what is wrong; this says what the tag *is* — which standard it
 * bets on, where the code lives, and what that choice costs. For a product
 * whose whole subject is interactive creative, that deserves its own panel
 * rather than three rows buried in a feature matrix.
 */
export function detectInteractive(docs: VNode[]): InteractiveHit[] {
  const nodes = (name: string) => docs.flatMap((doc) => descendants(doc, name));

  const vpaidNodes = [...nodes("MediaFile"), ...nodes("Creative")].filter(
    (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid",
  );
  const simidNodes = nodes("InteractiveCreativeFile");
  const verificationNodes = nodes("Verification");

  const hits: InteractiveHit[] = [];

  hits.push({
    standard: "VPAID",
    present: vpaidNodes.length > 0,
    path: vpaidNodes[0]?.path,
    resource: vpaidNodes[0]?.text.trim() || undefined,
    attrs: vpaidNodes[0]?.attrs,
    notes: vpaidNodes.length
      ? [
          {
            ru: "Код креатива исполняется в контексте страницы издателя и сам управляет проигрыванием. Именно поэтому стандарт снимают с поддержки: он несовместим с CTV и мешает плееру измерять и буферизовать видео.",
            en: "The creative's code runs in the publisher page's own context and drives playback itself. That is precisely why the standard is being retired: it is incompatible with CTV and it prevents the player from measuring and buffering the video.",
          },
        ]
      : [],
  });

  hits.push({
    standard: "SIMID",
    present: simidNodes.length > 0,
    path: simidNodes[0]?.path,
    resource: simidNodes[0]?.text.trim() || undefined,
    attrs: simidNodes[0]?.attrs,
    notes: simidNodes.length
      ? [
          {
            ru: "Интерактивный слой изолирован в iframe и общается с плеером сообщениями, а видео остаётся обычным MediaFile. Плеер сохраняет контроль над проигрыванием — поэтому SIMID работает и на CTV.",
            en: "The interactive layer is isolated in an iframe and talks to the player over messages, while the video stays an ordinary MediaFile. The player keeps control of playback, which is why SIMID works on CTV.",
          },
        ]
      : [],
  });

  const vendors = verificationNodes
    .map((node) => attr(node, "vendor"))
    .filter((vendor): vendor is string => Boolean(vendor?.trim()));
  hits.push({
    standard: "OMID",
    present: verificationNodes.length > 0,
    path: verificationNodes[0]?.path,
    resource: descendants(verificationNodes[0], "JavaScriptResource")[0]?.text.trim(),
    attrs: verificationNodes[0]?.attrs,
    notes: verificationNodes.length
      ? [
          {
            ru:
              vendors.length > 0
                ? `Измерители, заявленные в теге: ${vendors.join(", ")}.`
                : "Измерители заявлены, но ни у одного не указан vendor.",
            en:
              vendors.length > 0
                ? `Verification vendors declared in the tag: ${vendors.join(", ")}.`
                : "Verification is declared but no vendor is named.",
          },
        ]
      : [],
  });

  return hits;
}

/* ---------- parsed facts ---------- */

/** "00:00:30.500" → 30.5. Returns undefined for anything not in that shape. */
function durationToSeconds(value: string): number | undefined {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return undefined;
  const [, hours, minutes, seconds, millis] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    (millis ? Number(millis.padEnd(3, "0")) / 1000 : 0)
  );
}

/**
 * Reduce the chain to the handful of values a player will also report.
 *
 * Read across every document rather than just the last: a wrapper legitimately
 * carries the AdSystem and the UniversalAdId while the InLine carries the media,
 * and taking only one end of the chain would report absences that are not real.
 */
export function extractFacts(docs: VNode[], wrapperCount: number): ParsedFacts {
  const nodes = (name: string) => docs.flatMap((doc) => descendants(doc, name));
  const firstText = (name: string) =>
    nodes(name)
      .map((node) => node.text.trim())
      .find((text) => text.length > 0);

  const duration = firstText("Duration");
  const universalAdId = nodes("UniversalAdId")[0];
  const video = nodes("MediaFile").find((node) => isPlayableVideoType(attr(node, "type")));
  const linear = nodes("Linear").find((node) => attr(node, "skipoffset"));

  const apiFrameworks = [
    ...new Set(
      [...nodes("MediaFile"), ...nodes("Creative"), ...nodes("InteractiveCreativeFile")]
        .map((node) => (attr(node, "apiFramework") ?? "").trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ];

  return {
    durationSeconds: duration ? durationToSeconds(duration) : undefined,
    universalAdIdRegistry: universalAdId ? attr(universalAdId, "idRegistry") : undefined,
    // VAST 4.0 put the value in `idValue`; 4.1 moved it to element text.
    // Reading only one of the two loses it on half the tags in the wild.
    universalAdIdValue:
      universalAdId?.text.trim() || (universalAdId ? attr(universalAdId, "idValue") : undefined) || undefined,
    mediaWidth: video ? Number(attr(video, "width")) || undefined : undefined,
    mediaHeight: video ? Number(attr(video, "height")) || undefined : undefined,
    adSystem: firstText("AdSystem"),
    adTitle: firstText("AdTitle"),
    apiFrameworks,
    wrapperCount,
    skipOffset: linear ? attr(linear, "skipoffset") : undefined,
  };
}

/* ---------- assembly ---------- */

function verdictFrom(counts: Record<Severity, number>): Verdict {
  if (counts.error > 0) return "fail";
  if (counts.warning > 0) return "warn";
  return "pass";
}

export interface BuildReportInput {
  mode: "url" | "xml";
  url: string;
  chain: ChainResult;
  playback: Playback;
}

export function buildReport(input: BuildReportInput): InspectReport {
  const { chain } = input;
  const docs = chain.documents.map((doc) => doc.root);
  const declared = normalizeVersion(chain.declaredRaw);

  const findings = [...chain.findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.hop !== b.hop) return a.hop - b.hop;
    return a.path.localeCompare(b.path);
  });

  const counts: Record<Severity, number> = { error: 0, warning: 0, advisory: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  const interactive = detectInteractive(docs);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      mode: input.mode,
      url: input.mode === "url" ? input.url : "",
      bytes: chain.totalBytes,
    },
    verdict: verdictFrom(counts),
    counts,
    declaredVersion: chain.declaredRaw,
    effectiveVersion: declared,
    adCount: chain.hops.reduce((total, hop) => total + hop.adCount, 0),
    facts: extractFacts(docs, chain.hops.filter((hop) => hop.kind === "wrapper").length),
    chain: chain.hops,
    features: detectFeatures(docs, declared),
    interactive,
    findings,
    trackers: chain.trackers,
    degraded: chain.degraded,
    playback: input.playback,
  };
}

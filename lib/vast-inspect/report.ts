import type { ChainResult } from "./chain";
import { detectFeatures } from "./features";
import {
  normalizeVersion,
  SEVERITY_ORDER,
  atLeast,
  type Finding,
  type InspectReport,
  type InteractiveHit,
  type Msg,
  type ParsedFacts,
  type Playback,
  type Recommendation,
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

/* ---------- recommendations ---------- */

function recommendation(
  id: string,
  severity: Severity,
  title: Msg,
  body: Msg,
  relatedRuleIds: string[],
): Recommendation {
  return { id, severity, title, body, relatedRuleIds };
}

/**
 * Turn findings into advice.
 *
 * Deliberately not one recommendation per finding: forty rows of "add the
 * missing attribute" is a to-do list, not advice. These are the handful of
 * moves that change the outcome, each one collecting the findings that argue
 * for it.
 */
export function buildRecommendations(
  findings: Finding[],
  interactive: InteractiveHit[],
  declared: ReturnType<typeof normalizeVersion>,
): Recommendation[] {
  const out: Recommendation[] = [];
  const has = (prefix: string) => findings.filter((f) => f.ruleId.startsWith(prefix));
  const ids = (list: Finding[]) => [...new Set(list.map((f) => f.ruleId))];

  const vpaid = interactive.find((hit) => hit.standard === "VPAID");
  const simid = interactive.find((hit) => hit.standard === "SIMID");
  if (vpaid?.present && !simid?.present) {
    out.push(
      recommendation(
        "migrate-to-simid",
        "warning",
        {
          ru: "Перевести интерактив с VPAID на SIMID",
          en: "Move the interactive layer from VPAID to SIMID",
        },
        {
          ru: "VPAID официально объявлен устаревшим в VAST 4.1 — но не удалён: 4.3 по-прежнему описывает, как его отдавать. Практика жёстче спецификации: он не работает на CTV, всё чаще отключается на мобильных и мешает плееру измерять видео. SIMID решает ту же задачу: интерактив живёт в изолированном iframe, а видео остаётся обычным MediaFile, который плеер буферизует и мерит сам.",
          en: "VPAID was officially deprecated in VAST 4.1 — but never removed: 4.3 still documents how to serve it. Practice is harsher than the specification, though: it does not work on CTV, is increasingly disabled on mobile, and blocks the player from measuring the video. SIMID solves the same problem: the interactive layer runs in a sandboxed iframe while the video stays an ordinary MediaFile the player buffers and measures itself.",
        },
        ids([...has("VPAID-")]),
      ),
    );
  }

  const httpFindings = findings.filter(
    (f) => f.ruleId === "VAST-tracker-https" || f.ruleId === "VAST-mixed-scheme" || f.ruleId === "SIMID-https" || f.ruleId === "OMID-resource-https",
  );
  if (httpFindings.length > 0) {
    out.push(
      recommendation(
        "https-everywhere",
        "warning",
        { ru: "Перевести все адреса на https", en: "Move every address to https" },
        {
          ru: "Страница издателя почти всегда работает по https, и браузер блокирует http-ресурсы с неё как mixed content. Заблокированный пиксель не сработает молча — вы увидите не ошибку, а просто недосчёт показов при сверке.",
          en: "A publisher page is almost always https, and the browser blocks http resources from it as mixed content. A blocked pixel fails silently — you see no error, only a shortfall at reconciliation.",
        },
        ids(httpFindings),
      ),
    );
  }

  const measurement = findings.filter((f) => f.group === "verification");
  if (measurement.length > 0) {
    out.push(
      recommendation(
        "fix-measurement",
        "warning",
        { ru: "Починить независимую верификацию", en: "Repair independent verification" },
        {
          ru: "Ошибки в блоке AdVerifications не мешают показу и потому остаются незамеченными месяцами. Замечаются они в момент, когда рекламодатель спрашивает, почему виуабилити нулевая, — а к тому времени данные уже не восстановить.",
          en: "Faults in the AdVerifications block do not stop playback and so go unnoticed for months. They are noticed when the advertiser asks why viewability is zero — by which point the data cannot be recovered.",
        },
        ids(measurement),
      ),
    );
  }

  if (declared && !atLeast(declared, "4.1")) {
    out.push(
      recommendation(
        "upgrade-version",
        "advisory",
        {
          ru: `Поднять объявленную версию VAST с ${declared} до 4.2`,
          en: `Raise the declared VAST version from ${declared} to 4.2`,
        },
        {
          ru: "Версия в атрибуте version определяет, какие возможности плеер вообще станет искать. На 4.2 становятся доступны UniversalAdId для сквозного частотного ограничения, AdVerifications для независимых замеров, Mezzanine для серверной вставки и SIMID вместо VPAID. Сам по себе апгрейд номера ничего не ломает: плееры, понимающие 4.x, читают документ обратносовместимо.",
          en: "The version attribute decides which capabilities a player will even look for. At 4.2 you gain UniversalAdId for cross-publisher frequency capping, AdVerifications for independent measurement, Mezzanine for server-side insertion, and SIMID in place of VPAID. Raising the number alone breaks nothing: players that understand 4.x read the document backwards-compatibly.",
        },
        ids(findings.filter((f) => f.ruleId.includes("requires") || f.ruleId.includes("before-3"))),
      ),
    );
  }

  const chainFindings = findings.filter(
    (f) => f.ruleId === "VAST-wrapper-depth" || f.ruleId === "VAST-wrapper-cycle",
  );
  if (chainFindings.length > 0) {
    out.push(
      recommendation(
        "shorten-chain",
        "error",
        { ru: "Сократить цепочку обёрток", en: "Shorten the wrapper chain" },
        {
          ru: "Каждая обёртка — отдельный сетевой запрос до старта ролика и ещё одна точка отказа. Плееры прекращают обход примерно на пятом переходе; всё, что дальше, не показывается никогда.",
          en: "Every wrapper is another network round trip before the ad starts and another point of failure. Players stop following at around the fifth hop; anything beyond it never renders.",
        },
        ids(chainFindings),
      ),
    );
  }

  const uaid = findings.filter((f) => f.ruleId.startsWith("VAST-universal-ad-id"));
  if (uaid.length > 0) {
    out.push(
      recommendation(
        "add-universal-ad-id",
        "advisory",
        { ru: "Добавить UniversalAdId", en: "Add a UniversalAdId" },
        {
          ru: "Это единственный идентификатор, одинаковый у одного ролика во всех системах. Без него частотное ограничение не работает между площадками: один ролик считается разными креативами, и пользователь видит его заметно чаще, чем запланировано в медиаплане.",
          en: "It is the only identifier that stays the same for one asset across every system. Without it frequency capping does not work across publishers: one spot counts as several creatives and the viewer sees it markedly more often than the plan intended.",
        },
        ids(uaid),
      ),
    );
  }

  return out;
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
    recommendations: buildRecommendations(findings, interactive, declared),
    degraded: chain.degraded,
    playback: input.playback,
  };
}

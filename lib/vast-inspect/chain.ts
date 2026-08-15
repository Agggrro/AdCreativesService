import { fetchTag, TagFetchError } from "./fetch-tag";
import { normalizeVersion, type Finding, type Hop, type Msg, type TrackerHit } from "./model";
import { runRules } from "./rules";
import { collectTrackers } from "./trackers";
import { all, attr, first, parseXml, type VNode } from "./xml-tree";

/**
 * Wrapper chain resolution.
 *
 * The player will walk this chain itself at playback time. We walk it too, and
 * separately, because the report needs three things a player never surfaces:
 * per-hop latency (which ad server is costing you 400 ms), per-hop tracker
 * ownership (who joined the chain and where), and the structural findings in
 * documents the player discards after following them.
 *
 * Five hops is the VAST-recommended ceiling and the number most players enforce
 * — a chain that needs a sixth is already broken in production, so stopping
 * here reproduces reality rather than being generous.
 */
export const MAX_HOPS = 5;

export interface ChainDocument {
  hop: number;
  root: VNode;
  source: string;
}

export interface ChainResult {
  hops: Hop[];
  documents: ChainDocument[];
  findings: Finding[];
  trackers: TrackerHit[];
  /** Rules that threw while analysing this chain (rules/index.ts). */
  degraded: string[];
  /** The version declared by the first document — what the tag claims to be. */
  declaredRaw?: string;
  totalBytes: number;
}

export interface ChainInput {
  mode: "url" | "xml";
  value: string;
}

/** The first <VASTAdTagURI> in a document, which is the next hop. */
function nextTagUri(root: VNode): string | undefined {
  for (const ad of all(root, "Ad")) {
    const wrapper = first(ad, "Wrapper");
    if (!wrapper) continue;
    const uri = first(wrapper, "VASTAdTagURI")?.text.trim();
    if (uri) return uri;
  }
  return undefined;
}

function classify(root: VNode): Hop["kind"] {
  const ads = all(root, "Ad");
  if (ads.length === 0) return "empty";
  if (ads.some((ad) => first(ad, "Wrapper"))) return "wrapper";
  return "inline";
}

function adSystemOf(root: VNode): string | undefined {
  for (const ad of all(root, "Ad")) {
    for (const body of [first(ad, "InLine"), first(ad, "Wrapper")]) {
      const name = first(body, "AdSystem")?.text.trim();
      if (name) return name;
    }
  }
  return undefined;
}

/** Fetch failures rendered for a reader rather than for a log. */
function describeFetchFailure(error: TagFetchError, url: string): Msg {
  switch (error.reason) {
    case "blocked":
      return {
        ru: `Адрес ${url} указывает во внутреннюю сеть и не может быть запрошен.`,
        en: `${url} points into a private network and cannot be requested.`,
      };
    case "scheme":
      return {
        ru: `Схема адреса не поддерживается — допустимы только http и https.`,
        en: `Unsupported URL scheme — only http and https are allowed.`,
      };
    case "dns":
      return {
        ru: `Домен не резолвится. Проверьте написание адреса и что он опубликован в DNS.`,
        en: `The domain does not resolve. Check the spelling and that it is published in DNS.`,
      };
    case "timeout":
      return {
        ru: `Сервер не ответил за отведённое время. Реальный плеер прервёт цепочку на этом месте с кодом 301.`,
        en: `The server did not respond in time. A real player abandons the chain here with error 301.`,
      };
    case "too-many-redirects":
      return {
        ru: `Слишком много HTTP-редиректов.`,
        en: `Too many HTTP redirects.`,
      };
    case "bad-url":
      return {
        ru: `Адрес не является корректным абсолютным URL.`,
        en: `The address is not a valid absolute URL.`,
      };
    default:
      return {
        ru: `Не удалось получить ответ: ${error.message}`,
        en: `Could not retrieve a response: ${error.message}`,
      };
  }
}

/** A finding raised by the walker itself rather than by a per-document rule. */
function chainFinding(
  ruleId: string,
  severity: Finding["severity"],
  hop: number,
  message: Msg,
  hint: Msg,
  offending?: string,
  iabErrorCode?: number,
): Finding {
  return {
    ruleId,
    group: "wrapper",
    severity,
    spec: {
      doc: "VAST 4.2",
      section: "§3.3 Wrapper",
      url: "https://iabtechlab.com/wp-content/uploads/2019/06/VAST_4.2_final_june26.pdf",
    },
    iabErrorCode,
    hop,
    path: "/VAST",
    message,
    hint,
    offending,
  };
}

export async function resolveChain(input: ChainInput): Promise<ChainResult> {
  const hops: Hop[] = [];
  const documents: ChainDocument[] = [];
  const findings: Finding[] = [];
  const trackers: TrackerHit[] = [];
  const degraded: string[] = [];
  const visited = new Set<string>();

  let declaredRaw: string | undefined;
  let totalBytes = 0;
  let nextUrl: string | undefined = input.mode === "url" ? input.value.trim() : undefined;
  let pendingSource: string | undefined = input.mode === "xml" ? input.value : undefined;

  for (let index = 0; index < MAX_HOPS; index += 1) {
    let source: string;
    let hop: Hop;

    if (pendingSource !== undefined) {
      // Hop 0 in paste mode: the document is already in hand.
      source = pendingSource;
      pendingSource = undefined;
      const bytes = Buffer.byteLength(source, "utf8");
      // Counted towards the total like any other hop: the summary reads "0 B
      // downloaded" for a pasted document otherwise, while the chain table
      // right below it shows the real size.
      totalBytes += bytes;
      hop = {
        index,
        url: "(inline XML)",
        bytes,
        elapsedMs: 0,
        redirects: [],
        kind: "empty",
        adCount: 0,
      };
    } else if (nextUrl !== undefined) {
      if (visited.has(nextUrl)) {
        findings.push(
          chainFinding(
            "VAST-wrapper-cycle",
            "error",
            index,
            {
              ru: "Цепочка обёрток зациклена — этот адрес уже встречался выше.",
              en: "The wrapper chain loops — this address has already been requested.",
            },
            {
              ru: "Плеер пройдёт по кругу до исчерпания лимита обёрток и вернёт ошибку 302, не показав ничего. Обычно причина — ad-сервер, настроенный отдавать сам на себя при отсутствии филла.",
              en: "A player goes round until it exhausts its wrapper limit, then reports error 302 having shown nothing. The usual cause is an ad server configured to redirect to itself when it has no fill.",
            },
            nextUrl,
            302,
          ),
        );
        break;
      }
      visited.add(nextUrl);

      try {
        const response = await fetchTag(nextUrl);
        source = response.body;
        totalBytes += response.bytes;
        hop = {
          index,
          url: nextUrl,
          finalUrl: response.finalUrl !== nextUrl ? response.finalUrl : undefined,
          status: response.status,
          contentType: response.contentType,
          bytes: response.bytes,
          elapsedMs: response.elapsedMs,
          redirects: response.redirects,
          kind: "empty",
          adCount: 0,
        };

        if (response.truncated) {
          findings.push(
            chainFinding(
              "VAST-response-too-large",
              "warning",
              index,
              {
                ru: "Ответ превысил 512 КБ и был обрезан при проверке.",
                en: "The response exceeded 512 KB and was truncated for analysis.",
              },
              {
                ru: "VAST такого размера почти всегда означает встроенный в XML base64-ресурс или дублирующийся трекинг. Разбор ниже выполнен по первым 512 КБ.",
                en: "A VAST document this large nearly always means a base64 resource embedded in the XML, or duplicated tracking. The analysis below covers the first 512 KB.",
              },
            ),
          );
        }

        if (response.status >= 400) {
          findings.push(
            chainFinding(
              "VAST-hop-http-error",
              "error",
              index,
              {
                ru: "Ad-сервер ответил кодом ошибки HTTP.",
                en: "The ad server responded with an HTTP error status.",
              },
              {
                ru: "Плеер не получит объявления по этому адресу. Проверьте, что тег скопирован целиком и что все обязательные параметры запроса на месте.",
                en: "A player gets no ad from this address. Check the tag was copied in full and that every required request parameter is present.",
              },
              `HTTP ${response.status}`,
              response.status >= 500 ? 300 : 301,
            ),
          );
        }
      } catch (cause) {
        const error = cause instanceof TagFetchError ? cause : undefined;
        hops.push({
          index,
          url: nextUrl,
          bytes: 0,
          elapsedMs: 0,
          redirects: [],
          kind: "error",
          adCount: 0,
          error: error
            ? describeFetchFailure(error, nextUrl)
            : {
                ru: "Не удалось получить ответ от сервера.",
                en: "Could not retrieve a response from the server.",
              },
        });
        findings.push(
          chainFinding(
            "VAST-hop-unreachable",
            "error",
            index,
            {
              ru: "Не удалось загрузить документ по этому адресу.",
              en: "The document at this address could not be retrieved.",
            },
            error
              ? describeFetchFailure(error, nextUrl)
              : {
                  ru: "Сервер не ответил.",
                  en: "The server did not respond.",
                },
            nextUrl,
            index === 0 ? 300 : 301,
          ),
        );
        break;
      }
      nextUrl = undefined;
    } else {
      break;
    }

    const parsed = parseXml(source);
    if (!parsed.root) {
      hop.kind = "error";
      hop.error = {
        ru: `Ответ не является корректным XML: ${parsed.error?.msg ?? "неизвестная ошибка"}`,
        en: `The response is not well-formed XML: ${parsed.error?.msg ?? "unknown error"}`,
      };
      hops.push(hop);
      findings.push({
        ruleId: "VAST-xml-well-formed",
        group: "document",
        severity: "error",
        spec: {
          doc: "VAST 4.2",
          section: "§2.2 XML structure",
          url: "https://iabtechlab.com/wp-content/uploads/2019/06/VAST_4.2_final_june26.pdf",
        },
        iabErrorCode: 100,
        hop: index,
        path: "/",
        line: parsed.error?.line || undefined,
        message: {
          ru: "Документ не является корректным XML.",
          en: "The document is not well-formed XML.",
        },
        hint: {
          ru: "Плеер вернёт ошибку 100 и не станет разбирать содержимое. Частые причины: обрезанный ответ, HTML-страница ошибки вместо VAST, незакрытый тег или лишний символ перед объявлением XML.",
          en: "A player reports error 100 and parses nothing further. Common causes: a truncated response, an HTML error page in place of VAST, an unclosed tag, or a stray character before the XML declaration.",
        },
        offending: parsed.error ? `${parsed.error.msg} (${parsed.error.line}:${parsed.error.col})` : undefined,
      });
      break;
    }

    const root = parsed.root;
    const rawVersion = attr(root, "version");
    if (index === 0) declaredRaw = rawVersion;

    hop.kind = classify(root);
    hop.declaredVersion = rawVersion;
    hop.adSystem = adSystemOf(root);
    hop.adCount = all(root, "Ad").length;
    hops.push(hop);
    documents.push({ hop: index, root, source });

    const followUp = nextTagUri(root);
    const run = runRules({
      hop: index,
      root,
      declaredRaw: rawVersion,
      declared: normalizeVersion(rawVersion),
      source,
    });
    findings.push(...run.findings);
    degraded.push(...run.degraded);
    trackers.push(...collectTrackers(root, index));

    if (!followUp) break;

    if (index === MAX_HOPS - 1) {
      findings.push(
        chainFinding(
          "VAST-wrapper-depth",
          "error",
          index,
          {
            ru: `Цепочка обёрток не разрешилась в InLine за ${MAX_HOPS} переходов.`,
            en: `The wrapper chain did not resolve to an InLine within ${MAX_HOPS} hops.`,
          },
          {
            ru: "Большинство плееров прекращают обход примерно на этой глубине и возвращают ошибку 302. Каждый переход — это ещё один сетевой запрос перед стартом ролика, поэтому длинные цепочки не только рискованны, но и заметно медленнее.",
            en: "Most players stop following at about this depth and report error 302. Every hop is another network round trip before the ad starts, so long chains are not only fragile but measurably slower.",
          },
          `${MAX_HOPS} hops`,
          302,
        ),
      );
      break;
    }

    nextUrl = followUp;
  }

  return { hops, documents, findings, trackers, degraded, declaredRaw, totalBytes };
}

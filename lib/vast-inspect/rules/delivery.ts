import { descendants, walkAll } from "../xml-tree";
import { checkUrl, hit, looksLikeCdata, macrosIn, vast, type Rule } from "./kit";

/**
 * Delivery hygiene: the checks that are about bytes on the wire rather than
 * about the content model. These catch the tags that validate cleanly and still
 * fail in production.
 */

/** Elements whose text content is expected to be a URL. */
const URL_ELEMENTS = [
  "Impression",
  "Tracking",
  "ClickThrough",
  "ClickTracking",
  "CustomClick",
  "Error",
  "MediaFile",
  "Mezzanine",
  "InteractiveCreativeFile",
  "VASTAdTagURI",
  "JavaScriptResource",
  "ExecutableResource",
  "IFrameResource",
  "StaticResource",
  "Viewable",
  "NotViewable",
  "ViewUndetermined",
  "CompanionClickThrough",
  "CompanionClickTracking",
  "NonLinearClickThrough",
  "NonLinearClickTracking",
  "IconClickThrough",
  "IconViewTracking",
  "IconClickTracking",
];

export const deliveryRules: Rule[] = [
  {
    id: "VAST-url-needs-cdata",
    group: "delivery",
    severity: "warning",
    spec: vast("§2.2 XML structure"),
    check: (ctx) =>
      URL_ELEMENTS.flatMap((name) =>
        descendants(ctx.root, name)
          .filter((node) => node.text.includes("&") || node.text.includes("<"))
          .filter((node) => !looksLikeCdata(ctx.source, name, node.text))
          .map((node) =>
            hit(
              node,
              {
                ru: "URL содержит спецсимволы XML, но не обёрнут в CDATA.",
                en: "The URL contains XML special characters but is not wrapped in CDATA.",
              },
              {
                ru: "Ваш URL с параметрами разобрался только потому, что & был экранирован как &amp;. Оборачивайте URL в <![CDATA[…]]> — это устраняет целый класс расхождений между парсерами и позволяет писать адрес как есть.",
                en: "This URL parsed only because & was written as &amp;. Wrap URLs in <![CDATA[…]]> instead — it removes a whole class of parser-to-parser disagreement and lets the address be written literally.",
              },
              node.text.trim().slice(0, 160),
            ),
          ),
      ),
  },
  {
    id: "VAST-url-whitespace",
    group: "delivery",
    severity: "error",
    spec: vast("§2.3.4 Tracking URIs"),
    iabErrorCode: 101,
    check: (ctx) =>
      URL_ELEMENTS.flatMap((name) => descendants(ctx.root, name))
        .filter((node) => node.text.trim() && /[\s]/.test(node.text.trim()))
        .map((node) =>
          hit(
            node,
            {
              ru: "URL содержит пробел или перенос строки.",
              en: "The URL contains a space or a line break.",
            },
            {
              ru: "Скорее всего адрес перенесён по строкам ради читаемости шаблона. XML пробелы сохраняет, и плеер получит битый URL. Держите адрес в одну строку или кодируйте пробелы как %20.",
              en: "The address has most likely been wrapped across lines to keep a template readable. XML preserves the whitespace and the player receives a broken URL. Keep it on one line, or encode spaces as %20.",
            },
            node.text.trim().slice(0, 160),
          ),
        ),
  },
  {
    id: "VAST-unreplaced-macro",
    group: "delivery",
    severity: "warning",
    spec: vast("§6 Macros"),
    check: (ctx) => {
      // Macros the player is supposed to substitute at request time are fine
      // wherever they appear. Anything else in [BRACKETS] is a template the
      // ad server forgot to fill in before it shipped.
      const PLAYER_SUBSTITUTED = new Set([
        "ERRORCODE",
        "CACHEBUSTING",
        "CONTENTPLAYHEAD",
        "ADPLAYHEAD",
        "MEDIAPLAYHEAD",
        "ASSETURI",
        "TIMESTAMP",
        "PLAYERCAPABILITIES",
        "CLICKPOS",
        "ADCATEGORIES",
        "ADCOUNT",
        "ADSERVINGID",
        "ADTYPE",
        "APPBUNDLE",
        "BREAKMAXADS",
        "BREAKMAXDURATION",
        "BREAKMINADDURATION",
        "BREAKPOSITION",
        "CLIENTUA",
        "CONTENTID",
        "CONTENTURI",
        "DEVICEIP",
        "DEVICEUA",
        "DOMAIN",
        "GDPRCONSENT",
        "IFA",
        "IFATYPE",
        "INVENTORYSTATE",
        "LATLONG",
        "LIMITADTRACKING",
        "MEDIAMIME",
        "OMIDPARTNER",
        "PAGEURL",
        "PLACEMENTTYPE",
        "PLAYERSIZE",
        "PLAYERSTATE",
        "PODSEQUENCE",
        "REGULATIONS",
        "SERVERSIDE",
        "SERVERUA",
        "TRANSACTIONID",
        "UNIVERSALADID",
        "US_PRIVACY",
        "VASTVERSIONS",
        "VERIFICATIONVENDORS",
      ]);

      const offenders = new Map<string, { path: string; line?: number }>();
      for (const node of walkAll(ctx.root)) {
        for (const macro of macrosIn(node.text)) {
          if (!PLAYER_SUBSTITUTED.has(macro) && !offenders.has(macro)) {
            offenders.set(macro, { path: node.path, line: node.line });
          }
        }
      }
      return [...offenders.entries()].map(([macro, where]) => ({
        path: where.path,
        line: where.line,
        message: {
          ru: "В документе остался неподставленный макрос.",
          en: "An unsubstituted macro is still present in the document.",
        },
        hint: {
          ru: "Этот макрос не входит в набор, который подставляет плеер, — значит, его должен был заполнить ad-сервер и не заполнил. URL уйдёт с квадратными скобками внутри и, скорее всего, вернёт 404.",
          en: "This macro is not one a player substitutes, which means the ad server should have filled it in and did not. The URL will go out with square brackets in it and most likely return a 404.",
        },
        offending: `[${macro}]`,
      }));
    },
  },
  {
    id: "VAST-empty-url-element",
    group: "delivery",
    severity: "warning",
    spec: vast("§2.2 XML structure"),
    check: (ctx) =>
      URL_ELEMENTS.flatMap((name) => descendants(ctx.root, name))
        .filter((node) => node.text.trim() === "" && node.children.length === 0)
        .map((node) =>
          hit(
            node,
            {
              ru: "Элемент, ожидающий URL, пуст.",
              en: "An element that expects a URL is empty.",
            },
            {
              ru: "Пустой трекинговый элемент — почти всегда след шаблона, где переменная не подставилась. Он безвреден для показа, но маскирует потерю события: вы будете считать, что трекинг настроен.",
              en: "An empty tracking element is nearly always the residue of a template variable that never got filled. It is harmless to playback but hides a lost event: you will believe the tracking is wired up.",
            },
          ),
        ),
  },
  {
    id: "VAST-mixed-scheme",
    group: "delivery",
    severity: "advisory",
    spec: vast("§2.3.4 Tracking URIs"),
    check: (ctx) => {
      const schemes = new Set<string>();
      for (const name of URL_ELEMENTS) {
        for (const node of descendants(ctx.root, name)) {
          const verdict = checkUrl(node.text);
          if (verdict.ok && verdict.url) schemes.add(verdict.url.protocol);
        }
      }
      if (schemes.size < 2) return [];
      return [
        hit(
          ctx.root,
          {
            ru: "В документе смешаны http- и https-адреса.",
            en: "The document mixes http and https addresses.",
          },
          {
            ru: "Часть ресурсов сработает, часть будет заблокирована браузером — и разобраться, какая метрика недосчитана, станет заметно сложнее. Приведите все адреса к https.",
            en: "Some resources will work and some will be blocked by the browser, which makes it considerably harder to work out which metric is short. Move every address to https.",
          },
          [...schemes].join(" + "),
        ),
      ];
    },
  },
];

import { atLeast } from "../model";
import { attr, descendants } from "../xml-tree";
import { checkUrl, hit, macrosIn, SKIPOFFSET_RE, vast, type Rule } from "./kit";

/**
 * The `event` values each version defines for <Tracking>. A player silently
 * ignores an event it does not recognise, which is the worst possible failure
 * mode: the tag looks fine and the metric is simply never reported.
 */
/** The VAST 2.0.1 XSD enumeration, exactly. */
const EVENTS_2_0 = [
  "creativeView",
  "start",
  "midpoint",
  "firstQuartile",
  "thirdQuartile",
  "complete",
  "mute",
  "unmute",
  "pause",
  "rewind",
  "resume",
  "fullscreen",
  "expand",
  "collapse",
  "acceptInvitation",
  "close",
];

/** The VAST 3 XSD enumeration, exactly. */
const EVENTS_3_0 = [
  ...EVENTS_2_0,
  "exitFullscreen",
  "skip",
  "progress",
  "closeLinear",
  "acceptInvitationLinear",
];

/**
 * VAST 4.x. `otherAdInteraction` is 4.x, not 3.0 — listing it under 3.0 turned
 * a real finding into a false negative. `interactiveStart` was added by the 4.2
 * XSD and is precisely the event a SIMID creative fires, so its absence here
 * warned on a conformant tag in this product's own domain.
 */
const EVENTS_4_X = [
  ...EVENTS_3_0,
  "otherAdInteraction",
  "loaded",
  "interactiveStart",
  "playerExpand",
  "playerCollapse",
  "adExpand",
  "adCollapse",
  "minimize",
  "overlayViewDuration",
  "verificationNotExecuted",
];

function allowedEvents(version: string | undefined): string[] {
  if (!version) return EVENTS_4_X;
  if (version === "2.0") return EVENTS_2_0;
  if (version === "3.0") return EVENTS_3_0;
  return EVENTS_4_X;
}

/**
 * Every element whose text content is a URL a player will ping.
 *
 * VerificationParameters is deliberately absent: its content is vendor
 * configuration, usually JSON, and putting it here would have these rules
 * judging it as a malformed URL.
 */
const TRACKER_ELEMENTS = [
  "Impression",
  "Tracking",
  "ClickTracking",
  "CustomClick",
  "Error",
  "Viewable",
  "NotViewable",
  "ViewUndetermined",
  "CompanionClickTracking",
  "NonLinearClickTracking",
  "IconViewTracking",
  "IconClickTracking",
];

export const trackingRules: Rule[] = [
  {
    id: "VAST-tracking-event-known",
    group: "tracking",
    severity: "warning",
    spec: vast("§3.13.2 TrackingEvents"),
    check: (ctx) => {
      const allowed = allowedEvents(ctx.declared);
      return descendants(ctx.root, "Tracking")
        .filter((node) => {
          const event = attr(node, "event")?.trim();
          return event !== undefined && event !== "" && !allowed.includes(event);
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "Значение атрибута event не определено спецификацией этой версии.",
              en: "The event attribute value is not defined by this version's specification.",
            },
            {
              ru: "Плеер молча пропускает неизвестное событие — тег выглядит рабочим, а метрика просто никогда не приходит. Проверьте написание (события чувствительны к регистру) либо поднимите версию VAST.",
              en: "A player silently skips an event it does not know: the tag looks healthy and the metric simply never arrives. Check the spelling — event names are case-sensitive — or declare a later VAST version.",
            },
            attr(node, "event"),
          ),
        );
    },
  },
  {
    id: "VAST-tracking-event-missing",
    group: "tracking",
    severity: "error",
    spec: vast("§3.13.2 Tracking@event"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Tracking")
        .filter((node) => !attr(node, "event")?.trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У элемента Tracking нет атрибута event.",
              en: "The Tracking element has no event attribute.",
            },
            {
              ru: "event обязателен — он говорит, в какой момент дёрнуть URL. Без него пиксель не сработает никогда.",
              en: "event is required — it says when the URL should fire. Without it the pixel never fires at all.",
            },
          ),
        ),
  },
  {
    id: "VAST-tracker-url-valid",
    group: "tracking",
    severity: "error",
    spec: vast("§2.3.4 Tracking URIs"),
    iabErrorCode: 101,
    check: (ctx) =>
      TRACKER_ELEMENTS.flatMap((name) => descendants(ctx.root, name))
        .filter((node) => node.text.trim() && !checkUrl(node.text).ok)
        .map((node) =>
          hit(
            node,
            {
              ru: "Трекинговый URL некорректен.",
              en: "The tracking URL is not valid.",
            },
            {
              ru: "Адрес должен быть абсолютным http(s). Частая причина — незакодированный пробел или перенос строки внутри URL: XML их сохраняет, а плеер на них спотыкается.",
              en: "The address must be an absolute http(s) URL. A common cause is an unencoded space or newline inside it: XML preserves them and the player trips over them.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "VAST-tracker-https",
    group: "tracking",
    severity: "warning",
    spec: vast("§2.3.4 Tracking URIs"),
    check: (ctx) => {
      const offenders = TRACKER_ELEMENTS.flatMap((name) => descendants(ctx.root, name)).filter(
        (node) => {
          const verdict = checkUrl(node.text);
          return verdict.ok && verdict.url?.protocol === "http:";
        },
      );
      if (offenders.length === 0) return [];
      // One hit for the lot: twenty identical rows about http would bury
      // everything else in the report.
      return [
        {
          path: offenders[0].path,
          line: offenders[0].line,
          message: {
            ru: "Часть трекинговых URL использует http вместо https.",
            en: "Some tracking URLs use http rather than https.",
          },
          hint: {
            ru: "Страница-издатель почти всегда работает по https, и браузер блокирует http-запросы с неё как mixed content. Эти пиксели не сработают — показы будут недосчитаны.",
            en: "A publisher page is almost always https, and the browser blocks http requests from it as mixed content. These pixels will not fire and the impressions go uncounted.",
          },
          offending: `${offenders.length} URL · ${offenders[0].text.trim().slice(0, 120)}`,
        },
      ];
    },
  },
  {
    id: "VAST-error-element-present",
    group: "tracking",
    severity: "warning",
    spec: vast("§3.5 Error"),
    check: (ctx) => {
      if (descendants(ctx.root, "Error").length > 0) return [];
      if (descendants(ctx.root, "Ad").length === 0) return [];
      return [
        hit(
          ctx.root,
          {
            ru: "В документе нет элемента Error.",
            en: "The document has no Error element.",
          },
          {
            ru: "Без Error плеер не может сообщить о сбое, и причина падения показа останется неизвестной. Добавьте <Error> с макросом [ERRORCODE] — это самый дешёвый способ получить диагностику из продакшена.",
            en: "Without Error a player has no way to report a failure, and the reason an impression died stays unknown. Add an <Error> carrying the [ERRORCODE] macro — it is the cheapest production diagnostics available.",
          },
        ),
      ];
    },
  },
  {
    id: "VAST-error-macro",
    group: "tracking",
    severity: "warning",
    spec: vast("§2.3.6 Error Codes"),
    appliesTo: (ctx) => atLeast(ctx.declared, "3.0") || ctx.declared === undefined,
    check: (ctx) =>
      descendants(ctx.root, "Error")
        .filter((node) => node.text.trim() && !macrosIn(node.text).includes("ERRORCODE"))
        .map((node) =>
          hit(
            node,
            {
              ru: "URL ошибки не содержит макроса [ERRORCODE].",
              en: "The error URL does not carry the [ERRORCODE] macro.",
            },
            {
              ru: "Плеер подставляет в [ERRORCODE] номер ошибки. Без макроса вы узнаете только сам факт сбоя, но не его причину — а это разница между «что-то сломалось» и «код 403, плеер не поддерживает MIME-тип».",
              en: "The player substitutes the numeric code into [ERRORCODE]. Without the macro you learn only that something failed, not what — the difference between “it broke” and “code 403, the player cannot play this MIME type”.",
            },
            node.text.trim().slice(0, 160),
          ),
        ),
  },
  {
    id: "VAST-clickthrough-valid",
    group: "tracking",
    severity: "error",
    spec: vast("§3.13.4 ClickThrough"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "ClickThrough")
        .filter((node) => node.text.trim() && !checkUrl(node.text).ok)
        .map((node) =>
          hit(
            node,
            {
              ru: "URL перехода по клику некорректен.",
              en: "The click-through URL is not valid.",
            },
            {
              ru: "ClickThrough — это то, куда попадёт пользователь. Битый адрес означает оплаченный клик в никуда.",
              en: "ClickThrough is where the user lands. A broken address means a paid click that goes nowhere.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "VAST-progress-offset",
    group: "tracking",
    severity: "error",
    spec: vast("§3.13.2 Tracking@offset"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Tracking")
        .filter((node) => (attr(node, "event") ?? "").trim() === "progress")
        .filter((node) => {
          const offset = attr(node, "offset")?.trim();
          if (!offset) return true;
          // The shared constant, not a second copy of the same regex — two
          // spellings of one rule are two rules waiting to disagree.
          return !SKIPOFFSET_RE.test(offset);
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "У события progress отсутствует или некорректен атрибут offset.",
              en: "The progress event has a missing or malformed offset attribute.",
            },
            {
              ru: "progress без offset бессмыслен — плеер не знает, в какой момент срабатывать. Формат: HH:MM:SS(.mmm) или процент.",
              en: "A progress event without an offset is meaningless — the player does not know when to fire it. The format is HH:MM:SS(.mmm) or a percentage.",
            },
            attr(node, "offset") ?? "—",
          ),
        ),
  },
];

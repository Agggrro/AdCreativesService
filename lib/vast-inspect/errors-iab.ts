import type { Msg } from "./model";

/**
 * The IAB VAST error codes, as a lookup table.
 *
 * Two jobs. First, a finding that corresponds to a real error code carries it,
 * so the report speaks the same language as the DSP dashboard the user will
 * argue with tomorrow. Second, when the player reports a numeric error at
 * runtime, the timeline can name it instead of printing a bare integer — the
 * Google IMA SDK hands back exactly these codes.
 *
 * Source: VAST 4.2 §2.3.6 "Error Codes" and the VAST Error Code Troubleshooting
 * Matrix. Codes absent from the table (a vendor inventing 1005, say) are
 * rendered as unknown rather than guessed at.
 */

export interface IabError {
  code: number;
  label: Msg;
  cause: Msg;
}

export const IAB_ERRORS: readonly IabError[] = [
  {
    code: 100,
    label: { ru: "Ошибка разбора XML", en: "XML parsing error" },
    cause: {
      ru: "Документ не является корректным XML: незакрытый тег, лишний символ или оборванный ответ.",
      en: "The document is not well-formed XML: an unclosed tag, a stray character, or a truncated response.",
    },
  },
  {
    code: 101,
    label: { ru: "Ошибка валидации схемы", en: "VAST schema validation error" },
    cause: {
      ru: "Отсутствует обязательный элемент или атрибут, либо присутствует элемент, которого спецификация не знает.",
      en: "A required element or attribute is missing, or an element the specification does not define is present.",
    },
  },
  {
    code: 102,
    label: { ru: "Версия VAST не поддерживается", en: "VAST version not supported" },
    cause: {
      ru: "Плеер не умеет работать с версией, объявленной в атрибуте version корневого элемента.",
      en: "The player cannot handle the version declared in the root element's version attribute.",
    },
  },
  {
    code: 200,
    label: { ru: "Неожиданный тип объявления", en: "Unexpected ad type" },
    cause: {
      ru: "Плеер запрашивал другой тип рекламы, чем вернул сервер.",
      en: "The player expected a different ad type from the one the server returned.",
    },
  },
  {
    code: 201,
    label: { ru: "Неожиданная линейность", en: "Unexpected linearity" },
    cause: {
      ru: "Запрашивался linear, а получен non-linear (или наоборот).",
      en: "A linear ad was requested and a non-linear one returned, or the reverse.",
    },
  },
  {
    code: 202,
    label: { ru: "Неожиданная длительность", en: "Unexpected duration" },
    cause: {
      ru: "Длительность креатива не укладывается в допустимый для слота диапазон.",
      en: "The creative's duration falls outside the range the slot allows.",
    },
  },
  {
    code: 203,
    label: { ru: "Неожиданный размер", en: "Unexpected size" },
    cause: {
      ru: "Ни один MediaFile не подходит под размеры или возможности устройства.",
      en: "No MediaFile matches the device's dimensions or capabilities.",
    },
  },
  {
    code: 204,
    label: { ru: "Не указана категория объявления", en: "Ad category not provided" },
    cause: {
      ru: "Площадка требует <Category>, но в ответе его нет.",
      en: "The publisher requires a <Category> and the response has none.",
    },
  },
  {
    code: 205,
    label: {
      ru: "Категория запрещена обёрткой",
      en: "Category violates the wrapper's blocked list",
    },
    cause: {
      ru: "Категория InLine-объявления попадает в BlockedAdCategories вышестоящей обёртки.",
      en: "The InLine ad's category appears in an upstream wrapper's BlockedAdCategories.",
    },
  },
  {
    code: 206,
    label: { ru: "Рекламный блок сокращён", en: "Ad break shortened" },
    cause: {
      ru: "Блок сократился, и объявление показано не было.",
      en: "The ad break was shortened and the ad was not served.",
    },
  },
  {
    code: 300,
    label: { ru: "Общая ошибка Wrapper", en: "General Wrapper error" },
    cause: {
      ru: "Обёртка не разрешилась в InLine — таймаут, недоступный VASTAdTagURI или битый ответ.",
      en: "The wrapper never resolved to an InLine: a timeout, an unreachable VASTAdTagURI, or a broken response.",
    },
  },
  {
    code: 301,
    label: { ru: "Таймаут редиректа", en: "Wrapper redirect timeout" },
    cause: {
      ru: "VASTAdTagURI не ответил за отведённое плеером время.",
      en: "The VASTAdTagURI did not respond within the player's timeout.",
    },
  },
  {
    code: 302,
    label: { ru: "Достигнут лимит обёрток", en: "Wrapper limit reached" },
    cause: {
      ru: "Цепочка обёрток длиннее, чем готов пройти плеер, либо содержит цикл.",
      en: "The wrapper chain is longer than the player will follow, or it contains a loop.",
    },
  },
  {
    code: 303,
    label: { ru: "Пустой ответ после обёрток", en: "No ads after wrapper" },
    cause: {
      ru: "Цепочка разрешилась в VAST без единого Ad — нет филла.",
      en: "The chain resolved to a VAST document with no Ad element — no fill.",
    },
  },
  {
    code: 304,
    label: {
      ru: "InLine не уложился в отведённое время",
      en: "InLine ad did not display within the time limit",
    },
    cause: {
      ru: "Цепочка разрешилась в InLine, но объявление не отрисовалось за отведённый плеером срок.",
      en: "The chain resolved to an InLine but the ad did not render within the player's time limit.",
    },
  },
  {
    code: 400,
    label: { ru: "Общая ошибка Linear", en: "General Linear error" },
    cause: {
      ru: "Плеер не смог показать линейный креатив.",
      en: "The player could not display the linear creative.",
    },
  },
  {
    code: 401,
    label: { ru: "MediaFile не найден", en: "MediaFile not found" },
    cause: {
      ru: "URL медиафайла не отдал файл.",
      en: "The MediaFile URI did not return a file.",
    },
  },
  {
    code: 402,
    label: { ru: "Не удалось загрузить MediaFile", en: "MediaFile download timeout" },
    cause: {
      ru: "Загрузка медиафайла не уложилась в таймаут плеера.",
      en: "The media file did not download within the player's timeout.",
    },
  },
  {
    code: 403,
    label: { ru: "MIME-типы не поддерживаются", en: "Unsupported MIME types" },
    cause: {
      ru: "Ни один MediaFile не имеет типа, который плеер умеет воспроизводить.",
      en: "No MediaFile carries a type the player is able to play.",
    },
  },
  {
    code: 405,
    label: { ru: "Ошибка отображения MediaFile", en: "MediaFile display error" },
    cause: {
      ru: "Файл получен, но не проигрался: несовпадение MIME с содержимым, CORS или кодек.",
      en: "The file arrived but would not play: a MIME/content mismatch, CORS, or an unsupported codec.",
    },
  },
  {
    code: 406,
    label: { ru: "Отсутствует Mezzanine", en: "Missing mezzanine file" },
    cause: {
      ru: "Для server-side вставки требуется Mezzanine, но его нет в ответе.",
      en: "Server-side insertion requires a Mezzanine and the response has none.",
    },
  },
  {
    code: 407,
    label: { ru: "Mezzanine ещё транскодируется", en: "Mezzanine being processed" },
    cause: {
      ru: "Файл скачан впервые и ещё обрабатывается. Не дефект — ожидаемое поведение при первом показе.",
      en: "The file was downloaded for the first time and is still being processed. Expected on first serve, not a defect.",
    },
  },
  {
    code: 408,
    label: { ru: "Объявление отклонено", en: "Ad rejected" },
    cause: {
      ru: "Креатив вернулся, но был отклонён принимающей стороной.",
      en: "The creative was returned but rejected by the receiving system.",
    },
  },
  {
    code: 409,
    label: {
      ru: "Интерактивный креатив не запустился",
      en: "Interactive creative did not execute",
    },
    cause: {
      ru: "InteractiveCreativeFile (SIMID) не загрузился или не прошёл handshake.",
      en: "The InteractiveCreativeFile (SIMID) failed to load or never completed its handshake.",
    },
  },
  {
    code: 410,
    label: { ru: "Код верификации не выполнился", en: "Verification code did not execute" },
    cause: {
      ru: "Скрипт из AdVerifications не загрузился или упал.",
      en: "The script referenced by AdVerifications failed to load or threw.",
    },
  },
  {
    code: 411,
    label: {
      ru: "Mezzanine не соответствует требованиям",
      en: "Mezzanine does not meet the required specification",
    },
    cause: {
      ru: "Mezzanine предоставлен, но файл не отвечает требованиям к исходнику — не путать с 406, где его нет вовсе.",
      en: "A Mezzanine was provided but the file does not meet the required source specification — distinct from 406, where none was provided at all.",
    },
  },
  {
    code: 500,
    label: { ru: "Общая ошибка NonLinearAds", en: "General NonLinearAds error" },
    cause: {
      ru: "Плеер не смог показать нелинейный креатив.",
      en: "The player could not display the non-linear creative.",
    },
  },
  {
    code: 501,
    label: { ru: "Размер NonLinear не подходит", en: "NonLinear dimensions mismatch" },
    cause: {
      ru: "Креатив больше отведённой области показа.",
      en: "The creative is larger than the area available to display it.",
    },
  },
  {
    code: 502,
    label: { ru: "Ресурс NonLinear недоступен", en: "Cannot fetch NonLinearAds resource" },
    cause: {
      ru: "URL нелинейного ресурса не отдал файл.",
      en: "The non-linear resource URI returned nothing usable.",
    },
  },
  {
    code: 503,
    label: { ru: "Тип ресурса NonLinear не поддержан", en: "Unsupported NonLinear resource" },
    cause: {
      ru: "Плеер не умеет работать с этим типом нелинейного ресурса.",
      en: "The player does not support this non-linear resource type.",
    },
  },
  {
    code: 600,
    label: { ru: "Общая ошибка CompanionAds", en: "General CompanionAds error" },
    cause: {
      ru: "Плеер не смог показать сопутствующий баннер.",
      en: "The player could not display the companion ad.",
    },
  },
  {
    code: 601,
    label: { ru: "Размер Companion не подходит", en: "Companion dimensions mismatch" },
    cause: {
      ru: "Баннер не помещается в отведённое место.",
      en: "The companion does not fit the space available.",
    },
  },
  {
    code: 602,
    label: { ru: "Обязательный Companion не показан", en: "Required companion not displayed" },
    cause: {
      ru: "Companion помечен как required, но плеер не смог его отрисовать.",
      en: "The companion is marked required and the player could not render it.",
    },
  },
  {
    code: 603,
    label: { ru: "Ресурс Companion недоступен", en: "Cannot fetch CompanionAds resource" },
    cause: {
      ru: "URL баннера не отдал файл.",
      en: "The companion resource URI returned nothing usable.",
    },
  },
  {
    code: 604,
    label: { ru: "Тип ресурса Companion не поддержан", en: "Unsupported companion resource" },
    cause: {
      ru: "Плеер не умеет работать с этим типом сопутствующего ресурса.",
      en: "The player does not support this companion resource type.",
    },
  },
  {
    code: 900,
    label: { ru: "Неопределённая ошибка", en: "Undefined error" },
    cause: {
      ru: "Ошибка, которую плеер не смог отнести ни к одной категории.",
      en: "An error the player could not place in any category.",
    },
  },
  {
    code: 901,
    label: { ru: "Общая ошибка VPAID", en: "General VPAID error" },
    cause: {
      ru: "VPAID-юнит не инициализировался, не прошёл handshake или упал во время выполнения.",
      en: "The VPAID unit failed to initialise, never completed its handshake, or threw at runtime.",
    },
  },
  {
    // Added by VAST 4.3 alongside SIMID support — the code a player reports for
    // the interactive failures this engine is built around.
    code: 902,
    label: {
      ru: "Общая ошибка InteractiveCreativeFile",
      en: "General InteractiveCreativeFile error",
    },
    cause: {
      ru: "Интерактивный документ (обычно SIMID) не загрузился, не прошёл handshake или упал.",
      en: "The interactive document — usually SIMID — failed to load, never completed its handshake, or threw.",
    },
  },
] as const;

const BY_CODE = new Map<number, IabError>(IAB_ERRORS.map((entry) => [entry.code, entry]));

export function lookupIabError(code: number): IabError | undefined {
  return BY_CODE.get(code);
}

/**
 * A one-line human rendering of a numeric code, for the event timeline.
 * Unknown codes are reported honestly rather than mapped to the nearest guess.
 */
export function describeIabError(code: number, locale: "ru" | "en"): string {
  const entry = BY_CODE.get(code);
  if (!entry) {
    return locale === "ru" ? `Код ${code} — вне спецификации` : `Code ${code} — outside the specification`;
  }
  return `${code} · ${entry.label[locale]}`;
}

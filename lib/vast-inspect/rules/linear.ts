import { atLeast } from "../model";
import { all, attr, descendants, first } from "../xml-tree";
import {
  checkUrl,
  DURATION_RE,
  hit,
  isInsideWrapper,
  mimeEquivalent,
  mimeFromUrl,
  SKIPOFFSET_RE,
  vast,
  type Rule,
} from "./kit";

/** Linear creatives: duration, media files, and the attributes players branch on. */
export const linearRules: Rule[] = [
  {
    id: "VAST-linear-duration-present",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.1 Duration"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Linear")
        // A Wrapper's Linear legitimately carries only tracking, no Duration.
        .filter((linear) => !isInsideWrapper(linear))
        .filter((linear) => !first(linear, "Duration")?.text.trim())
        .map((linear) =>
          hit(
            linear,
            {
              ru: "У линейного креатива нет элемента Duration.",
              en: "The linear creative has no Duration element.",
            },
            {
              ru: "Duration обязателен для InLine-креатива: по нему плеер планирует рекламный блок и рассчитывает квартили. Без него объявление отклоняется.",
              en: "Duration is required on an InLine creative: the player schedules the break and computes quartiles from it. Without it the ad is rejected.",
            },
          ),
        ),
  },
  {
    id: "VAST-linear-duration-format",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.1 Duration"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Duration")
        .filter((node) => node.text.trim() && !DURATION_RE.test(node.text.trim()))
        .map((node) =>
          hit(
            node,
            {
              ru: "Формат Duration не соответствует спецификации.",
              en: "The Duration format does not match the specification.",
            },
            {
              ru: "Допустим только формат HH:MM:SS или HH:MM:SS.mmm — например 00:00:30. Число секунд, ISO 8601 (PT30S) и MM:SS плеерами не принимаются.",
              en: "Only HH:MM:SS or HH:MM:SS.mmm is accepted — for example 00:00:30. A bare number of seconds, ISO 8601 (PT30S), and MM:SS are all rejected by players.",
            },
            node.text.trim(),
          ),
        ),
  },
  {
    id: "VAST-linear-mediafiles-present",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.3 MediaFiles"),
    iabErrorCode: 403,
    check: (ctx) =>
      descendants(ctx.root, "Linear")
        .filter((linear) => !isInsideWrapper(linear))
        .filter((linear) => {
          const container = first(linear, "MediaFiles");
          const media = all(container, "MediaFile").filter((node) => node.text.trim());
          const interactive = all(container, "InteractiveCreativeFile").filter((node) => node.text.trim());
          return media.length === 0 && interactive.length === 0;
        })
        .map((linear) =>
          hit(
            linear,
            {
              ru: "У линейного креатива нет ни одного MediaFile.",
              en: "The linear creative has no MediaFile.",
            },
            {
              ru: "Нужен хотя бы один MediaFile с абсолютным URL. Плеер, которому нечего проиграть, вернёт ошибку 403 — «неподдерживаемые MIME-типы».",
              en: "At least one MediaFile with an absolute URL is required. A player with nothing to play reports error 403 — unsupported MIME types.",
            },
          ),
        ),
  },
  {
    id: "VAST-mediafile-required-attributes",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.3 MediaFile"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "MediaFile").flatMap((node) => {
        const missing = (["delivery", "type", "width", "height"] as const).filter(
          (name) => !attr(node, name)?.trim(),
        );
        if (missing.length === 0) return [];
        return [
          hit(
            node,
            {
              ru: "У MediaFile отсутствуют обязательные атрибуты.",
              en: "The MediaFile is missing required attributes.",
            },
            {
              ru: "delivery, type, width и height обязательны. По ним плеер выбирает файл под устройство и полосу пропускания; без них выбор становится угадыванием.",
              en: "delivery, type, width and height are all required. A player selects a file for the device and bandwidth from them; without them the choice becomes guesswork.",
            },
            missing.join(", "),
          ),
        ];
      }),
  },
  {
    id: "VAST-mediafile-delivery-value",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.3 MediaFile@delivery"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "MediaFile")
        .filter((node) => {
          const value = attr(node, "delivery")?.trim().toLowerCase();
          return value !== undefined && value !== "" && value !== "progressive" && value !== "streaming";
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "Атрибут delivery имеет недопустимое значение.",
              en: "The delivery attribute has a value outside the allowed set.",
            },
            {
              ru: "Допустимы только progressive и streaming. Progressive — обычный файл по HTTP, streaming — адаптивный поток (HLS, DASH).",
              en: "Only progressive and streaming are allowed. Progressive is a plain HTTP file; streaming is an adaptive manifest (HLS, DASH).",
            },
            attr(node, "delivery"),
          ),
        ),
  },
  {
    id: "VAST-mediafile-url-valid",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.3 MediaFile"),
    iabErrorCode: 401,
    check: (ctx) =>
      descendants(ctx.root, "MediaFile")
        .filter((node) => node.text.trim() && !checkUrl(node.text).ok)
        .map((node) =>
          hit(
            node,
            {
              ru: "URL медиафайла некорректен.",
              en: "The media file URL is not valid.",
            },
            {
              ru: "Адрес должен быть абсолютным и начинаться с http:// или https://. Плеер, не сумевший разобрать URL, вернёт ошибку 401.",
              en: "The address must be absolute and begin with http:// or https://. A player that cannot parse the URL reports error 401.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "VAST-mediafile-type-matches-extension",
    group: "linear",
    severity: "warning",
    spec: vast("§3.13.3 MediaFile@type"),
    iabErrorCode: 405,
    check: (ctx) =>
      descendants(ctx.root, "MediaFile").flatMap((node) => {
        const declared = attr(node, "type")?.trim();
        const implied = mimeFromUrl(node.text);
        if (!declared || !implied || mimeEquivalent(declared, implied)) return [];
        return [
          hit(
            node,
            {
              ru: "Объявленный MIME-тип не совпадает с расширением файла в URL.",
              en: "The declared MIME type does not match the file extension in the URL.",
            },
            {
              ru: "Плеер выбирает файл по атрибуту type, а декодирует по фактическому содержимому. Расхождение приводит к ошибке 405 уже после того, как показ засчитан.",
              en: "A player selects the file by its type attribute and decodes the actual bytes. A mismatch produces error 405 after the impression has already been counted.",
            },
            `type="${declared}" · URL → ${implied}`,
          ),
        ];
      }),
  },
  {
    id: "VAST-mediafile-bitrate",
    group: "linear",
    severity: "advisory",
    spec: vast("§3.13.3 MediaFile@bitrate"),
    check: (ctx) =>
      descendants(ctx.root, "MediaFile")
        .filter((node) => (attr(node, "type") ?? "").toLowerCase().startsWith("video/"))
        .filter(
          (node) =>
            !attr(node, "bitrate")?.trim() &&
            !(attr(node, "minBitrate")?.trim() && attr(node, "maxBitrate")?.trim()),
        )
        .map((node) =>
          hit(
            node,
            {
              ru: "У MediaFile не указан битрейт.",
              en: "The MediaFile declares no bitrate.",
            },
            {
              ru: "Укажите bitrate либо пару minBitrate/maxBitrate. Без них плеер на медленном соединении не может выбрать более лёгкий файл и берёт первый подходящий по размеру.",
              en: "Provide bitrate, or the minBitrate/maxBitrate pair. Without them a player on a slow connection cannot pick a lighter file and simply takes the first one that fits by size.",
            },
          ),
        ),
  },
  {
    id: "VAST-linear-skipoffset-format",
    group: "linear",
    severity: "error",
    spec: vast("§3.13 Linear@skipoffset"),
    iabErrorCode: 101,
    appliesTo: (ctx) => atLeast(ctx.declared, "3.0") || ctx.declared === undefined,
    check: (ctx) =>
      descendants(ctx.root, "Linear")
        .filter((linear) => {
          const value = attr(linear, "skipoffset");
          return value !== undefined && value.trim() !== "" && !SKIPOFFSET_RE.test(value.trim());
        })
        .map((linear) =>
          hit(
            linear,
            {
              ru: "Формат skipoffset не соответствует спецификации.",
              en: "The skipoffset format does not match the specification.",
            },
            {
              ru: "Допустимы только временная метка HH:MM:SS(.mmm) и процент вида 25%. При нераспознанном значении плеер обычно показывает ролик как непропускаемый.",
              en: "Only an HH:MM:SS(.mmm) timestamp or a percentage such as 25% is accepted. On an unrecognised value a player usually renders the ad as non-skippable.",
            },
            attr(linear, "skipoffset"),
          ),
        ),
  },
  {
    id: "VAST-skipoffset-before-3",
    group: "linear",
    severity: "warning",
    spec: vast("§3.13 Linear@skipoffset"),
    appliesTo: (ctx) => ctx.declared === "2.0",
    check: (ctx) =>
      descendants(ctx.root, "Linear")
        .filter((linear) => attr(linear, "skipoffset") !== undefined)
        .map((linear) =>
          hit(
            linear,
            {
              ru: "skipoffset используется в документе, объявленном как VAST 2.0.",
              en: "skipoffset is used in a document declared as VAST 2.0.",
            },
            {
              ru: "Пропуск рекламы появился в VAST 3.0. Плеер, читающий документ как 2.0, атрибут проигнорирует и покажет ролик целиком. Поднимите версию до 3.0 или выше.",
              en: "Skippability arrived in VAST 3.0. A player reading the document as 2.0 ignores the attribute and plays the ad in full. Declare 3.0 or later.",
            },
            attr(linear, "skipoffset"),
          ),
        ),
  },
  {
    id: "VAST-mezzanine-url",
    group: "linear",
    severity: "error",
    spec: vast("§3.13.3 Mezzanine"),
    // 411, not 406: 406 is "required but not provided". This rule fires when the
    // element IS present and its file is unusable, which is 411's exact case.
    iabErrorCode: 411,
    check: (ctx) =>
      descendants(ctx.root, "Mezzanine")
        .filter((node) => !node.text.trim() || !checkUrl(node.text).ok)
        .map((node) =>
          hit(
            node,
            {
              ru: "Элемент Mezzanine присутствует, но не содержит корректного URL.",
              en: "The Mezzanine element is present but carries no valid URL.",
            },
            {
              ru: "Mezzanine — исходник высокого качества для серверного транскодирования. Пустой или битый элемент хуже отсутствующего: SSAI-система сообщит об ошибке 406 вместо того, чтобы просто обойтись без него.",
              en: "Mezzanine is the high-quality source for server-side transcoding. An empty or broken element is worse than none: an SSAI system reports error 406 instead of simply doing without.",
            },
            node.text.trim().slice(0, 160) || undefined,
          ),
        ),
  },
  {
    id: "VAST-nonlinear-dimensions",
    group: "linear",
    severity: "error",
    spec: vast("§3.14 NonLinear"),
    // 101, not 501: 501 is a display-area mismatch at render time, whereas a
    // missing required attribute is a schema fault.
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "NonLinear")
        .filter((node) => !attr(node, "width")?.trim() || !attr(node, "height")?.trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У NonLinear-креатива не указаны width и height.",
              en: "The NonLinear creative does not declare width and height.",
            },
            {
              ru: "Оба атрибута обязательны — плеер резервирует под оверлей место до его загрузки. Без размеров креатив либо не покажется, либо перекроет видео.",
              en: "Both attributes are required — the player reserves space for the overlay before it loads. Without dimensions the creative either does not render or covers the video.",
            },
          ),
        ),
  },
];

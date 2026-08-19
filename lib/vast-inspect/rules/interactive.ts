import { atLeast } from "../model";
import { all, attr, descendants, first } from "../xml-tree";
import {
  checkUrl,
  hit,
  isInsideWrapper,
  isPlayableVideoType,
  simid,
  vast,
  type Rule,
} from "./kit";

/**
 * VPAID and SIMID.
 *
 * This is the group the rest of the market treats as a footnote and this
 * product treats as the main subject (docs/adtech-standards.md). The two standards
 * fail in opposite ways: VPAID is over-permissive and slowly being withdrawn,
 * SIMID is strict and easy to mis-author in ways that surface only at runtime.
 */
export const interactiveRules: Rule[] = [
  {
    id: "VPAID-mediafile-type",
    group: "interactive",
    severity: "error",
    spec: vast("§3.13.3 MediaFile@type"),
    iabErrorCode: 901,
    check: (ctx) =>
      descendants(ctx.root, "MediaFile")
        .filter((node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid")
        .filter((node) => {
          const type = (attr(node, "type") ?? "").toLowerCase().split(";")[0].trim();
          return type !== "application/javascript" && type !== "application/x-javascript" && type !== "text/javascript";
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "MediaFile с apiFramework=\"VPAID\" объявляет неверный MIME-тип.",
              en: 'A MediaFile with apiFramework="VPAID" declares the wrong MIME type.',
            },
            {
              ru: "VPAID-юнит — это JavaScript, а не видео. Тип должен быть application/javascript. При video/mp4 плеер попытается декодировать скрипт как видео и вернёт ошибку 901.",
              en: "A VPAID unit is JavaScript, not video. The type must be application/javascript. Declared as video/mp4, the player tries to decode a script as video and reports error 901.",
            },
            attr(node, "type") ?? "—",
          ),
        ),
  },
  {
    id: "VPAID-adparameters",
    group: "interactive",
    severity: "warning",
    spec: vast("§3.13.5 AdParameters"),
    check: (ctx) =>
      descendants(ctx.root, "Linear")
        .filter((linear) => !isInsideWrapper(linear))
        .filter((linear) =>
          all(first(linear, "MediaFiles"), "MediaFile").some(
            (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid",
          ),
        )
        .filter((linear) => !first(linear, "AdParameters")?.text.trim())
        .map((linear) =>
          hit(
            linear,
            {
              ru: "У VPAID-креатива нет элемента AdParameters.",
              en: "The VPAID creative has no AdParameters element.",
            },
            {
              ru: "AdParameters — единственный канал, по которому конфигурация доходит до юнита при initAd. Без него юнит запустится с настройками по умолчанию, то есть, скорее всего, пустым.",
              en: "AdParameters is the only channel configuration reaches the unit through at initAd. Without it the unit starts on its defaults, which usually means empty.",
            },
          ),
        ),
  },
  {
    // Advisory, not a warning. <MediaFiles> is a list of candidates the
    // player picks from by capability, so a VPAID-only block is conformant —
    // VPAID 2.0’s own fallback story is exactly this list. The cost is real
    // (a player without VPAID renders nothing) but it is a reach decision, not
    // a spec violation, and an image-only unit has no video to fall back to.
    id: "VPAID-no-video-fallback",
    group: "interactive",
    severity: "advisory",
    spec: vast("§3.13.3 MediaFiles"),
    check: (ctx) =>
      descendants(ctx.root, "MediaFiles")
        .filter((container) => !isInsideWrapper(container))
        .filter((container) => {
          const files = all(container, "MediaFile");
          const hasVpaid = files.some((node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid");
          const hasVideo = files.some(
            (node) =>
              (attr(node, "apiFramework") ?? "").toLowerCase() !== "vpaid" &&
              isPlayableVideoType(attr(node, "type")),
          );
          return hasVpaid && !hasVideo;
        })
        .map((container) =>
          hit(
            container,
            {
              ru: "У VPAID-креатива нет обычного видеофайла как запасного варианта.",
              en: "The VPAID creative has no plain video file to fall back on.",
            },
            {
              ru: "Плеер без поддержки VPAID — а это весь CTV и часть мобильных — не покажет ничего. Добавьте рядом обычный MediaFile с видео: те, кто умеет VPAID, возьмут интерактив, остальные покажут ролик.",
              en: "A player without VPAID support — all of CTV and part of mobile — renders nothing. Add an ordinary video MediaFile alongside: players that support VPAID take the interactive one, the rest play the video.",
            },
          ),
        ),
  },
  {
    // The element is VAST 4.0, not 4.1 — vast4.xsd already declares
    // InteractiveCreativeFile inside MediaFiles, and separating the interactive
    // file from the media file was 4.0's headline change. What 4.1 added was
    // the variableDuration attribute, checked separately below.
    id: "InteractiveCreativeFile-requires-40",
    group: "interactive",
    severity: "error",
    spec: vast("§3.13.3 InteractiveCreativeFile"),
    iabErrorCode: 101,
    appliesTo: (ctx) => ctx.declared !== undefined && !atLeast(ctx.declared, "4.0"),
    check: (ctx) =>
      descendants(ctx.root, "InteractiveCreativeFile").map((node) =>
        hit(
          node,
          {
            ru: "InteractiveCreativeFile используется в версии VAST, которая его не определяет.",
            en: "InteractiveCreativeFile is used in a VAST version that does not define it.",
          },
          {
            ru: "Элемент появился в VAST 4.0. Плеер, читающий документ как более раннюю версию, его проигнорирует и покажет только базовое видео. Поднимите version до 4.0 или выше.",
            en: "The element arrived in VAST 4.0. A player reading the document as an earlier version ignores it and plays only the base video. Declare 4.0 or later.",
          },
          `version="${ctx.declaredRaw ?? "—"}"`,
        ),
      ),
  },
  {
    id: "InteractiveCreativeFile-apiframework",
    group: "interactive",
    severity: "warning",
    spec: vast("§3.13.3 InteractiveCreativeFile@apiFramework"),
    iabErrorCode: 902,
    check: (ctx) =>
      descendants(ctx.root, "InteractiveCreativeFile")
        // Only an entirely absent apiFramework is a fault. The element is
        // generic: apiFramework="VPAID" on it is the migration form the spec
        // itself prescribes for moving executable code out of <MediaFile>, so
        // demanding "SIMID" here would flag a conformant tag.
        .filter((node) => !(attr(node, "apiFramework") ?? "").trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У InteractiveCreativeFile не указан apiFramework.",
              en: "InteractiveCreativeFile does not declare an apiFramework.",
            },
            {
              ru: "Именно этот атрибут говорит плееру, по какому протоколу общаться с креативом — SIMID или VPAID. Без него документ загрузится в iframe, но handshake не начнётся, и интерактив не запустится.",
              en: "That attribute is what tells the player which protocol to speak to the creative — SIMID or VPAID. Without it the document loads into an iframe, the handshake never starts, and the interactive layer never runs.",
            },
          ),
        ),
  },
  {
    id: "SIMID-type",
    group: "interactive",
    severity: "error",
    spec: simid("§2.1 InteractiveCreativeFile@type"),
    iabErrorCode: 409,
    check: (ctx) =>
      descendants(ctx.root, "InteractiveCreativeFile")
        .filter((node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "simid")
        .filter((node) => (attr(node, "type") ?? "").toLowerCase().split(";")[0].trim() !== "text/html")
        .map((node) =>
          hit(
            node,
            {
              ru: "SIMID-креатив объявляет тип, отличный от text/html.",
              en: "The SIMID creative declares a type other than text/html.",
            },
            {
              ru: "SIMID — это HTML-документ, загружаемый в изолированный iframe. Тип должен быть text/html.",
              en: "A SIMID creative is an HTML document loaded into a sandboxed iframe. The type must be text/html.",
            },
            attr(node, "type") ?? "—",
          ),
        ),
  },
  {
    id: "SIMID-https",
    group: "interactive",
    severity: "error",
    spec: simid("§2.1 InteractiveCreativeFile"),
    iabErrorCode: 409,
    check: (ctx) =>
      descendants(ctx.root, "InteractiveCreativeFile")
        .filter((node) => node.text.trim())
        // VAST 4.3 explicitly permits an inline data: URI here — "an inline
        // data URI may be included such as when you want to place HTML directly
        // instead of a URL". It makes no network request, so mixed content
        // cannot arise and https is not a meaningful demand.
        .filter((node) => !(atLeast(ctx.declared, "4.3") && node.text.trim().startsWith("data:")))
        .filter((node) => {
          const verdict = checkUrl(node.text);
          return !verdict.ok || verdict.url?.protocol !== "https:";
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "URL SIMID-документа не использует https.",
              en: "The SIMID document URL is not https.",
            },
            {
              ru: "Интерактивный документ грузится в iframe на странице издателя, которая работает по https. Браузер заблокирует http-ресурс как mixed content, и креатив не откроется вовсе.",
              en: "The interactive document loads into an iframe on a publisher page served over https. The browser blocks an http resource as mixed content and the creative never opens.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "SIMID-variable-duration",
    group: "interactive",
    severity: "error",
    spec: simid("§2.1 variableDuration"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "InteractiveCreativeFile")
        .filter((node) => {
          const value = attr(node, "variableDuration");
          return value !== undefined && !["true", "false"].includes(value.trim().toLowerCase());
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "Атрибут variableDuration имеет значение вне допустимого набора.",
              en: "The variableDuration attribute has a value outside the allowed set.",
            },
            {
              ru: "Допустимы только true и false. Значение true означает, что креатив может продлить рекламный блок; плеер, который этого не умеет, обязан не показывать объявление вовсе — поэтому неоднозначность здесь дорого стоит.",
              en: "Only true and false are allowed. true means the creative may extend the ad break; a player that cannot support that must not render the ad at all — so ambiguity here is expensive.",
            },
            attr(node, "variableDuration"),
          ),
        ),
  },
  {
    id: "SIMID-base-video-required",
    group: "interactive",
    severity: "error",
    spec: simid("§2 VAST integration"),
    iabErrorCode: 403,
    check: (ctx) =>
      descendants(ctx.root, "MediaFiles")
        .filter((container) => !isInsideWrapper(container))
        .filter((container) => all(container, "InteractiveCreativeFile").length > 0)
        .filter(
          (container) =>
            !all(container, "MediaFile").some((node) =>
              isPlayableVideoType(attr(node, "type")),
            ),
        )
        .map((container) =>
          hit(
            container,
            {
              ru: "У SIMID-креатива нет базового видеофайла.",
              en: "The SIMID creative has no base video file.",
            },
            {
              ru: "SIMID устроен как слой поверх обычного видео: интерактив рисуется в iframe, а звук и картинка идут из MediaFile. Без базового видео плееру нечего проигрывать — ни с поддержкой SIMID, ни без неё.",
              en: "SIMID is a layer over ordinary video: the interactive part draws in an iframe while sound and picture come from a MediaFile. Without a base video the player has nothing to play, with or without SIMID support.",
            },
          ),
        ),
  },
  {
    id: "SIMID-and-VPAID-together",
    group: "interactive",
    severity: "warning",
    spec: simid("§2 VAST integration"),
    check: (ctx) =>
      descendants(ctx.root, "MediaFiles")
        .filter(
          (container) =>
            all(container, "InteractiveCreativeFile").some(
              (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "simid",
            ) &&
            all(container, "MediaFile").some(
              (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid",
            ),
        )
        .map((container) =>
          hit(
            container,
            {
              ru: "Креатив предлагает одновременно SIMID и VPAID.",
              en: "The creative offers both SIMID and VPAID.",
            },
            {
              ru: "Формально это допустимо и даёт максимальный охват, но выбор остаётся за плеером, и вы не знаете заранее, какой путь исполнится. Метрики двух стандартов не сходятся между собой — учитывайте это при сверке.",
              en: "This is formally allowed and maximises reach, but the choice is the player's and you cannot know in advance which path runs. The two standards' metrics do not reconcile with each other — account for that when comparing reports.",
            },
          ),
        ),
  },
];

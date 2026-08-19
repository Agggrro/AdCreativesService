import { atLeast } from "../model";
import { all, attr, descendants, first, type VNode } from "../xml-tree";
import { hit, isInsideWrapper, isPlayableVideoType, vast, vpaidNodes, type Rule } from "./kit";

/**
 * Advice a VPAID creative has already answered its own way (ADR-0020).
 *
 * Both predicates take the **creative's own subtree**, never `ctx.root`. An
 * earlier version gated these rules through `appliesTo`, which runs once per
 * document while both rules report once per `InLine` — so a single VPAID node
 * anywhere silenced the advice for every other ad in the response. A pod mixing
 * a VPAID ad with a plain linear one is the ordinary case that broke, and a
 * `<Wrapper>` merely mentioning VPAID was enough to trigger it.
 */

/**
 * ViewableImpression asks the *player* to measure viewability. A VPAID unit
 * measures its own and reports it over its own channel (ADR-0012), so the
 * element is answered for this creative however its media is authored.
 */
function measuresItsOwnViewability(inline: VNode): boolean {
  return vpaidNodes(inline).length > 0;
}

/**
 * Mezzanine is a high-quality source an SSAI platform transcodes its own
 * renditions from. A VPAID unit is executable JavaScript — but only a
 * VPAID-*only* creative has nothing to hand over. One that also carries a plain
 * video does, and the advice stands there, which is also what keeps a
 * SIMID-plus-VPAID document (guaranteed a base video by SIMID-base-video-required)
 * hearing it.
 */
function hasNoVideoToTranscode(creative: VNode): boolean {
  if (vpaidNodes(creative).length === 0) return false;
  return !descendants(creative, "MediaFile").some(
    (file) =>
      (attr(file, "apiFramework") ?? "").toLowerCase() !== "vpaid" &&
      isPlayableVideoType(attr(file, "type")),
  );
}

/**
 * The VAST 4.x elements that exist for programmatic buying, SSAI and CTV.
 *
 * None of these break playback when absent — which is exactly why they get left
 * out, and why the report has to argue for them in terms of what the omission
 * costs downstream rather than in terms of conformance.
 */
export const modernRules: Rule[] = [
  {
    id: "VAST-universal-ad-id-present",
    group: "modern",
    severity: "warning",
    spec: vast("§3.12.1 UniversalAdId"),
    appliesTo: (ctx) => atLeast(ctx.declared, "4.0"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .flatMap((inline) => all(first(inline, "Creatives"), "Creative"))
        .filter((creative) => !first(creative, "UniversalAdId"))
        .map((creative) =>
          hit(
            creative,
            {
              ru: "У креатива нет UniversalAdId.",
              en: "The creative has no UniversalAdId.",
            },
            {
              ru: "UniversalAdId — единственный идентификатор, одинаковый у одного ролика во всех системах. Без него частотное ограничение не работает между площадками: один и тот же ролик считается разными креативами, и пользователь видит его втрое чаще, чем вы запланировали.",
              en: "UniversalAdId is the only identifier that stays the same for one asset across every system. Without it frequency capping does not work across publishers: the same spot counts as different creatives and the viewer sees it three times as often as intended.",
            },
          ),
        ),
  },
  {
    id: "VAST-universal-ad-id-registry",
    group: "modern",
    severity: "error",
    spec: vast("§3.12.1 UniversalAdId@idRegistry"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "UniversalAdId")
        .filter((node) => !attr(node, "idRegistry")?.trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У UniversalAdId нет атрибута idRegistry.",
              en: "UniversalAdId has no idRegistry attribute.",
            },
            {
              ru: "Идентификатор без указания реестра ничего не значит: «12345» в Ad-ID и в Clearcast — разные ролики. idRegistry обязателен.",
              en: "An identifier without its registry means nothing: “12345” in Ad-ID and in Clearcast are different spots. idRegistry is required.",
            },
          ),
        ),
  },
  {
    id: "VAST-universal-ad-id-unknown",
    group: "modern",
    severity: "warning",
    spec: vast("§3.12.1 UniversalAdId"),
    check: (ctx) =>
      descendants(ctx.root, "UniversalAdId")
        // VAST 4.0 carried the value in an `idValue` attribute; 4.1 moved it to
        // element text and deprecated the attribute. Reading text alone made
        // every conformant 4.0 tag look like it had a placeholder.
        .map((node) => ({ node, value: (node.text.trim() || attr(node, "idValue") || "").trim() }))
        .filter(({ value }) => ["unknown", "", "-", "n/a"].includes(value.toLowerCase()))
        .map(({ node }) => node)
        .map((node) =>
          hit(
            node,
            {
              ru: "UniversalAdId присутствует, но значение — заглушка.",
              en: "UniversalAdId is present but its value is a placeholder.",
            },
            {
              ru: "\"unknown\" формально допустимо, но пользы не несёт: сквозная дедупликация по нему невозможна. Либо зарегистрируйте ролик в Ad-ID, Clearcast или другом реестре, либо не притворяйтесь, что идентификатор есть.",
              en: '"unknown" is formally allowed but useless: it cannot deduplicate anything. Either register the asset with Ad-ID, Clearcast or another registry, or stop pretending an identifier exists.',
            },
            node.text.trim() || "—",
          ),
        ),
  },
  {
    id: "VAST-category-authority",
    group: "modern",
    severity: "error",
    spec: vast("§3.7 Category@authority"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Category")
        .filter((node) => !attr(node, "authority")?.trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У Category нет атрибута authority.",
              en: "Category has no authority attribute.",
            },
            {
              ru: "authority указывает справочник категорий (например iabtechlab.com). Без него код категории невозможно истолковать, и площадка не сможет применить свои блокировки.",
              en: "authority names the taxonomy the code belongs to (iabtechlab.com, for instance). Without it the code cannot be interpreted and a publisher cannot apply its blocks.",
            },
          ),
        ),
  },
  {
    id: "VAST-pricing-attributes",
    group: "modern",
    severity: "error",
    spec: vast("§3.15 Pricing"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Pricing")
        .filter((node) => !attr(node, "model")?.trim() || !attr(node, "currency")?.trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У Pricing отсутствуют обязательные атрибуты model или currency.",
              en: "Pricing is missing the required model or currency attribute.",
            },
            {
              ru: "Число без модели закупки и валюты нечитаемо: 4.50 — это CPM в долларах или CPC в рублях? Оба атрибута обязательны.",
              en: "A number without its buying model and currency is unreadable: is 4.50 a CPM in dollars or a CPC in euros? Both attributes are required.",
            },
          ),
        ),
  },
  {
    id: "VAST-mezzanine-recommended",
    group: "modern",
    severity: "advisory",
    spec: vast("§3.13.3 Mezzanine"),
    appliesTo: (ctx) => atLeast(ctx.declared, "4.1"),
    check: (ctx) => {
      const linears = descendants(ctx.root, "Linear")
        .filter((linear) => !isInsideWrapper(linear))
        .filter((linear) => !hasNoVideoToTranscode(linear));
      if (linears.length === 0) return [];
      if (descendants(ctx.root, "Mezzanine").length > 0) return [];
      return [
        hit(
          linears[0],
          {
            ru: "В креативе нет элемента Mezzanine.",
            en: "The creative carries no Mezzanine element.",
          },
          {
            ru: "Mezzanine — исходник высокого качества, из которого SSAI-платформа сама транскодирует нужные варианты. Без него серверная вставка вынуждена перекодировать уже сжатый файл, и на больших экранах это видно.",
            en: "Mezzanine is the high-quality source an SSAI platform transcodes its own renditions from. Without it server-side insertion has to re-encode an already-compressed file, and on a large screen that shows.",
          },
        ),
      ];
    },
  },
  {
    id: "VAST-closed-captions",
    group: "modern",
    severity: "advisory",
    spec: vast("§3.13.3 ClosedCaptionFiles"),
    appliesTo: (ctx) => atLeast(ctx.declared, "4.1"),
    check: (ctx) => {
      const linears = descendants(ctx.root, "Linear").filter((linear) => !isInsideWrapper(linear));
      if (linears.length === 0 || descendants(ctx.root, "ClosedCaptionFiles").length > 0) return [];
      return [
        hit(
          linears[0],
          {
            ru: "У креатива нет субтитров (ClosedCaptionFiles).",
            en: "The creative has no closed captions (ClosedCaptionFiles).",
          },
          {
            ru: "Значительная часть видео в лентах смотрится без звука, а на ряде площадок субтитры — требование доступности. Добавьте дорожку в WebVTT или TTML.",
            en: "A large share of feed video is watched muted, and on some publishers captions are an accessibility requirement. Add a WebVTT or TTML track.",
          },
        ),
      ];
    },
  },
  {
    id: "VAST-viewable-impression",
    group: "modern",
    severity: "advisory",
    spec: vast("§3.17 ViewableImpression"),
    appliesTo: (ctx) => atLeast(ctx.declared, "4.0"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .filter((inline) => !measuresItsOwnViewability(inline))
        .filter((inline) => !first(inline, "ViewableImpression"))
        .map((inline) =>
          hit(
            inline,
            {
              ru: "Нет элемента ViewableImpression.",
              en: "No ViewableImpression element is present.",
            },
            {
              ru: "ViewableImpression отделяет «показ отдан» от «показ увиден» и содержит все три исхода — viewable, notViewable и viewUndetermined. Без третьего вы не отличите невидимый показ от неизмеренного.",
              en: "ViewableImpression separates “delivered” from “seen” and carries all three outcomes — viewable, notViewable and viewUndetermined. Without the third you cannot tell an unseen impression from an unmeasured one.",
            },
          ),
        ),
  },
];

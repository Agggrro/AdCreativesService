import { atLeast, VAST_VERSIONS } from "../model";
import { all, attr, first } from "../xml-tree";
import { hit, vast, type Rule } from "./kit";

/**
 * Document- and Ad-level structure: the checks that decide whether there is
 * anything worth validating further.
 */
export const documentRules: Rule[] = [
  {
    id: "VAST-root-element",
    group: "document",
    severity: "error",
    spec: vast("§3.1 VAST"),
    iabErrorCode: 101,
    check: (ctx) =>
      ctx.root.name === "VAST"
        ? []
        : [
            hit(
              ctx.root,
              {
                ru: "Корневой элемент документа не VAST.",
                en: "The document's root element is not VAST.",
              },
              {
                ru: "Ответ ad-сервера должен начинаться с элемента <VAST>. Часто здесь оказывается HTML-страница ошибки или JSON — проверьте, что запрашивается именно VAST-эндпоинт.",
                en: "An ad server response must start with a <VAST> element. An HTML error page or JSON body usually means the endpoint being requested is not the VAST one.",
              },
              ctx.root.name,
            ),
          ],
  },
  {
    id: "VAST-version-attribute",
    group: "document",
    severity: "error",
    spec: vast("§3.1 VAST@version"),
    iabErrorCode: 102,
    check: (ctx) => {
      if (ctx.root.name !== "VAST") return [];
      if (ctx.declaredRaw !== undefined && ctx.declaredRaw.trim() !== "") return [];
      return [
        hit(
          ctx.root,
          {
            ru: "У корневого элемента VAST нет атрибута version.",
            en: "The root VAST element has no version attribute.",
          },
          {
            ru: "Добавьте version — например <VAST version=\"4.2\">. Без него плеер не знает, по каким правилам разбирать документ, и вправе отклонить его с кодом 102.",
            en: 'Add the attribute, e.g. <VAST version="4.2">. Without it a player cannot know which rules to parse by and may reject the document with code 102.',
          },
        ),
      ];
    },
  },
  {
    id: "VAST-version-known",
    group: "document",
    severity: "error",
    spec: vast("§3.1 VAST@version"),
    iabErrorCode: 102,
    check: (ctx) => {
      if (ctx.root.name !== "VAST") return [];
      const raw = ctx.declaredRaw?.trim();
      if (!raw || ctx.declared) return [];
      return [
        hit(
          ctx.root,
          {
            ru: "Объявленная версия VAST не входит в число выпущенных спецификаций.",
            en: "The declared VAST version is not one of the published specifications.",
          },
          {
            ru: `Допустимые значения: ${VAST_VERSIONS.join(", ")}. Проверка ниже выполнена по правилам, общим для всех версий.`,
            en: `Valid values are ${VAST_VERSIONS.join(", ")}. The checks below were run using rules common to every version.`,
          },
          raw,
        ),
      ];
    },
  },
  {
    id: "VAST-has-ad",
    group: "document",
    severity: "warning",
    spec: vast("§3.2 Ad"),
    check: (ctx) => {
      if (ctx.root.name !== "VAST" || all(ctx.root, "Ad").length > 0) return [];
      return [
        hit(
          ctx.root,
          {
            ru: "Документ не содержит ни одного элемента Ad — это пустой ответ.",
            en: "The document contains no Ad element — this is an empty response.",
          },
          {
            ru: "Пустой VAST — валидный способ сказать «нет филла», и сам по себе дефектом не является. Но если вы ждали креатив, причина в таргетинге, бюджете или частотных ограничениях на стороне ad-сервера.",
            en: "An empty VAST is a legitimate way to say “no fill” and is not a defect in itself. If a creative was expected, the cause is targeting, budget, or frequency capping on the ad server.",
          },
          undefined,
          // 303 is specifically "no ads after one or more Wrappers". At hop 0
          // with no wrapper involved there is no code for this at all, and
          // attaching one anyway would send the reader chasing a wrapper
          // problem that does not exist.
          ctx.hop > 0 ? 303 : undefined,
        ),
      ];
    },
  },
  {
    id: "VAST-ad-inline-xor-wrapper",
    group: "ad",
    severity: "error",
    spec: vast("§3.2 Ad"),
    iabErrorCode: 101,
    check: (ctx) =>
      all(ctx.root, "Ad").flatMap((ad) => {
        const inline = first(ad, "InLine");
        const wrapper = first(ad, "Wrapper");
        if (inline && wrapper) {
          return [
            hit(
              ad,
              {
                ru: "Элемент Ad содержит одновременно InLine и Wrapper.",
                en: "The Ad element contains both InLine and Wrapper.",
              },
              {
                ru: "Ad должен содержать ровно одно из двух. Оставьте InLine, если креатив отдаётся здесь же, либо Wrapper, если это редирект на другой ad-сервер.",
                en: "An Ad must contain exactly one of the two. Keep InLine if the creative is served here, or Wrapper if this is a redirect to another ad server.",
              },
            ),
          ];
        }
        if (!inline && !wrapper) {
          return [
            hit(
              ad,
              {
                ru: "Элемент Ad не содержит ни InLine, ни Wrapper.",
                en: "The Ad element contains neither InLine nor Wrapper.",
              },
              {
                ru: "Пустой Ad плеер показать не может. Либо добавьте содержимое, либо уберите элемент — пустой VAST честнее пустого Ad.",
                en: "A player can do nothing with an empty Ad. Either add content or drop the element — an empty VAST is more honest than an empty Ad.",
              },
            ),
          ];
        }
        return [];
      }),
  },
  {
    id: "VAST-ad-id",
    group: "ad",
    severity: "advisory",
    spec: vast("§3.2 Ad@id"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .filter((ad) => !attr(ad, "id")?.trim())
        .map((ad) =>
          hit(
            ad,
            { ru: "У элемента Ad нет атрибута id.", en: "The Ad element has no id attribute." },
            {
              ru: "id не обязателен, но без него невозможно сопоставить строку в логе плеера с конкретным объявлением при разборе инцидента.",
              en: "id is optional, but without it a line in a player log cannot be matched to a specific ad when something goes wrong.",
            },
          ),
        ),
  },
  {
    id: "VAST-adserving-id-required",
    group: "ad",
    severity: "error",
    spec: vast("§3.4 AdServingId"),
    iabErrorCode: 101,
    appliesTo: (ctx) => atLeast(ctx.declared, "4.1"),
    check: (ctx) =>
      all(ctx.root, "Ad").flatMap((ad) => {
        // InLine only. The VAST 4.2 XSD declares AdServingId inside
        // Inline_type and nowhere else, and 4.3 §3.2 says so in prose: "only
        // <InLine> elements may provide an <AdServingId>". A wrapper reads the
        // value through the [ADSERVINGID] macro instead. Demanding it of
        // wrappers raised a spec error on every hop of every conformant
        // programmatic chain — the worst false positive this catalogue had.
        const body = first(ad, "InLine");
        if (!body) return [];
        const node = first(body, "AdServingId");
        if (node && node.text.trim()) return [];
        return [
          hit(
            node ?? body,
            {
              ru: "Начиная с VAST 4.1 элемент AdServingId обязателен и должен быть непустым.",
              en: "From VAST 4.1 the AdServingId element is required and must not be empty.",
            },
            {
              ru: "Добавьте <AdServingId> с уникальным на показ значением. Это единственный идентификатор, сквозной для всей цепочки обёрток, — по нему сверяют логи покупатель и продавец.",
              en: "Add an <AdServingId> carrying a value unique to the impression. It is the only identifier shared across the whole wrapper chain, and it is what buyer and seller reconcile logs on.",
            },
          ),
        ];
      }),
  },
  {
    id: "VAST-ad-pod-sequence",
    group: "ad",
    severity: "warning",
    spec: vast("§3.2 Ad@sequence"),
    check: (ctx) => {
      const ads = all(ctx.root, "Ad");
      const sequenced = ads.filter((ad) => attr(ad, "sequence") !== undefined);
      if (sequenced.length === 0) return [];

      // A response may legitimately carry a sequenced pod alongside stand-alone
      // ads, so a mix is not by itself a fault — only the contiguity of the
      // sequence numbers is.
      const hits = [];
      const values = sequenced
        .map((ad) => Number(attr(ad, "sequence")))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      const contiguous = values.every((value, index) => value === index + 1);
      if (values.length > 0 && !contiguous) {
        hits.push(
          hit(
            ctx.root,
            {
              ru: "Значения sequence в поде не образуют непрерывный ряд, начинающийся с 1.",
              en: "The pod's sequence values are not a contiguous run starting at 1.",
            },
            {
              ru: "Нумеруйте подряд: 1, 2, 3. При пропуске плеер может остановить под на разрыве и не показать остаток.",
              en: "Number them consecutively: 1, 2, 3. On a gap a player may stop the pod there and never show the remainder.",
            },
            values.join(", "),
          ),
        );
      }
      return hits;
    },
  },
];

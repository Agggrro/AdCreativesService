import { all, attr, first } from "../xml-tree";
import { checkUrl, hit, vast, type Rule } from "./kit";

/**
 * Wrapper rules.
 *
 * Chain-wide concerns — depth, cycles, latency — are not here: they need every
 * hop at once and are evaluated in chain.ts. What remains is what a single
 * wrapper document can be judged on in isolation.
 */
export const wrapperRules: Rule[] = [
  {
    id: "VAST-wrapper-vastadtaguri-present",
    group: "wrapper",
    severity: "error",
    spec: vast("§3.3 VASTAdTagURI"),
    iabErrorCode: 300,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "Wrapper"))
        .filter((wrapper): wrapper is NonNullable<typeof wrapper> => Boolean(wrapper))
        .filter((wrapper) => !first(wrapper, "VASTAdTagURI")?.text.trim())
        .map((wrapper) =>
          hit(
            wrapper,
            {
              ru: "У Wrapper нет непустого VASTAdTagURI.",
              en: "The Wrapper has no non-empty VASTAdTagURI.",
            },
            {
              ru: "Обёртка без VASTAdTagURI никуда не ведёт — цепочка обрывается, и плеер сообщает об ошибке 300. Это единственный элемент, ради которого Wrapper существует.",
              en: "A wrapper without a VASTAdTagURI leads nowhere: the chain stops and the player reports error 300. It is the single element a Wrapper exists for.",
            },
          ),
        ),
  },
  {
    id: "VAST-wrapper-vastadtaguri-valid",
    group: "wrapper",
    severity: "error",
    spec: vast("§3.3 VASTAdTagURI"),
    iabErrorCode: 300,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "Wrapper"))
        .filter((wrapper): wrapper is NonNullable<typeof wrapper> => Boolean(wrapper))
        .map((wrapper) => first(wrapper, "VASTAdTagURI"))
        .filter((node): node is NonNullable<typeof node> => Boolean(node?.text.trim()))
        .filter((node) => !checkUrl(node.text).ok)
        .map((node) =>
          hit(
            node,
            {
              ru: "VASTAdTagURI не является корректным абсолютным URL.",
              en: "The VASTAdTagURI is not a valid absolute URL.",
            },
            {
              ru: "Адрес следующего ad-сервера должен быть абсолютным. Относительный путь разрешать не от чего — документ уже сменил владельца.",
              en: "The next ad server's address must be absolute. There is no base to resolve a relative path against — the document has already changed hands.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "VAST-wrapper-follow-additional",
    group: "wrapper",
    severity: "advisory",
    spec: vast("§3.3 Wrapper@followAdditionalWrappers"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "Wrapper"))
        .filter((wrapper): wrapper is NonNullable<typeof wrapper> => Boolean(wrapper))
        .filter((wrapper) => (attr(wrapper, "followAdditionalWrappers") ?? "").toLowerCase() === "false")
        .map((wrapper) =>
          hit(
            wrapper,
            {
              ru: "Обёртка запрещает переход по следующим обёрткам.",
              en: "The wrapper forbids following any further wrappers.",
            },
            {
              ru: "followAdditionalWrappers=\"false\" означает, что следующий ответ обязан быть InLine. Если по цепочке придёт ещё одна обёртка, показа не будет — это осознанное решение, а не дефект, но о нём стоит знать.",
              en: 'followAdditionalWrappers="false" means the next response must be an InLine. If another wrapper arrives instead, nothing renders. A deliberate choice rather than a defect, but worth knowing about.',
            },
          ),
        ),
  },
  {
    id: "VAST-wrapper-boolean-attributes",
    group: "wrapper",
    severity: "warning",
    spec: vast("§3.3 Wrapper"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "Wrapper"))
        .filter((wrapper): wrapper is NonNullable<typeof wrapper> => Boolean(wrapper))
        .flatMap((wrapper) =>
          (["followAdditionalWrappers", "allowMultipleAds", "fallbackOnNoAd"] as const)
            .map((name) => ({ name, value: attr(wrapper, name) }))
            .filter(
              ({ value }) =>
                value !== undefined &&
                value.trim() !== "" &&
                !["true", "false", "0", "1"].includes(value.trim().toLowerCase()),
            )
            .map(({ name, value }) =>
              hit(
                wrapper,
                {
                  ru: "Булев атрибут Wrapper имеет нераспознаваемое значение.",
                  en: "A boolean Wrapper attribute has an unrecognisable value.",
                },
                {
                  ru: "Допустимы только true и false. Плееры трактуют прочие значения по-разному — часть считает их true, часть false, и поведение цепочки перестаёт быть предсказуемым.",
                  en: "Only true and false are allowed. Players disagree on anything else — some read it as true, some as false — and the chain stops behaving predictably.",
                },
                `${name}="${value}"`,
              ),
            ),
        ),
  },
  {
    id: "VAST-wrapper-has-no-creative-content",
    group: "wrapper",
    severity: "warning",
    spec: vast("§3.3 Wrapper"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "Wrapper"))
        .filter((wrapper): wrapper is NonNullable<typeof wrapper> => Boolean(wrapper))
        .flatMap((wrapper) => {
          const offenders = all(first(wrapper, "Creatives"), "Creative")
            .map((creative) => first(creative, "Linear"))
            .filter((linear): linear is NonNullable<typeof linear> => Boolean(linear))
            .filter((linear) => first(linear, "MediaFiles") || first(linear, "Duration"));
          return offenders.map((linear) =>
            hit(
              linear,
              {
                ru: "Wrapper содержит медиафайлы или Duration.",
                en: "The Wrapper carries media files or a Duration.",
              },
              {
                ru: "В обёртке Creative нужен только для трекинга. Медиа приходит из финального InLine; лишние MediaFiles здесь либо игнорируются, либо конфликтуют с настоящим креативом.",
                en: "Inside a wrapper a Creative exists only to carry tracking. The media comes from the final InLine; extra MediaFiles here are either ignored or fight the real creative.",
              },
            ),
          );
        }),
  },
];

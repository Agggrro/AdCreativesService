import { atLeast } from "../model";
import { all, attr, first } from "../xml-tree";
import { checkUrl, hit, vast, type Rule } from "./kit";

/** Elements an InLine ad must carry before a player will trust it. */
export const inlineRules: Rule[] = [
  {
    id: "VAST-inline-adsystem",
    group: "inline",
    severity: "error",
    spec: vast("§3.6 AdSystem"),
    iabErrorCode: 101,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .filter((inline) => !first(inline, "AdSystem")?.text.trim())
        .map((inline) =>
          hit(
            inline,
            {
              ru: "В InLine отсутствует непустой элемент AdSystem.",
              en: "The InLine ad has no non-empty AdSystem element.",
            },
            {
              ru: "AdSystem называет систему, отдавшую объявление. Это первое, что смотрят при разборе спорного показа, и он обязателен по спецификации.",
              en: "AdSystem names the system that served the ad. It is the first thing anyone looks at when an impression is disputed, and the specification requires it.",
            },
          ),
        ),
  },
  {
    id: "VAST-inline-adtitle",
    group: "inline",
    severity: "error",
    spec: vast("§3.8 AdTitle"),
    iabErrorCode: 101,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .filter((inline) => !first(inline, "AdTitle")?.text.trim())
        .map((inline) =>
          hit(
            inline,
            {
              ru: "В InLine отсутствует непустой элемент AdTitle.",
              en: "The InLine ad has no non-empty AdTitle element.",
            },
            {
              ru: "AdTitle обязателен для InLine. Достаточно короткого названия кампании или креатива — оно попадает в отчёты плеера и систем верификации.",
              en: "AdTitle is required on an InLine. A short campaign or creative name is enough — it surfaces in player and verification reporting.",
            },
          ),
        ),
  },
  {
    id: "VAST-inline-impression",
    group: "inline",
    severity: "error",
    spec: vast("§3.10 Impression"),
    iabErrorCode: 101,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .filter((inline) => all(inline, "Impression").filter((node) => node.text.trim()).length === 0)
        .map((inline) =>
          hit(
            inline,
            {
              ru: "В InLine нет ни одного Impression с URL.",
              en: "The InLine ad has no Impression carrying a URL.",
            },
            {
              ru: "Без Impression показ невозможно засчитать: рекламодатель не увидит открутку, а площадка не сможет её выставить. Добавьте хотя бы один <Impression> с абсолютным URL.",
              en: "Without an Impression the exposure cannot be counted: the advertiser sees no delivery and the publisher cannot bill it. Add at least one <Impression> with an absolute URL.",
            },
          ),
        ),
  },
  {
    id: "VAST-inline-creatives",
    group: "inline",
    severity: "error",
    spec: vast("§3.11 Creatives"),
    iabErrorCode: 101,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .filter((inline) => all(first(inline, "Creatives"), "Creative").length === 0)
        .map((inline) =>
          hit(
            inline,
            {
              ru: "В InLine нет ни одного Creative.",
              en: "The InLine ad contains no Creative.",
            },
            {
              ru: "InLine без креатива нечего показывать. Если объявления действительно нет, отдавайте пустой VAST — плеер обработает это корректно, а не как ошибку.",
              en: "An InLine with no creative has nothing to show. If there genuinely is no ad, return an empty VAST — a player handles that cleanly rather than as a failure.",
            },
          ),
        ),
  },
  {
    id: "VAST-impression-url-valid",
    group: "inline",
    severity: "error",
    spec: vast("§3.10 Impression"),
    iabErrorCode: 101,
    check: (ctx) =>
      all(ctx.root, "Ad")
        .flatMap((ad) => [first(ad, "InLine"), first(ad, "Wrapper")])
        .filter((body): body is NonNullable<typeof body> => Boolean(body))
        .flatMap((body) => all(body, "Impression"))
        .filter((node) => node.text.trim() && !checkUrl(node.text).ok)
        .map((node) =>
          hit(
            node,
            {
              ru: "URL в Impression не является корректным абсолютным адресом.",
              en: "The Impression URL is not a valid absolute address.",
            },
            {
              ru: "Трекинговые URL должны быть абсолютными и начинаться с http:// или https:// — относительный путь плееру не от чего разрешать, документ мог прийти через три редиректа от другой компании.",
              en: "Tracking URLs must be absolute and begin with http:// or https:// — a player has no base to resolve against, since the document may have arrived through three redirects from another company.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "VAST-impression-duplicate",
    group: "inline",
    severity: "warning",
    spec: vast("§3.10 Impression"),
    check: (ctx) => {
      const seen = new Map<string, number>();
      for (const ad of all(ctx.root, "Ad")) {
        for (const body of [first(ad, "InLine"), first(ad, "Wrapper")]) {
          if (!body) continue;
          for (const node of all(body, "Impression")) {
            const url = node.text.trim();
            if (url) seen.set(url, (seen.get(url) ?? 0) + 1);
          }
        }
      }
      return [...seen.entries()]
        .filter(([, count]) => count > 1)
        .map(([url, count]) => ({
          path: ctx.root.path,
          message: {
            ru: "Один и тот же URL Impression указан несколько раз.",
            en: "The same Impression URL appears more than once.",
          },
          hint: {
            ru: "Несколько Impression разрешены, но они должны вести на разные адреса. Одинаковые URL сработают дважды и завысят количество показов — расхождение обнаружится при сверке с рекламодателем.",
            en: "Multiple Impressions are allowed, but they must point at different addresses. Identical URLs fire twice and inflate the impression count, which shows up as a discrepancy at reconciliation.",
          },
          offending: `×${count} · ${url.slice(0, 160)}`,
        }));
    },
  },
  {
    id: "VAST-inline-advertiser",
    group: "inline",
    severity: "advisory",
    spec: vast("§3.9 Advertiser"),
    appliesTo: (ctx) => atLeast(ctx.declared, "4.0"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .map((ad) => first(ad, "InLine"))
        .filter((inline): inline is NonNullable<typeof inline> => Boolean(inline))
        .filter((inline) => !first(inline, "Advertiser")?.text.trim())
        .map((inline) =>
          hit(
            inline,
            {
              ru: "Не указан элемент Advertiser.",
              en: "No Advertiser element is present.",
            },
            {
              ru: "Advertiser называет рекламодателя и используется площадками для блокировки конкурентов. Без него ваше объявление могут отфильтровать превентивно.",
              en: "Advertiser names the brand and is what publishers use for competitive separation. Without it an ad can be filtered out pre-emptively.",
            },
          ),
        ),
  },
  {
    id: "VAST-creative-id",
    group: "inline",
    severity: "advisory",
    spec: vast("§3.12 Creative@id"),
    check: (ctx) =>
      all(ctx.root, "Ad")
        .flatMap((ad) => [first(ad, "InLine"), first(ad, "Wrapper")])
        .filter((body): body is NonNullable<typeof body> => Boolean(body))
        .flatMap((body) => all(first(body, "Creatives"), "Creative"))
        .filter((creative) => !attr(creative, "id")?.trim())
        .map((creative) =>
          hit(
            creative,
            { ru: "У Creative нет атрибута id.", en: "The Creative has no id attribute." },
            {
              ru: "id креатива нужен, чтобы связать событие в логе с конкретным роликом, когда в поде их несколько.",
              en: "A creative id is what links a log event to a specific asset when a pod carries several.",
            },
          ),
        ),
  },
];

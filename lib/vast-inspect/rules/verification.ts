import { atLeast } from "../model";
import { all, attr, descendants, first } from "../xml-tree";
import { checkUrl, hit, looksLikeCdata, omid, vast, type Rule } from "./kit";

/**
 * Open Measurement (OMID) verification nodes.
 *
 * The rule worth the whole file is `OMID-verifications-placement`. In VAST 4.0
 * AdVerifications lived inside <Extensions>; from 4.1 it is a first-class child
 * of InLine. Tags migrated from 4.0 routinely keep the old position, the
 * document stays perfectly well-formed, and every verification vendor silently
 * measures nothing. It is invisible until someone asks why viewability is zero.
 */
export const verificationRules: Rule[] = [
  {
    id: "OMID-verifications-placement",
    group: "verification",
    severity: "error",
    spec: vast("§3.16 AdVerifications"),
    iabErrorCode: 410,
    appliesTo: (ctx) => atLeast(ctx.declared, "4.1"),
    check: (ctx) =>
      descendants(ctx.root, "AdVerifications")
        // Flag any parent that is not a legal one, rather than only the
        // Extensions case. `InLine` and `Wrapper` are both legal in the 4.2
        // XSD; everything else — MediaFiles, Linear, Creatives, Extensions —
        // means the block is invisible to the player. Testing only for
        // Extensions left the MediaFiles case, which this project's own
        // generator guards against, entirely unreachable.
        .filter((node) => node.parent && !["InLine", "Wrapper"].includes(node.parent.name))
        .map((node) =>
          hit(
            node,
            node.parent?.name === "Extensions" || node.parent?.name === "Extension"
              ? {
                  ru: "AdVerifications находится внутри Extensions, хотя с VAST 4.1 должен быть прямым потомком InLine.",
                  en: "AdVerifications sits inside Extensions, but since VAST 4.1 it must be a direct child of InLine.",
                }
              : {
                  ru: "AdVerifications находится не там, где его ищет плеер.",
                  en: "AdVerifications is not where a player looks for it.",
                },
            {
              ru: "Это самая незаметная поломка верификации: документ остаётся валидным XML, плеер не ругается, а замерять никто ничего не начинает. Перенесите <AdVerifications> в InLine — между <Impression> и <Creatives>.",
              en: "This is the quietest way verification breaks: the document stays valid XML, no player complains, and nothing gets measured. Move <AdVerifications> up into InLine, between <Impression> and <Creatives>.",
            },
            node.path,
          ),
        ),
  },
  {
    id: "OMID-verification-vendor",
    group: "verification",
    severity: "error",
    spec: vast("§3.16.1 Verification@vendor"),
    iabErrorCode: 101,
    check: (ctx) =>
      descendants(ctx.root, "Verification")
        .filter((node) => !attr(node, "vendor")?.trim())
        .map((node) =>
          hit(
            node,
            {
              ru: "У элемента Verification нет атрибута vendor.",
              en: "The Verification element has no vendor attribute.",
            },
            {
              ru: "vendor обязателен: по нему плеер решает, разрешён ли этот измеритель, и в каком режиме доступа его запускать. Формат — обратный домен, например \"doubleverify.com-omid\".",
              en: 'vendor is required: the player decides from it whether this measurer is permitted and at what access level to run it. The format is a reversed domain, e.g. "doubleverify.com-omid".',
            },
          ),
        ),
  },
  {
    id: "OMID-javascript-resource-apiframework",
    group: "verification",
    severity: "error",
    spec: omid("JavaScriptResource@apiFramework"),
    iabErrorCode: 410,
    check: (ctx) =>
      descendants(ctx.root, "JavaScriptResource")
        .filter((node) => (attr(node, "apiFramework") ?? "").toLowerCase() !== "omid")
        .map((node) =>
          hit(
            node,
            {
              ru: "У JavaScriptResource не указан apiFramework=\"omid\".",
              en: 'JavaScriptResource does not declare apiFramework="omid".',
            },
            {
              ru: "Без этого атрибута плеер не понимает, что скрипт нужно запускать через OM SDK, и либо игнорирует его, либо исполняет в неверном контексте. Ожидаемое значение — строчными: omid.",
              en: "Without the attribute a player does not know the script should run through the OM SDK, and either ignores it or executes it in the wrong context. The expected value is lowercase: omid.",
            },
            attr(node, "apiFramework") ?? "—",
          ),
        ),
  },
  {
    id: "OMID-resource-https",
    group: "verification",
    severity: "error",
    spec: omid("Verification resources"),
    iabErrorCode: 410,
    check: (ctx) =>
      [
        ...descendants(ctx.root, "JavaScriptResource"),
        ...descendants(ctx.root, "ExecutableResource"),
      ]
        .filter((node) => node.text.trim())
        .filter((node) => {
          const verdict = checkUrl(node.text);
          return !verdict.ok || verdict.url?.protocol !== "https:";
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "URL скрипта верификации не использует https.",
              en: "The verification script URL is not https.",
            },
            {
              ru: "Скрипт исполняется на странице издателя по https — http-ресурс браузер заблокирует. Плеер сообщит об ошибке 410, а измерения не будет.",
              en: "The script runs on an https publisher page, so the browser blocks an http resource. The player reports error 410 and no measurement happens.",
            },
            node.text.trim().slice(0, 200),
          ),
        ),
  },
  {
    id: "OMID-browser-optional",
    group: "verification",
    severity: "advisory",
    spec: omid("JavaScriptResource@browserOptional"),
    check: (ctx) =>
      descendants(ctx.root, "JavaScriptResource")
        .filter((node) => attr(node, "browserOptional") === undefined)
        .map((node) =>
          hit(
            node,
            {
              ru: "У JavaScriptResource не указан browserOptional.",
              en: "JavaScriptResource does not declare browserOptional.",
            },
            {
              ru: "Атрибут говорит, может ли скрипт работать вне браузерного окружения — это существенно для CTV и приложений, где нет DOM. Без него плеер вынужден гадать.",
              en: "The attribute says whether the script can run outside a browser environment, which matters on CTV and in apps where there is no DOM. Without it the player has to guess.",
            },
          ),
        ),
  },
  {
    id: "OMID-verification-not-executed",
    group: "verification",
    severity: "advisory",
    spec: vast("§3.16.1 Verification tracking"),
    check: (ctx) =>
      descendants(ctx.root, "Verification")
        .filter((node) => {
          const events = all(first(node, "TrackingEvents"), "Tracking");
          return !events.some((event) => (attr(event, "event") ?? "").trim() === "verificationNotExecuted");
        })
        .map((node) =>
          hit(
            node,
            {
              ru: "У Verification нет трекинга события verificationNotExecuted.",
              en: "The Verification carries no verificationNotExecuted tracking.",
            },
            {
              ru: "Это единственный способ узнать, что измеритель не запустился. Без него нулевая виуабилити неотличима от «скрипт не загрузился» — а разница между ними определяет, кто платит.",
              en: "It is the only way to learn that the measurer never ran. Without it, zero viewability is indistinguishable from “the script failed to load” — and which one it was decides who pays.",
            },
          ),
        ),
  },
  {
    id: "OMID-verification-parameters-cdata",
    group: "verification",
    severity: "warning",
    spec: vast("§3.16.1 VerificationParameters"),
    check: (ctx) =>
      descendants(ctx.root, "VerificationParameters")
        .filter((node) => /[<>&]/.test(node.text))
        .filter((node) => !looksLikeCdata(ctx.source, "VerificationParameters", node.text))
        .map((node) =>
          hit(
            node,
            {
              ru: "VerificationParameters содержит спецсимволы XML, но не обёрнут в CDATA.",
              en: "VerificationParameters contains XML special characters but is not wrapped in CDATA.",
            },
            {
              ru: "Параметры измерителя обычно JSON и почти всегда содержат & и кавычки. Оборачивайте содержимое в <![CDATA[…]]>, иначе строгий парсер отвергнет документ, а мягкий — исказит параметры.",
              en: "Measurement parameters are usually JSON and almost always contain & and quotes. Wrap the content in <![CDATA[…]]>, or a strict parser rejects the document and a lenient one mangles the parameters.",
            },
          ),
        ),
  },
];

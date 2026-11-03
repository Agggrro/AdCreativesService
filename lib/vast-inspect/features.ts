import { atLeast, type FeatureHit, type Msg, type VastVersion } from "./model";
import { FEATURE_SINCE } from "./spec";
import { attr, descendants, type VNode } from "./xml-tree";

/**
 * The version/feature matrix.
 *
 * A static "what arrived in which VAST version" table is available on any blog.
 * What is not is the third column: whether *this* tag uses the feature, and
 * whether it even could at the version it declares. A tag declaring 3.0 cannot
 * carry a Mezzanine no matter how much the buyer wants one, and saying so is
 * more useful than a row of red crosses.
 *
 * `since` values are taken from the IAB XSDs, not from folklore, and live in
 * `./spec.ts` (`FEATURE_SINCE`) since ADR-0035: the VAST generator gates its form
 * and its builder on the same table, so it cannot offer a feature at a version
 * this matrix calls unavailable. Several of them are widely misreported,
 * including by other validators:
 *
 * - `InteractiveCreativeFile` is **4.0** (declared in vast4.xsd); 4.1 added its
 *   `variableDuration` attribute. `AdVerifications` at InLine level really is 4.1.
 * - `apiFramework="VPAID"` exists in **2.0.1**. It is deprecated from **4.1**
 *   (VAST 4.1 §1.8) and has never been removed — 4.3 still documents how to
 *   serve it, so no `removedIn` is recorded here.
 * - `Pricing` is **3.0** (vast3_draft.xsd), not 4.0.
 * - `<Error>` exists in **2.0**; what 3.0 standardised was the code list.
 */

export interface FeatureSpec {
  id: string;
  label: Msg;
  since: VastVersion;
  deprecatedIn?: VastVersion;
  removedIn?: VastVersion;
  /** Called with every document in the chain — a wrapper may carry the feature. */
  detect(docs: VNode[]): { present: boolean; detail?: string };
}

/* ---------- detection helpers ---------- */

function nodes(docs: VNode[], name: string): VNode[] {
  return docs.flatMap((doc) => descendants(doc, name));
}

/** Present when the element occurs at all; detail is the count when plural. */
function byElement(name: string) {
  return (docs: VNode[]) => {
    const found = nodes(docs, name);
    return { present: found.length > 0, detail: found.length > 1 ? `×${found.length}` : undefined };
  };
}

/** Present when any of several elements occurs; detail names which ones. */
function byAnyElement(...names: string[]) {
  return (docs: VNode[]) => {
    const hits = names.filter((name) => nodes(docs, name).length > 0);
    return { present: hits.length > 0, detail: hits.length > 0 ? hits.join(", ") : undefined };
  };
}

function byAttribute(element: string, attribute: string, expected?: string) {
  return (docs: VNode[]) => {
    const found = nodes(docs, element).filter((node) => {
      const value = attr(node, attribute);
      if (value === undefined) return false;
      return expected === undefined ? value !== "" : value.toLowerCase() === expected.toLowerCase();
    });
    const sample = found[0] ? attr(found[0], attribute) : undefined;
    return { present: found.length > 0, detail: expected === undefined ? sample : undefined };
  };
}

/* ---------- the matrix ---------- */

export const FEATURES: readonly FeatureSpec[] = [
  {
    id: "linear",
    label: { ru: "Линейная видеореклама", en: "Linear video ad" },
    since: FEATURE_SINCE["linear"],
    detect: byElement("Linear"),
  },
  {
    id: "nonlinear-companion",
    label: { ru: "Оверлеи и баннеры", en: "Overlays and companion banners" },
    since: FEATURE_SINCE["nonlinear-companion"],
    detect: byAnyElement("NonLinearAds", "CompanionAds"),
  },
  {
    id: "basic-tracking",
    label: { ru: "Базовый трекинг событий", en: "Basic event tracking" },
    since: FEATURE_SINCE["basic-tracking"],
    detect: (docs) => {
      const impressions = nodes(docs, "Impression").length;
      const trackings = nodes(docs, "Tracking").length;
      const total = impressions + trackings;
      return {
        present: total > 0,
        detail: total > 0 ? `Impression ×${impressions}, Tracking ×${trackings}` : undefined,
      };
    },
  },
  {
    id: "wrappers",
    label: { ru: "Обёртки и редиректы", en: "Wrappers and redirects" },
    since: FEATURE_SINCE["wrappers"],
    detect: (docs) => {
      const found = nodes(docs, "Wrapper");
      return { present: found.length > 0, detail: found.length > 0 ? `×${found.length}` : undefined };
    },
  },
  {
    id: "vpaid",
    label: { ru: "VPAID", en: "VPAID" },
    since: FEATURE_SINCE["vpaid"],
    deprecatedIn: "4.1",
    detect: (docs) => {
      const found = [...nodes(docs, "MediaFile"), ...nodes(docs, "Creative")].filter(
        (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid",
      );
      return { present: found.length > 0, detail: found.length > 0 ? "apiFramework=VPAID" : undefined };
    },
  },
  {
    id: "skip",
    label: { ru: "Пропуск рекламы (Skip)", en: "Skippable ads" },
    since: FEATURE_SINCE["skip"],
    detect: byAttribute("Linear", "skipoffset"),
  },
  {
    id: "ad-pods",
    label: { ru: "Рекламные подборки (Ad Pods)", en: "Ad pods" },
    since: FEATURE_SINCE["ad-pods"],
    detect: (docs) => {
      const found = nodes(docs, "Ad").filter((node) => attr(node, "sequence") !== undefined);
      // `detail` is machine text and is NOT localised — so it may only ever
      // contain element names, attribute values and counts, never prose.
      return { present: found.length > 0, detail: found.length > 0 ? `sequence ×${found.length}` : undefined };
    },
  },
  {
    id: "error-codes",
    label: { ru: "Стандартизированные коды ошибок", en: "Standardised error codes" },
    since: FEATURE_SINCE["error-codes"],
    detect: byElement("Error"),
  },
  {
    id: "error-macros",
    label: { ru: "Макросы в URL ошибок", en: "Error URL macros" },
    since: FEATURE_SINCE["error-macros"],
    detect: (docs) => {
      const macros = new Set<string>();
      for (const node of nodes(docs, "Error")) {
        for (const macro of node.text.matchAll(/\[([A-Z_]+)\]/g)) macros.add(macro[1]);
      }
      return { present: macros.size > 0, detail: macros.size > 0 ? [...macros].join(", ") : undefined };
    },
  },
  {
    id: "mezzanine",
    label: { ru: "Файл высокого качества (Mezzanine)", en: "Mezzanine file" },
    since: FEATURE_SINCE["mezzanine"],
    detect: byElement("Mezzanine"),
  },
  {
    id: "universal-ad-id",
    label: { ru: "Сквозной ID креатива (UniversalAdId)", en: "Universal Ad ID" },
    since: FEATURE_SINCE["universal-ad-id"],
    detect: (docs) => {
      const found = nodes(docs, "UniversalAdId");
      const first = found[0];
      return {
        present: found.length > 0,
        detail: first ? `${attr(first, "idRegistry") ?? "?"}: ${first.text || "—"}` : undefined,
      };
    },
  },
  {
    id: "ad-categories",
    label: { ru: "Категории объявлений", en: "Ad categories" },
    since: FEATURE_SINCE["ad-categories"],
    detect: byAnyElement("Category", "BlockedAdCategories"),
  },
  {
    id: "viewable-impression",
    label: { ru: "Трекинг видимости (ViewableImpression)", en: "Viewability tracking" },
    since: FEATURE_SINCE["viewable-impression"],
    detect: byElement("ViewableImpression"),
  },
  {
    id: "ssai",
    label: { ru: "Оптимизация под SSAI и CTV", en: "SSAI and CTV optimisation" },
    // 4.0 is when the SSAI story starts (Mezzanine, ViewableImpression); the
    // rest of the signals below are 4.1, and each has its own row above.
    since: FEATURE_SINCE["ssai"],
    detect: (docs) => {
      const signals = ["Mezzanine", "AdServingId", "ClosedCaptionFiles", "ViewableImpression"].filter(
        (name) => nodes(docs, name).length > 0,
      );
      return { present: signals.length > 0, detail: signals.length > 0 ? signals.join(", ") : undefined };
    },
  },
  {
    id: "ad-serving-id",
    label: { ru: "AdServingId", en: "AdServingId" },
    since: FEATURE_SINCE["ad-serving-id"],
    detect: byElement("AdServingId"),
  },
  {
    id: "simid",
    label: { ru: "SIMID — интерактив без VPAID", en: "SIMID interactive creative" },
    since: FEATURE_SINCE["simid"],
    detect: (docs) => {
      const found = nodes(docs, "InteractiveCreativeFile").filter(
        (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "simid",
      );
      return { present: found.length > 0, detail: found.length > 0 ? "apiFramework=SIMID" : undefined };
    },
  },
  {
    id: "omid",
    label: { ru: "OMID — независимая верификация", en: "OMID verification" },
    since: FEATURE_SINCE["omid"],
    detect: (docs) => {
      const verifications = nodes(docs, "Verification");
      const vendors = verifications
        .map((node) => attr(node, "vendor"))
        .filter((vendor): vendor is string => Boolean(vendor));
      return {
        present: verifications.length > 0,
        detail: vendors.length > 0 ? vendors.join(", ") : undefined,
      };
    },
  },
  {
    id: "closed-captions",
    label: { ru: "Субтитры (ClosedCaptionFiles)", en: "Closed caption files" },
    since: FEATURE_SINCE["closed-captions"],
    detect: byElement("ClosedCaptionFiles"),
  },
  {
    id: "icons",
    label: { ru: "Иконки (AdChoices)", en: "Icons (AdChoices)" },
    since: FEATURE_SINCE["icons"],
    detect: byElement("Icon"),
  },
  {
    id: "pricing",
    label: { ru: "Цена показа (Pricing)", en: "Pricing" },
    since: FEATURE_SINCE["pricing"],
    detect: (docs) => {
      const found = nodes(docs, "Pricing");
      const first = found[0];
      return {
        present: found.length > 0,
        detail: first ? `${attr(first, "model") ?? "?"} ${attr(first, "currency") ?? ""}`.trim() : undefined,
      };
    },
  },
  {
    id: "expires",
    label: { ru: "Срок годности объявления (Expires)", en: "Ad expiry" },
    since: FEATURE_SINCE["expires"],
    detect: byElement("Expires"),
  },
] as const;

/**
 * Evaluate every feature against the chain.
 *
 * `availableAtDeclaredVersion` is false both when the tag is too old for the
 * feature and when the feature has been removed by the declared version — VPAID
 * in a 4.3 document is unavailable in exactly the same sense a Mezzanine is
 * unavailable in a 2.0 one.
 */
export function detectFeatures(docs: VNode[], declared: VastVersion | undefined): FeatureHit[] {
  return FEATURES.map((spec) => {
    const { present, detail } = spec.detect(docs);
    // A tag with no usable version attribute is judged permissively rather than
    // being told every feature is out of reach: `atLeast(undefined, …)` is
    // always false, which previously reported "Linear video ad: unavailable at
    // the declared version" for a document whose only fault was a missing
    // `version`. The missing attribute is already its own finding.
    const oldEnough = declared === undefined || atLeast(declared, spec.since);
    const notYetRemoved = !spec.removedIn || declared === undefined || !atLeast(declared, spec.removedIn);
    return {
      id: spec.id,
      label: spec.label,
      since: spec.since,
      deprecatedIn: spec.deprecatedIn,
      removedIn: spec.removedIn,
      present,
      detail,
      availableAtDeclaredVersion: oldEnough && notYetRemoved,
    };
  });
}

import { type VNode } from "../xml-tree";
import { hit, vast, type Rule, type RuleHit } from "./kit";

/**
 * Child-element order, for the two containers where it is safe to enforce.
 *
 * The VAST 4.2 XSD models its containers with `xs:sequence`, so order is
 * normative rather than stylistic, and it is the one class of fault that is
 * invisible without a rule: a strict parser rejects the document outright, a
 * lenient one accepts it, and the tag therefore breaks on some players and not
 * others — the hardest kind of bug to diagnose from a delivery report.
 *
 * The sequences below are read out of the XSD, base type first: `Inline_type`
 * and `Wrapper_type` both extend `AdDefinitionBase_type`, and an `xs:extension`
 * appends the derived sequence *after* the base's. That produces the
 * counter-intuitive but correct result that `<Error>` and `<Pricing>` precede
 * `<AdTitle>` — and IAB's own published sample
 * (VAST_Samples/VAST 4.1 Samples/Inline_Simple.xml) is authored in exactly that
 * order, which is what makes the rule safe to ship.
 *
 * **Three containers are deliberately NOT checked.** The XSD's sequence for them
 * contradicts real-world practice including IAB's own sample, so enforcing it
 * would manufacture warnings on conformant tags:
 *
 *   · `MediaFiles`  — the XSD orders `ClosedCaptionFiles, MediaFile, Mezzanine,
 *                     InteractiveCreativeFile`, putting captions first; the VAST
 *                     4.3 prose and every tag in the wild put `MediaFile` first.
 *   · `Creative`    — the XSD orders `Linear` before `UniversalAdId`; the IAB
 *                     sample does the opposite.
 *   · `Linear`      — inherits `TrackingEvents` from its base, so the XSD wants
 *                     it before `Duration`. Most real tags put `Duration` first,
 *                     and warning on the majority of correct tags is worse than
 *                     not checking.
 *
 * Do not add them back without re-deriving the order from the schema *and*
 * checking it against real tags. Getting this backwards is how a validator
 * starts inventing violations, which is worse than missing them.
 *
 * Severity is `warning`, not `error`: most players in the field accept a
 * mis-ordered document, so calling it a hard failure would overstate what the
 * reader will experience. But "works in the player you happened to test" is
 * exactly what this tool exists to expose.
 */

/**
 * Verified against the VAST 4.2 XSD (`AdDefinitionBase_type` then the derived
 * type) and against IAB's own sample.
 */
const SEQUENCES: ReadonlyArray<{ parent: string; order: readonly string[] }> = [
  {
    parent: "InLine",
    order: [
      "AdSystem",
      "Error",
      "Extensions",
      "Impression",
      "Pricing",
      "ViewableImpression",
      "AdServingId",
      "AdTitle",
      "AdVerifications",
      "Advertiser",
      "Category",
      "Creatives",
      "Description",
      "Expires",
      "Survey",
    ],
  },
  {
    parent: "Wrapper",
    order: [
      "AdSystem",
      "Error",
      "Extensions",
      "Impression",
      "Pricing",
      "ViewableImpression",
      "AdVerifications",
      "BlockedAdCategories",
      "Creatives",
      "VASTAdTagURI",
    ],
  },
];

/**
 * The first child that appears earlier than one which should precede it, or
 * undefined when the order is fine.
 *
 * Repeated siblings collapse to one position — several `<Impression>` elements
 * in a row are one step in the sequence, not five. Unknown elements are skipped
 * entirely, so an ad server's proprietary extension sitting between two known
 * ones is never reported as a fault.
 */
function firstOutOfOrder(
  container: VNode,
  order: readonly string[],
): { node: VNode; shouldFollow: string } | undefined {
  let highest = -1;
  let highestName = "";

  for (const child of container.children) {
    const rank = order.indexOf(child.name);
    if (rank === -1) continue;
    if (rank < highest) return { node: child, shouldFollow: highestName };
    if (rank > highest) {
      highest = rank;
      highestName = child.name;
    }
  }
  return undefined;
}

function containersFor(root: VNode, parent: string): VNode[] {
  const found: VNode[] = [];
  const walk = (node: VNode) => {
    if (node.name === parent) found.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return found;
}

export const orderingRules: Rule[] = SEQUENCES.map(({ parent, order }) => ({
  id: `VAST-child-order-${parent.toLowerCase()}`,
  group: "document" as const,
  severity: "warning" as const,
  spec: vast(`§3 ${parent} (xs:sequence)`),
  iabErrorCode: 101,
  check: (ctx): RuleHit[] => {
    const hits: RuleHit[] = [];
    for (const container of containersFor(ctx.root, parent)) {
      const problem = firstOutOfOrder(container, order);
      if (!problem) continue;
      hits.push(
        hit(
          problem.node,
          {
            ru: `Элемент <${problem.node.name}> стоит не на своём месте внутри <${parent}>.`,
            en: `<${problem.node.name}> is out of order inside <${parent}>.`,
          },
          {
            ru: `Схема VAST задаёт для <${parent}> строгую последовательность, поэтому порядок здесь — часть спецификации, а не оформление. Строгий парсер отвергнет документ целиком, мягкий примет: тег сломается у части плееров и будет работать у остальных. Порядок по схеме: ${order.join(" → ")}.`,
            en: `The VAST schema declares a strict sequence for <${parent}>, so order here is part of the specification rather than formatting. A strict parser rejects the document outright while a lenient one accepts it, so the tag breaks on some players and works on others. Schema order: ${order.join(" → ")}.`,
          },
          `<${problem.node.name}> after <${problem.shouldFollow}>`,
        ),
      );
    }
    return hits;
  },
}));

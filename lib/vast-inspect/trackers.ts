import type { TrackerHit, TrackerKind } from "./model";
import { attr, descendants, type VNode } from "./xml-tree";

/**
 * The inventory of every URL a player may ping.
 *
 * Worth having for its own sake — "who is measuring my impression, and at which
 * hop did they join the chain" is a question ad ops asks constantly and few
 * tools answer — and load-bearing for dry-run: neutralize.ts rewrites exactly
 * this set, so anything missing here would fire for real in a mode that
 * promises it will not.
 */
const TRACKER_ELEMENTS: ReadonlyArray<{ element: string; kind: TrackerKind }> = [
  { element: "Impression", kind: "impression" },
  { element: "Tracking", kind: "tracking" },
  { element: "ClickTracking", kind: "clickTracking" },
  { element: "CustomClick", kind: "customClick" },
  { element: "Error", kind: "error" },
  { element: "Viewable", kind: "viewableImpression" },
  { element: "NotViewable", kind: "notViewable" },
  { element: "ViewUndetermined", kind: "viewUndetermined" },
  { element: "CompanionClickTracking", kind: "companionClickTracking" },
  { element: "NonLinearClickTracking", kind: "nonLinearClickTracking" },
  { element: "IconViewTracking", kind: "iconViewTracking" },
  { element: "IconClickTracking", kind: "iconClickTracking" },
];

export function collectTrackers(root: VNode, hop: number): TrackerHit[] {
  const hits: TrackerHit[] = [];

  for (const { element, kind } of TRACKER_ELEMENTS) {
    for (const node of descendants(root, element)) {
      const url = node.text.trim();
      if (!url) continue;

      // A <Tracking> inside a <Verification> is a measurement beacon rather
      // than a playback event, and the report's "who measures what" column
      // depends on telling them apart. Resolved from the node's own ancestors
      // in this single pass — an earlier version built the list first and then
      // re-scanned all of it once per verification node.
      const vendor = element === "Tracking" ? verificationVendor(node) : undefined;
      const event = element === "Tracking" ? attr(node, "event")?.trim() : undefined;

      hits.push({
        hop,
        kind: vendor === undefined ? kind : "verificationTracking",
        // Only <Tracking> carries an event; for everything else the element
        // name is the event, and duplicating it here would just be noise.
        event: vendor ? `${event ?? "?"} · ${vendor}` : event,
        url,
        path: node.path,
      });
    }
  }

  return hits;
}

/**
 * The `vendor` of the enclosing <Verification>, or undefined when the node is
 * not inside one. Returns an empty string for a Verification that declares no
 * vendor, which is itself a finding elsewhere — so the caller can still tell
 * "measurement beacon" from "playback event".
 */
function verificationVendor(node: VNode): string | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (current.name === "Verification") return attr(current, "vendor")?.trim() ?? "";
  }
  return undefined;
}


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
      hits.push({
        hop,
        kind,
        // Only <Tracking> carries an event; for everything else the element
        // name is the event, and duplicating it here would just be noise.
        event: element === "Tracking" ? attr(node, "event")?.trim() : undefined,
        url,
        path: node.path,
      });
    }
  }

  // A Verification's TrackingEvents live inside <Verification> and are already
  // caught by the Tracking sweep above; re-labelling them keeps the report's
  // "who measures what" column honest.
  for (const verification of descendants(root, "Verification")) {
    const vendor = attr(verification, "vendor");
    for (const node of descendants(verification, "Tracking")) {
      const url = node.text.trim();
      if (!url) continue;
      const existing = hits.find((entry) => entry.path === node.path);
      if (existing) {
        existing.kind = "verificationTracking";
        existing.event = vendor
          ? `${attr(node, "event")?.trim() ?? "?"} · ${vendor}`
          : attr(node, "event")?.trim();
      }
    }
  }

  return hits;
}

/** Totals per kind, for the report summary. */
export function summariseTrackers(hits: TrackerHit[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const hit of hits) {
    const key = hit.kind === "tracking" && hit.event ? `tracking:${hit.event}` : hit.kind;
    totals[key] = (totals[key] ?? 0) + 1;
  }
  return totals;
}

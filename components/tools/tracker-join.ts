import type { PlayerEvent } from "@/components/players/types";
import type { TrackerHit, TrackerKind } from "@/lib/vast-inspect/model";

/**
 * Which declared tracker each player event would have fired.
 *
 * **This is a join by name, not an observation.** No player — IMA included —
 * reports which URL it actually requested; `AdEvent` carries the event, and the
 * document carries the addresses, and nothing connects the two at runtime. So the
 * timeline's tracker column is an inference, and the column's tooltip says so.
 * Presenting it as a measurement would be worse than omitting it: the one thing a
 * validator cannot afford is to be believed about something it did not see.
 *
 * The join is still worth making. "Which pixel does this quartile carry" and
 * "which pixels never came up at all" are the two questions the old separate
 * tracker table was read for, and answering them beside the event is the whole
 * reason the two tables merged.
 *
 * Events with no tracker of their own — `sdkReady`, `loaded`, `canPlay`, the
 * content pause/resume pair, `log` — are absent on purpose rather than mapped to
 * something approximate.
 */
const JOIN: Record<string, { kind: TrackerKind; events?: readonly string[] }> = {
  impression: { kind: "impression" },
  start: { kind: "tracking", events: ["start"] },
  firstQuartile: { kind: "tracking", events: ["firstQuartile"] },
  midpoint: { kind: "tracking", events: ["midpoint"] },
  thirdQuartile: { kind: "tracking", events: ["thirdQuartile"] },
  complete: { kind: "tracking", events: ["complete"] },
  paused: { kind: "tracking", events: ["pause"] },
  resumed: { kind: "tracking", events: ["resume"] },
  skipped: { kind: "tracking", events: ["skip"] },
  volumeMuted: { kind: "tracking", events: ["mute"] },
  // VAST names the linear and non-linear cases differently, and a tag may carry
  // either; both mean the viewer dismissed the ad.
  userClose: { kind: "tracking", events: ["close", "closeLinear"] },
  click: { kind: "clickTracking" },
  videoClicked: { kind: "clickTracking" },
  iconClicked: { kind: "iconClickTracking" },
  viewableImpression: { kind: "viewableImpression" },
  adError: { kind: "error" },
};

function matches(tracker: TrackerHit, rule: { kind: TrackerKind; events?: readonly string[] }) {
  if (tracker.kind !== rule.kind) return false;
  if (!rule.events) return true;
  const event = (tracker.event ?? "").trim().toLowerCase();
  return rule.events.some((name) => name.toLowerCase() === event);
}

export interface TimelineRow {
  event: PlayerEvent;
  /** Every declared tracker this event would fire. Often none. */
  trackers: TrackerHit[];
}

export interface JoinedTimeline {
  rows: TimelineRow[];
  /**
   * Trackers no event in this run reached. The most useful thing in the table:
   * a quartile pixel that never came up is the shape a broken tag has.
   */
  unfired: TrackerHit[];
}

export function joinTrackers(events: PlayerEvent[], trackers: TrackerHit[]): JoinedTimeline {
  const fired = new Set<TrackerHit>();

  const rows = events.map((event) => {
    const rule = JOIN[event.name];
    if (!rule) return { event, trackers: [] };
    const hits = trackers.filter((tracker) => matches(tracker, rule));
    for (const hit of hits) fired.add(hit);
    return { event, trackers: hits };
  });

  // A verification beacon is a measurement call, not a playback event — it has no
  // player event to belong to and listing it as "never fired" would read as a
  // fault. It stays out of both halves; the wrapper-chain and standards tables
  // are where measurement is accounted for.
  const unfired = trackers.filter(
    (tracker) => !fired.has(tracker) && tracker.kind !== "verificationTracking",
  );

  return { rows, unfired };
}

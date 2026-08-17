/** The mint endpoint's response — everything all three players need in one shot. */
export interface PreviewMint {
  previewTagUrl: string;
  expiresInSeconds: number;
  sandbox: {
    scriptUrl: string;
    adParameters: Record<string, unknown>;
    format: string;
  };
}

/**
 * One entry in a run timeline.
 *
 * `onStatus` collapses everything a player reports into a single replaceable
 * line, which is the right shape for a preview panel and useless for a
 * validator: the whole question there is what happened in what order. This is
 * the structured form, kept deliberately player-agnostic so a Fluid or Sandbox
 * driver can emit the same shape later.
 */
export interface PlayerEvent {
  /** Milliseconds since the run started. */
  at: number;
  /** `player` for anything the SDK reported, `validator` for our own notes. */
  source: "player" | "validator";
  /** Machine name, rendered in mono: "impression", "firstQuartile", "adError". */
  name: string;
  /** Human-readable detail; already localised by whoever emits it. */
  detail?: string;
  tone: "live" | "info" | "warn" | "dead";
}

/**
 * Severity of a status line, when a player has one to declare.
 *
 * The cold half of the state vocabulary (docs/design-system.md §3) — the warm
 * accent means action and can never mean alarm. Omitted for the ordinary
 * running commentary ("Playing", "Complete"), which is not a state.
 */
export type StatusTone = "info" | "warn" | "dead";

/** Shared contract every player backend implements. */
export interface PreviewPlayerProps {
  mint: PreviewMint;
  /**
   * Human-readable status line shown under the player frame. Pass a `tone` to
   * raise the line into a notice — for a condition the viewer has to act on,
   * rather than the next word in the playback commentary. `detail` is a machine
   * value that belongs with it (an address to allow, an id to quote); it is
   * rendered in mono, apart from the prose, the way `PlayerEvent.detail` is.
   */
  onStatus: (status: string, tone?: StatusTone, detail?: string) => void;
  /** Fired when the creative's click-through is triggered. */
  onClickThrough: (url: string) => void;
  /**
   * Structured lifecycle events, if the host wants them.
   *
   * Optional so the three existing players keep compiling untouched; the
   * configurator preview has no use for a timeline and does not pass it.
   */
  onEvent?: (event: PlayerEvent) => void;
}

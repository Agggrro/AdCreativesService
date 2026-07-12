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

/** Shared contract every player backend implements. */
export interface PreviewPlayerProps {
  mint: PreviewMint;
  /** Human-readable status line shown under the player frame. */
  onStatus: (status: string) => void;
  /** Fired when the creative's click-through is triggered. */
  onClickThrough: (url: string) => void;
}

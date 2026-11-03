/**
 * The player well's frame (docs/design-system.md §7), one implementation for
 * the two tools that have one — the validator and the VAST generator. Separated
 * from the page by elevation and a hairline, not by being darker. Clipping
 * lives on the screen rectangle inside, never here, so a focus ring inside the
 * well is never cut off (§3).
 *
 * `strip` is the line of fixed facts above the screen: what the request proved
 * in the validator, what the document declares in the generator. Nothing that
 * no request established may be written there (§7).
 */
export function WellFrame({ strip, children }: { strip: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-well border border-well-line bg-well p-3">
      <div className="flex items-center justify-between gap-3 pb-3">{strip}</div>
      {children}
    </div>
  );
}

/**
 * The screen before anything has played: human prose, so sans at the caption
 * role — the well's mono is for machine readouts, not for sentences (§4, §7).
 */
export function WellIdle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-ctl bg-well-screen px-6">
      <p className="max-w-[52ch] text-center type-caption text-well-fg">{children}</p>
    </div>
  );
}

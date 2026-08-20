"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Play, RotateCcw } from "lucide-react";
import type { PreviewMint, StatusTone } from "@/components/players/types";
import { Notice } from "@/components/ui/Field";
import { SandboxPlayer } from "@/components/players/SandboxPlayer";
import { ImaPlayer } from "@/components/players/ImaPlayer";
import { FluidPlayer } from "@/components/players/FluidPlayer";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";

type PlayerKey = "sandbox" | "ima" | "fluid";

// Product names, not copy — they stay identical in both locales.
const PLAYERS: { key: PlayerKey; label: string }[] = [
  { key: "sandbox", label: "Sandbox" },
  { key: "ima", label: "Google IMA" },
  { key: "fluid", label: "Fluid Player" },
];

/**
 * The "player + Launch Ad" panel on the template configurator. Mints a fresh,
 * short-TTL VAST preview from whatever is currently typed into the form
 * (nothing saved to the DB) and runs it in whichever of the three player
 * backends is selected — same VAST tag, three different players.
 *
 * The well: a creative is judged against black (docs/design-system.md §7). It is no
 * longer "the one dark surface" — the whole product is dark — so it is separated
 * by elevation and a hairline instead.
 */
export function PreviewPanel({
  templateId,
  format,
  fields,
}: {
  templateId: string;
  format: string;
  fields: Record<string, string>;
}) {
  const dict = useDict();
  const [tab, setTab] = useState<PlayerKey>("sandbox");
  const [mint, setMint] = useState<PreviewMint | null>(null);
  const [launchToken, setLaunchToken] = useState(0);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // A status a player marked with a tone is a condition to act on, not the next
  // word of playback commentary, so it is rendered as a notice rather than as
  // the muted line. `detail` is the machine value that goes with it.
  const [statusTone, setStatusTone] = useState<StatusTone | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [clickThrough, setClickThrough] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const report = useCallback(
    (text: string, tone?: StatusTone, detail?: string) => {
      setStatus(text);
      setStatusTone(tone ?? null);
      setStatusDetail(detail ?? null);
    },
    [],
  );

  async function launch() {
    setMinting(true);
    setError(null);
    setStatus(null);
    setStatusTone(null);
    setStatusDetail(null);
    setClickThrough(null);
    setLatencyMs(null);
    const startedAt = performance.now();
    try {
      const res = await fetch("/api/vast/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, format, fields }),
      });
      const data = (await res.json().catch(() => null)) as
        | (PreviewMint & { error?: string })
        | null;
      if (!res.ok || !data) {
        setError(data?.error || dict.preview.errorStart);
        setMint(null);
        return;
      }
      setMint(data);
      setLatencyMs(Math.round(performance.now() - startedAt));
      setExpiresAt(Date.now() + data.expiresInSeconds * 1000);
      setLaunchToken((t) => t + 1);
    } catch {
      setError(dict.preview.errorReach);
      setMint(null);
    } finally {
      setMinting(false);
    }
  }

  const launched = mint !== null;
  const commonProps = mint
    ? { mint, onStatus: report, onClickThrough: setClickThrough }
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Segmented
          fill
          label={dict.preview.player}
          value={tab}
          onChange={setTab}
          options={PLAYERS.map((p) => ({ value: p.key, label: p.label }))}
        />
        <p className="type-caption text-fg-muted">
          {dict.preview.sameTag}
        </p>
      </div>

      {/* Hairline plus a lifted surround is what separates the well; the tone step alone is 1.06:1 (docs/design-system.md §2, §7). */}
      <div className="rounded-well border border-well-line bg-well p-3">
        {/* Instrument strip: what a buyer checks before pressing play */}
        <div className="chip-instr flex items-center justify-between gap-3 pb-3 text-well-fg">
          <span className="data-instr">
            {dict.preview.format} · {format || "—"}
          </span>
          {launched && !error && (
            <span className="inline-flex items-center gap-1.5 text-well-live">
              <span className="size-1.5 rounded-full bg-well-live" />
              <span className="data-instr">
                {dict.preview.served}
                {latencyMs !== null ? ` · ${latencyMs} ${dict.preview.ms}` : ""}
              </span>
            </span>
          )}
        </div>

        {/*
          The ad slot clips — a creative may not paint outside it — but the launch
          control is a **sibling** of the clipped rect, not a child of it.
          Sitting inside, its focus ring (2px solid, 2px offset) fell entirely
          outside the clipping box and was erased, leaving the configurator's
          primary preview control with no visible focus state at all. §2 names
          this as the single most repeated way focus disappears here. Out here the
          ring lands in the well's own 12px padding and is visible.
        */}
        <div className="relative">
          <div
            className="relative w-full overflow-hidden rounded-ctl bg-well-screen"
            style={{ aspectRatio: "16 / 9" }}
          >
            {commonProps && (tab === "sandbox" ? (
              <SandboxPlayer key={launchToken} {...commonProps} />
            ) : tab === "ima" ? (
              <ImaPlayer key={launchToken} {...commonProps} />
            ) : (
              <FluidPlayer key={launchToken} {...commonProps} />
            ))}
          </div>

          {!launched && (
            <button
              type="button"
              onClick={launch}
              disabled={minting || !format}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-ctl text-well-fg transition-colors duration-150 hover:bg-well-fg/5 disabled:cursor-wait"
            >
              {minting ? (
                <Loader2 className="animate-spin" size={26} aria-hidden />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-ctl border border-well-line bg-well">
                  <Play size={20} className="fill-well-fg" aria-hidden />
                </span>
              )}
              <span className="type-small font-medium">
                {minting ? dict.preview.building : dict.preview.launch}
              </span>
            </button>
          )}
        </div>

        {launched && expiresAt && (
          <ExpiryHint
            expiresAt={expiresAt}
            validFor={dict.preview.validFor}
            seconds={dict.preview.seconds}
            expired={dict.preview.expired}
          />
        )}
      </div>

      {/*
        A toned status gets the full width under the well rather than the shared
        status line: it is prose the viewer has to read and act on, and the line
        beside the Restart button is sized for three words. The line goes quiet
        while it shows, so the same sentence is never in two places at once.
      */}
      {statusTone && !error && status && (
        <Notice tone={statusTone} live detail={statusDetail ?? undefined}>
          {status}
        </Notice>
      )}

      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 type-caption text-fg-muted">
          {error ? (
            <span
              role="alert"
              className="inline-flex items-start gap-1 text-dead"
            >
              <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
              {error}
            </span>
          ) : clickThrough ? (
            <>
              {dict.preview.clickThrough} →{" "}
              <code className="data-instr break-all text-fg-secondary">
                {clickThrough}
              </code>
            </>
          ) : statusTone ? null : (
            status ?? dict.preview.idleHint
          )}
        </p>
        {launched && (
          <button
            type="button"
            onClick={launch}
            disabled={minting}
            className={buttonClass("secondary", "md", "shrink-0")}
          >
            <RotateCcw size={13} aria-hidden /> {dict.preview.restart}
          </button>
        )}
      </div>
    </div>
  );
}

function ExpiryHint({
  expiresAt,
  validFor,
  seconds,
  expired,
}: {
  expiresAt: number;
  validFor: string;
  seconds: string;
  expired: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.round((expiresAt - now) / 1000));
  return (
    <p className="type-data pt-3 text-well-fg">
      {remaining > 0 ? `${validFor} ${remaining}${seconds}` : expired}
    </p>
  );
}

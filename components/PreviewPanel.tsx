"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Play, RotateCcw } from "lucide-react";
import type { PreviewMint } from "@/components/players/types";
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
 * This is the one dark surface in the product: a creative is always judged
 * against black (docs/design-system.md §7).
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
  const [clickThrough, setClickThrough] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  async function launch() {
    setMinting(true);
    setError(null);
    setStatus(null);
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
    ? { mint, onStatus: setStatus, onClickThrough: setClickThrough }
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
        <p className="text-[11px] leading-4 text-fg-muted">
          {dict.preview.sameTag}
        </p>
      </div>

      <div className="rounded-ctl bg-well p-3">
        {/* Instrument strip: what a buyer checks before pressing play */}
        <div className="flex items-center justify-between gap-3 pb-3 font-mono text-[11px] uppercase tracking-[0.09em] text-well-fg">
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

          {!launched && (
            <button
              type="button"
              onClick={launch}
              disabled={minting || !format}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white transition-colors hover:bg-white/5 disabled:cursor-wait"
            >
              {minting ? (
                <Loader2 className="animate-spin" size={26} aria-hidden />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-ctl border border-well-line bg-well">
                  <Play size={20} className="fill-white" aria-hidden />
                </span>
              )}
              <span className="text-[13px] font-medium">
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

      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-fg-muted">
          {error ? (
            <span
              role="alert"
              className="inline-flex items-start gap-1 text-dead-fg"
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
          ) : (
            status ?? dict.preview.idleHint
          )}
        </p>
        {launched && (
          <button
            type="button"
            onClick={launch}
            disabled={minting}
            className={buttonClass("secondary", "shrink-0")}
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
    <p className="data-instr pt-3 text-[11px] text-well-fg">
      {remaining > 0 ? `${validFor} ${remaining}${seconds}` : expired}
    </p>
  );
}

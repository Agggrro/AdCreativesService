"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Play, RotateCcw } from "lucide-react";
import type { PreviewMint } from "@/components/players/types";
import { SandboxPlayer } from "@/components/players/SandboxPlayer";
import { ImaPlayer } from "@/components/players/ImaPlayer";
import { VideoJsPlayer } from "@/components/players/VideoJsPlayer";

type PlayerKey = "sandbox" | "ima" | "videojs";

const PLAYERS: { key: PlayerKey; label: string }[] = [
  { key: "sandbox", label: "Sandbox" },
  { key: "ima", label: "Google IMA SDK" },
  { key: "videojs", label: "Video.js" },
];

/**
 * The "player + Launch Ad" panel on the template configurator. Mints a fresh,
 * short-TTL VAST preview from whatever is currently typed into the form
 * (nothing saved to the DB) and runs it in whichever of the three player
 * backends is selected — same VAST tag, three different players.
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
  const [tab, setTab] = useState<PlayerKey>("sandbox");
  const [mint, setMint] = useState<PreviewMint | null>(null);
  const [launchToken, setLaunchToken] = useState(0);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [clickThrough, setClickThrough] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  async function launch() {
    setMinting(true);
    setError(null);
    setStatus(null);
    setClickThrough(null);
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
        setError(data?.error || "Could not start the preview.");
        setMint(null);
        return;
      }
      setMint(data);
      setExpiresAt(Date.now() + data.expiresInSeconds * 1000);
      setLaunchToken((t) => t + 1);
    } catch {
      setError("Could not reach the preview endpoint.");
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
    <div className="space-y-3">
      <div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
          {PLAYERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setTab(p.key)}
              className={`flex-1 rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                tab === p.key
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center text-xs text-gray-400">
          Same VAST tag, three different players — what a real DSP would load.
        </p>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_20px_40px_-15px_rgba(0,0,0,0.35)]"
        style={{ aspectRatio: "16 / 9" }}
      >
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
          {format || "—"}
        </span>

        {commonProps && (tab === "sandbox" ? (
          <SandboxPlayer key={launchToken} {...commonProps} />
        ) : tab === "ima" ? (
          <ImaPlayer key={launchToken} {...commonProps} />
        ) : (
          <VideoJsPlayer key={launchToken} {...commonProps} />
        ))}

        {!launched && (
          <button
            type="button"
            onClick={launch}
            disabled={minting || !format}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white transition-colors hover:bg-white/5 disabled:cursor-wait"
          >
            {minting ? (
              <Loader2 className="animate-spin" size={26} />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25 transition-transform group-hover:scale-105">
                <Play size={22} className="ml-0.5 fill-white" />
              </span>
            )}
            <span className="text-sm font-medium">
              {minting ? "Building VAST tag…" : "Launch Ad"}
            </span>
          </button>
        )}
      </div>

      <div className="flex items-start justify-between gap-3 text-xs">
        <p className="min-w-0 flex-1 text-gray-500">
          {error ? (
            <span className="inline-flex items-center gap-1 text-red-600">
              <AlertCircle size={13} /> {error}
            </span>
          ) : clickThrough ? (
            <>
              Click-through fired →{" "}
              <code className="break-all text-gray-700">{clickThrough}</code>
            </>
          ) : (
            status ?? "Fill in the fields, then launch the ad above."
          )}
        </p>
        {launched && (
          <button
            type="button"
            onClick={launch}
            disabled={minting}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Restart
          </button>
        )}
      </div>

      {launched && expiresAt && <ExpiryHint expiresAt={expiresAt} />}
    </div>
  );
}

function ExpiryHint({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.round((expiresAt - now) / 1000));
  return (
    <p className="text-center text-[11px] text-gray-400">
      {remaining > 0
        ? `Preview tag valid for ${remaining}s — Launch/Restart mints a fresh one.`
        : "Preview tag expired — click Restart to mint a new one."}
    </p>
  );
}

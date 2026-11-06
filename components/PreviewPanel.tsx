"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Check, Loader2, Play, RotateCcw } from "lucide-react";
import type { PreviewMint, StatusTone } from "@/components/players/types";
import { Notice } from "@/components/ui/Field";
import { SandboxPlayer } from "@/components/players/SandboxPlayer";
import { ImaPlayer } from "@/components/players/ImaPlayer";
import { NavDropdown } from "@/components/NavDropdown";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";

// Fluid Player only ever runs in the browser, and it brings dash.js, hls.js and
// three.js with it — three megabytes that, imported statically, sat in the
// server bundle of every page that renders this panel, and in the Worker's
// startup on Cloudflare (ADR-0029). Loaded on the client, when the tab is used.
const FluidPlayer = dynamic(
  () => import("@/components/players/FluidPlayer").then((m) => m.FluidPlayer),
  { ssr: false },
);

type PlayerKey = "sandbox" | "ima" | "fluid";

// Product names, not copy — they stay identical in both locales.
const PLAYERS: { key: PlayerKey; label: string }[] = [
  { key: "sandbox", label: "Sandbox" },
  { key: "ima", label: "Google IMA" },
  { key: "fluid", label: "Fluid Player" },
];

/**
 * The stage of a creative's Settings (docs/design-system.md §6, "Workspace"; §7,
 * "Well"): the creative, as large as the screen leaves it, and one control to
 * run it. Mints a fresh, short-TTL VAST preview from whatever is currently typed
 * into the inspector (nothing saved to the DB) and runs it in whichever of the
 * three player backends is selected — same VAST tag, three different players,
 * chosen from a menu in the stage's corner rather than a strip above it.
 *
 * The well: a creative is judged against black (§7). It is not "the one dark
 * surface" — the whole product is dark — so it is separated by elevation and a
 * hairline instead. From `lg` it fills the stage and the 16:9 screen is the
 * largest that fits it, from the well's own size (container query units); below
 * it the screen takes the column's width, capped by the screen's height, and the
 * stage sticks to the top while the parameters scroll under it — when the screen is
 * tall enough to leave them room (`.stage-stick`, `.stage-screen`: app/globals.css).
 *
 * It is rendered **outside** the configurator's `<form>`. The Sandbox player runs
 * the creative in this very document, inside the stage, and a creative's own
 * buttons are `type`-less, which is a submit button to any form around them: a
 * click on the ad's call to action saved the creative.
 */
export function PreviewPanel({
  templateId,
  format,
  fields,
  className = "",
}: {
  templateId: string;
  format: string;
  fields: Record<string, string>;
  className?: string;
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
  const player = PLAYERS.find((p) => p.key === tab) ?? PLAYERS[0];

  return (
    <section
      className={`stage-stick flex min-w-0 flex-col gap-4 bg-surface p-4 max-lg:border-b max-lg:border-hairline lg:min-h-0 lg:flex-1 lg:px-8 lg:py-6 ${className}`}
    >
      <div className="flex items-center justify-end gap-3">
        <NavDropdown
          align="right"
          closeOnClick
          triggerClassName={buttonClass("secondary", "sm")}
          panelClassName="w-48 divide-y divide-hairline"
          label={
            <>
              <span className="type-caption text-fg-muted">{dict.preview.player}</span>
              <span className="data-instr">{player.label}</span>
            </>
          }
        >
          {PLAYERS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={p.key === tab}
              onClick={() => setTab(p.key)}
              className="focus-inset flex h-11 w-full items-center justify-between gap-3 px-5 text-left type-small text-fg transition-colors duration-150 first:rounded-t-ctl last:rounded-b-ctl hover:bg-surface-2"
            >
              <span className="data-instr">{p.label}</span>
              {p.key === tab && <Check size={14} aria-hidden className="text-fg-secondary" />}
            </button>
          ))}
        </NavDropdown>
      </div>

      {/* Hairline plus a lifted surround is what separates the well; the tone step alone is 1.06:1 (docs/design-system.md §2, §7). */}
      <div className="rounded-well border border-well-line bg-well p-3 lg:relative lg:min-h-0 lg:flex-1 lg:p-0 lg:[container-type:size]">
        <div className="lg:absolute lg:inset-3 lg:flex lg:items-center lg:justify-center">
          {/*
            The ad slot clips — a creative may not paint outside it — but the launch
            control is a **sibling** of the clipped rect, not a child of it.
            Sitting inside, its focus ring (2px solid, 2px offset) fell entirely
            outside the clipping box and was erased, leaving the preview's primary
            control with no visible focus state at all. §2 names this as the single
            most repeated way focus disappears here.
          */}
          <div className="stage-screen relative aspect-video w-full lg:w-[min(calc(100cqw_-_24px),calc((100cqh_-_24px)_*_16/9))]">
            <div
              /* Isolated for the same reason as `VpaidPreview`'s screen: a
                 creative's chrome would otherwise paint over the page's own. */
              className="absolute inset-0 isolate overflow-hidden rounded-ctl bg-well-screen"
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
        </div>
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

      {(launched || error) && (
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 type-caption text-fg-muted">
            {error ? (
              <span role="alert" className="inline-flex items-start gap-1 text-dead">
                <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
                {error}
              </span>
            ) : clickThrough ? (
              <>
                {dict.preview.clickThrough} →{" "}
                <code className="data-instr break-all text-fg-secondary">{clickThrough}</code>
              </>
            ) : statusTone ? null : (
              (status ?? (
                <span className="data-instr inline-flex flex-wrap items-center gap-x-3">
                  <span className="inline-flex items-center gap-1.5 text-well-live">
                    <span className="size-1.5 rounded-full bg-well-live" />
                    {dict.preview.served}
                    {latencyMs !== null ? ` · ${latencyMs} ${dict.preview.ms}` : ""}
                  </span>
                  {expiresAt && (
                    <ExpiryHint
                      expiresAt={expiresAt}
                      validFor={dict.preview.validFor}
                      seconds={dict.preview.seconds}
                      expired={dict.preview.expired}
                    />
                  )}
                </span>
              ))
            )}
          </p>
          {launched && (
            <button
              type="button"
              onClick={launch}
              disabled={minting}
              className={buttonClass("secondary", "sm", "shrink-0")}
            >
              <RotateCcw size={13} aria-hidden /> {dict.preview.restart}
            </button>
          )}
        </div>
      )}
    </section>
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
  return <span>{remaining > 0 ? `${validFor} ${remaining}${seconds}` : expired}</span>;
}

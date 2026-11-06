"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { ConfigField } from "@/lib/config-schema";
import {
  MEDIA_ACCEPT,
  MEDIA_MAX_BYTES,
  isAllowedMediaMime,
  isOwnMediaUrl,
} from "@/lib/creative-media";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";

type Mode = "upload" | "url";

/** A URL whose path looks like a video file — the same test the runtime's media layer makes. */
const VIDEO_URL_RE = /\.(webm|mp4|m4v|mov|ogv)(\?|#|$)/i;

/**
 * The `type: "image"` field control: upload a file to our media store — R2
 * behind the ad domain since ADR-0028, the Storage bucket of ADR-0010 on a
 * deployment without it — or fall back to pasting an external URL. Either path
 * lands in the same plain URL string the rest of the configurator already
 * treats as opaque — no downstream change needed.
 */
export function MediaUploadField({
  field,
  value,
  onChange,
  variant = "row",
  tileLabel,
  thumb = "md",
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
  /**
   * The inspector's two shapes (docs/design-system.md §6, "Workspace"): `row`, a
   * thumbnail with its controls beside it, where the field has the 299px column to
   * itself; and `stack`, the thumbnail with its controls under it, as wide as the
   * cell and one word to a button, where two or three fields sit side by side — in
   * 94px, "Upload" and "URL" do not fit on one line, and in 125px nor do they beside
   * a thumbnail. The same upload, URL and replace paths in both.
   */
  variant?: "row" | "stack";
  /** The field's accessible name — its block and stage, e.g. `A · Vote`. */
  tileLabel?: string;
  /** Thumbnail edge: 44px, or 36px inside an option's row. */
  thumb?: "md" | "sm";
}) {
  const dict = useDict();
  const m = dict.configurator.media;
  const [mode, setMode] = useState<Mode>(() =>
    value && !isOwnMediaUrl(value) ? "url" : "upload",
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The original filename, kept only for display — never sent anywhere. Not
  // recoverable from the object's public URL (a uuid), so a freshly uploaded
  // file shows its name; a value that arrived already-set (e.g. editing a
  // saved creative) falls back to the generic m.uploaded label.
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Each state swaps whole controls, so the one holding keyboard focus unmounts;
  // this names where focus lands after the next render (docs/design-system.md §2).
  const focusNext = useRef<"url" | "file" | "replace" | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-focus="${focusNext.current}"]`)?.focus();
    focusNext.current = null;
  });

  async function handleFile(file: File) {
    setError(null);
    if (!isAllowedMediaMime(file.type)) {
      setError(m.errWrongType);
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setError(m.errTooLarge);
      return;
    }

    setUploading(true);
    try {
      // lib/media-upload-client.ts, shared with the VAST generator (ADR-0035).
      const result = await uploadMediaFile(file);
      if ("error" in result) {
        setError(
          result.error === "wrong_type"
            ? m.errWrongType
            : result.error === "too_large"
              ? m.errTooLarge
              : result.error === "unauthorized"
                ? // "Try again" cannot help an expired session; signing in can.
                  dict.vastGen.errUnauthorized
                : m.errUploadFailed,
        );
        return;
      }
      onChange(result.url);
      setUploadedName(file.name);
      focusNext.current = "replace";
    } finally {
      if (focusNext.current !== "replace") focusNext.current = "file";
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clear() {
    setError(null);
    setUploadedName(null);
    onChange("");
    setMode("upload");
    focusNext.current = "file";
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    focusNext.current = next === "url" ? "url" : "file";
  }

  // The filled view waits for the URL entry to finish: switching on the first
  // keystroke would unmount the input being typed into.
  const filled = Boolean(value) && mode !== "url";
  const own = isOwnMediaUrl(value);
  const valueLabel = own ? (uploadedName ?? m.uploaded) : hostOf(value);

  // Inside the label it names, so the label's has-[:focus-visible] ring shows
  // for this sr-only input — as the delivery-format segments do (§6, "Inputs").
  const fileInput = (
    <input
      ref={fileInputRef}
      data-focus="file"
      type="file"
      accept={MEDIA_ACCEPT}
      className="sr-only"
      disabled={uploading}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
      }}
    />
  );
  const uploadLabelClass = (extra: string) =>
    `${buttonClass("secondary", "sm", extra)} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${uploading ? "pointer-events-none opacity-70" : ""}`;

  const urlInput = (
    <input
      data-focus="url"
      type="url"
      aria-label={`${tileLabel ?? field.label} · ${m.urlTab}`}
      aria-required={field.required || undefined}
      placeholder={field.placeholder ?? "https://"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        if (value.trim()) setMode("upload");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          // Commit, not submit: the form has a dozen other fields to fill.
          e.preventDefault();
          setMode("upload");
          focusNext.current = "replace";
        }
      }}
      className={inputClass}
    />
  );

  const errorLine = error && (
    <p role="alert" className="inline-flex items-start gap-1 type-caption text-dead">
      <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
      {error}
    </p>
  );

  const stacked = variant === "stack";
  const box = thumb === "sm" ? "size-9" : "size-11";
  // A stacked button is as wide as its cell, and its padding is what gives way:
  // "Загрузить" is about 65px of type in a 94px cell.
  const fit = stacked ? "w-full pr-2 pl-2" : "";
  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-1">
      <input type="hidden" name={field.name} value={value} />
      <div
        role="group"
        aria-label={tileLabel ?? field.label}
        className={
          stacked ? "flex flex-col items-start gap-2" : "flex min-w-0 items-center gap-2"
        }
      >
        <div
          className={`flex ${box} shrink-0 overflow-hidden rounded-ctl border ${
            filled ? "border-line bg-surface-2" : "border-dashed border-line"
          }`}
        >
          {filled && <Thumb key={value} value={value} fallback={valueLabel} />}
        </div>
        {filled && <span className="sr-only">{valueLabel}</span>}

        {filled ? (
          <button
            type="button"
            data-focus="replace"
            onClick={clear}
            className={buttonClass("ghost", "sm", fit)}
          >
            {m.replace}
          </button>
        ) : uploading ? (
          <span
            role="status"
            className="flex items-center gap-1.5 type-caption text-fg-secondary"
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {m.uploading}
          </span>
        ) : mode === "url" ? (
          <div
            className={`flex min-w-0 gap-2 ${stacked ? "w-full flex-col" : "flex-1 items-center"}`}
          >
            <div className={stacked ? "min-w-0" : "min-w-0 flex-1"}>{urlInput}</div>
            <button
              type="button"
              onClick={() => switchMode("upload")}
              className={buttonClass("ghost", "sm", `shrink-0 ${fit}`)}
            >
              {m.uploadTab}
            </button>
          </div>
        ) : (
          <div className={`flex gap-2 ${stacked ? "w-full flex-col" : "items-center"}`}>
            <label className={uploadLabelClass(fit)}>
              {fileInput}
              {m.uploadTab}
            </label>
            <button
              type="button"
              onClick={() => switchMode("url")}
              className={buttonClass("ghost", "sm", fit)}
            >
              {m.urlTab}
            </button>
          </div>
        )}
      </div>
      {errorLine}
    </div>
  );
}

/** The host of a pasted URL — what a filled tile names when the medium is not ours. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * A stage's preview: a frame a second into a clip (its very first is often a
 * fade from black), or the picture itself. Never autoplays (§7). A medium that
 * will not render — an extensionless video, a dead link — names its source in
 * mono instead of showing a broken image.
 */
function Thumb({ value, fallback }: { value: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-ctl bg-surface-2">
      {failed ? (
        <span aria-hidden className="data-instr truncate px-1.5 type-caption text-fg-secondary">
          {fallback}
        </span>
      ) : VIDEO_URL_RE.test(value) ? (
        <video
          src={value.includes("#") ? value : `${value}#t=1`}
          preload="metadata"
          muted
          playsInline
          aria-hidden
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- an advertiser URL of any host, not an optimisable asset
        <img src={value} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

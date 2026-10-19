"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Upload as UploadIcon } from "lucide-react";
import type { ConfigField } from "@/lib/config-schema";
import {
  CREATIVE_MEDIA_BUCKET,
  MEDIA_ACCEPT,
  MEDIA_MAX_BYTES,
  buildMediaObjectPath,
  isAllowedMediaMime,
  isOwnMediaUrl,
} from "@/lib/creative-media";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  requestMediaUpload,
  type MediaUploadTicket,
} from "@/app/dashboard/creatives/media-actions";
import { useDict } from "@/components/i18n/LocaleProvider";
import { Segmented } from "@/components/ui/Segmented";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";

type Mode = "upload" | "url";

/** A URL whose path looks like a video file — the same test the runtime's media layer makes. */
const VIDEO_URL_RE = /\.(webm|mp4|m4v|mov|ogv)(\?|#|$)/i;

/**
 * PUT the file to a presigned R2 URL (ADR-0028). The `Content-Type` sent must
 * be the one that was signed; the browser adds the matching `Content-Length`
 * itself, and R2 refuses the upload if either differs from the declaration.
 */
async function uploadToR2(
  ticket: Extract<MediaUploadTicket, { store: "r2" }>,
  file: File,
): Promise<string | null> {
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  return res.ok ? ticket.publicUrl : null;
}

/**
 * The pre-ADR-0028 path, for a deployment without the R2 variables: straight
 * into the Storage bucket, under the user's own prefix (its RLS insert policy).
 */
async function uploadToSupabase(file: File): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = user ? buildMediaObjectPath(user.id, file.type) : null;
  if (!path) return null;
  const { error } = await supabase.storage
    .from(CREATIVE_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return null;
  return supabase.storage.from(CREATIVE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

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
  variant = "full",
  tileLabel,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
  /**
   * `tile` is the compact stage of a scenario group (docs/design-system.md §6,
   * "Scenario"): the same upload, URL and replace paths in a 112px box.
   */
  variant?: "full" | "tile";
  /** The tile's accessible name — its block and stage, e.g. `A · Vote`. */
  tileLabel?: string;
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
      const ticket = await requestMediaUpload(file.type, file.size);
      if ("error" in ticket) {
        setError(
          ticket.error === "wrong_type"
            ? m.errWrongType
            : ticket.error === "too_large"
              ? m.errTooLarge
              : m.errUploadFailed,
        );
        return;
      }

      const url =
        ticket.store === "r2" ? await uploadToR2(ticket, file) : await uploadToSupabase(file);
      if (!url) {
        setError(m.errUploadFailed);
        return;
      }
      onChange(url);
      setUploadedName(file.name);
      focusNext.current = "replace";
    } catch {
      setError(m.errUploadFailed);
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

  if (variant === "tile") {
    return (
      <div ref={rootRef} className="flex min-w-0 flex-col gap-1">
        <input type="hidden" name={field.name} value={value} />
        <div
          role="group"
          aria-label={tileLabel ?? field.label}
          className="flex h-28 min-w-0 flex-col justify-center gap-2 rounded-ctl border border-line bg-surface p-1.5"
        >
          {filled ? (
            <>
              <Thumb key={value} value={value} fallback={valueLabel} />
              <span className="sr-only">{valueLabel}</span>
              <button
                type="button"
                data-focus="replace"
                onClick={clear}
                className={buttonClass("ghost", "sm", "w-full")}
              >
                {m.replace}
              </button>
            </>
          ) : uploading ? (
            <span
              role="status"
              className="flex items-center justify-center gap-1.5 type-caption text-fg-secondary"
            >
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {m.uploading}
            </span>
          ) : mode === "url" ? (
            <>
              {urlInput}
              <button
                type="button"
                onClick={() => switchMode("upload")}
                className={buttonClass("ghost", "sm", "w-full")}
              >
                {m.uploadTab}
              </button>
            </>
          ) : (
            <>
              <label className={uploadLabelClass("w-full")}>
                {fileInput}
                {m.uploadTab}
              </label>
              <button
                type="button"
                onClick={() => switchMode("url")}
                className={buttonClass("ghost", "sm", "w-full")}
              >
                {m.urlTab}
              </button>
            </>
          )}
        </div>
        {errorLine}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      {/* Always present so FormData carries the resolved URL regardless of
          which control produced it — the visible controls below stay unnamed. */}
      <input type="hidden" name={field.name} value={value} />

      {filled ? (
        <div className="flex items-start justify-between gap-3 rounded-ctl border border-line bg-surface px-2.5 py-1.5">
          {own ? (
            // Never surface our own storage URL in the UI — it's our
            // infrastructure's internal address, not something a user needs
            // to see, and showing it invites copying it for unrelated hotlinking.
            <span className="flex min-w-0 flex-1 items-center gap-1.5 type-small text-fg-secondary">
              <Check size={14} className="shrink-0 text-live" aria-hidden />
              <span className="truncate">{valueLabel}</span>
            </span>
          ) : (
            <span className="data-instr min-w-0 flex-1 break-all type-small text-fg-secondary">
              {value}
            </span>
          )}
          <button
            type="button"
            data-focus="replace"
            // The superseded file is deliberately not deleted here: until the
            // form is saved, the live tag still points at it (ADR-0028).
            onClick={clear}
            className={`${buttonClass("ghost")} shrink-0`}
          >
            {m.replace}
          </button>
        </div>
      ) : (
        <>
          {/*
            The shared control, not a fourth copy of it. This was hand-rolled and
            had already drifted from Segmented, which is exactly the failure §6's
            "one implementation per repeated element" describes.
          */}
          <Segmented
            className="self-start"
            label={m.sourceLabel}
            value={mode}
            onChange={(next) => switchMode(next)}
            options={[
              { value: "upload" as const, label: m.uploadTab },
              { value: "url" as const, label: m.urlTab },
            ]}
          />

          {mode === "upload" ? (
            <div>
              <label className={uploadLabelClass("")}>
                {fileInput}
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <UploadIcon size={14} aria-hidden />
                )}
                <span role={uploading ? "status" : undefined}>
                  {uploading ? m.uploading : m.chooseFile}
                </span>
              </label>
            </div>
          ) : (
            urlInput
          )}
        </>
      )}

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

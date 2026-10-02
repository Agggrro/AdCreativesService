"use client";

import { useRef, useState } from "react";
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
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
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
  const inputId = `media-upload-${field.name}`;

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
    } catch {
      setError(m.errUploadFailed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Always present so FormData carries the resolved URL regardless of
          which control produced it — the visible controls below stay unnamed. */}
      <input type="hidden" name={field.name} value={value} />

      {value ? (
        <div className="flex items-start justify-between gap-3 rounded-ctl border border-line bg-surface px-2.5 py-1.5">
          {isOwnMediaUrl(value) ? (
            // Never surface our own storage URL in the UI — it's our
            // infrastructure's internal address, not something a user needs
            // to see, and showing it invites copying it for unrelated hotlinking.
            <span className="flex min-w-0 flex-1 items-center gap-1.5 type-small text-fg-secondary">
              <Check size={14} className="shrink-0 text-live" aria-hidden />
              <span className="truncate">{uploadedName ?? m.uploaded}</span>
            </span>
          ) : (
            <span className="data-instr min-w-0 flex-1 break-all type-small text-fg-secondary">
              {value}
            </span>
          )}
          <button
            type="button"
            // The superseded file is deliberately not deleted here: until the
            // form is saved, the live tag still points at it (ADR-0028).
            onClick={() => {
              setError(null);
              setUploadedName(null);
              onChange("");
              setMode("upload");
            }}
            className={`${buttonClass("ghost")} shrink-0`}
          >
            {m.replace}
          </button>
        </div>
      ) : (
        <>
          {/*
            The shared control, not a fourth copy of it. This was hand-rolled and
            had already drifted — `px-3` here against `Segmented`'s `px-2.5` —
            which is exactly the failure §6's "one implementation per repeated
            element" describes. `Segmented`'s one documented exception is the
            configurator's `sr-only` radio group; a plain two-button toggle is
            not it.
          */}
          <Segmented
            className="self-start"
            label={m.sourceLabel}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
            options={[
              { value: "upload" as const, label: m.uploadTab },
              { value: "url" as const, label: m.urlTab },
            ]}
          />

          {mode === "upload" ? (
            <div>
              <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept={MEDIA_ACCEPT}
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <label
                htmlFor={inputId}
                className={`${buttonClass("secondary")} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${uploading ? "pointer-events-none opacity-70" : ""}`}
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <UploadIcon size={14} aria-hidden />
                )}
                {uploading ? m.uploading : m.chooseFile}
              </label>
            </div>
          ) : (
            <input
              type="url"
              placeholder={field.placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
            />
          )}
        </>
      )}

      {error && (
        <p role="alert" className="inline-flex items-start gap-1 type-caption text-dead">
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

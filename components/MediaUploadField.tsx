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
  mediaObjectPath,
} from "@/lib/creative-media";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";

type Mode = "upload" | "url";

/**
 * The `type: "image"` field control: upload a file straight to the public
 * `creative-media` Storage bucket, or fall back to pasting an external URL
 * (ADR-0010). Either path lands in the same plain URL string the rest of the
 * configurator already treats as opaque — no downstream change needed.
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
      const supabase = createBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const path = user ? buildMediaObjectPath(user.id, file.type) : null;
      if (!path) {
        setError(m.errUploadFailed);
        return;
      }

      // The object a replacement upload is superseding, if there is one —
      // removed only after the new upload succeeds.
      const previousPath = isOwnMediaUrl(value) ? mediaObjectPath(value) : null;

      const { error: uploadError } = await supabase.storage
        .from(CREATIVE_MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError(m.errUploadFailed);
        return;
      }

      const { data } = supabase.storage.from(CREATIVE_MEDIA_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      setUploadedName(file.name);

      if (previousPath) {
        // Best-effort: a stale object left behind isn't worth failing the save over.
        void supabase.storage.from(CREATIVE_MEDIA_BUCKET).remove([previousPath]);
      }
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
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-fg-secondary">
              <Check size={14} className="shrink-0 text-live-fg" aria-hidden />
              <span className="truncate">{uploadedName ?? m.uploaded}</span>
            </span>
          ) : (
            <span className="data-instr min-w-0 flex-1 break-all text-[13px] text-fg-secondary">
              {value}
            </span>
          )}
          <button
            type="button"
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
          <div className="inline-flex self-start rounded-ctl border border-line bg-surface">
            {(["upload", "url"] as const).map((key, i) => {
              const current = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMode(key);
                    setError(null);
                  }}
                  aria-pressed={current}
                  className={`border-r border-hairline px-3 py-1.5 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.06em] transition-colors last:border-r-0 ${
                    i === 0 ? "rounded-l-ctl" : "rounded-r-ctl"
                  } ${current ? "bg-fill text-fg" : "text-fg-secondary hover:bg-fill"}`}
                >
                  {key === "upload" ? m.uploadTab : m.urlTab}
                </button>
              );
            })}
          </div>

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
        <p role="alert" className="inline-flex items-start gap-1 text-xs text-dead-fg">
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/Field";
import { MacroText } from "@/components/ui/MacroText";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { MEDIA_MAX_BYTES } from "@/lib/creative-media";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { vastTime } from "@/lib/vast-gen/build";
import { IMAGE_MIMES, VIDEO_MIMES, type MediaDraft } from "./draft";
import { mimeFromExtension, probeImage, probeVideo } from "./probe";

type Mode = "upload" | "link";

const MIME_LABEL: Record<string, string> = {
  "video/mp4": "MP4",
  "video/webm": "WebM",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
};

function modeOf(value: MediaDraft | null): Mode {
  return value?.source === "external" ? "link" : "upload";
}

/**
 * The VAST generator's file control (ADR-0035): a video or an image, uploaded
 * to us or linked, measured from the file itself. The states follow the
 * configurator's media tiles (docs/design-system.md §6, "Scenario"): `Upload` /
 * `Link` words when empty, the URL input with a word back, a spinner as a
 * status while working, and a frame — never autoplaying — with `Replace` once
 * filled. Focus follows the state, because each state swaps whole controls.
 *
 * Signed out there is nothing to upload into, so the upload word becomes the
 * way to sign in (the form keeps its draft); a link still works.
 */
export function MediaSourceField({
  kind,
  id,
  label,
  help,
  value,
  onChange,
  signedIn,
  onSignIn,
  error,
}: {
  kind: "video" | "image";
  id: string;
  label: string;
  help: string;
  value: MediaDraft | null;
  onChange: (value: MediaDraft | null) => void;
  signedIn: boolean;
  onSignIn: () => void;
  error?: string;
}) {
  const { dict, locale } = useLocale();
  const t = dict.vastGen;
  const mimes: readonly string[] = kind === "video" ? VIDEO_MIMES : IMAGE_MIMES;

  const [mode, setMode] = useState<Mode>(modeOf(value));
  const [busy, setBusy] = useState<"uploading" | "reading" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState(value?.source === "external" ? value.url : "");
  const [linkMime, setLinkMime] = useState<string>(value?.mime ?? mimes[0]);
  // A value that arrives from outside — a draft restored after hydration —
  // brings its own mode with it, so `Replace` on a restored link opens the
  // link, with its type, rather than the upload it never was.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value) {
      setMode(modeOf(value));
      setLink(value.source === "external" ? value.url : "");
      setLinkMime(value.mime);
    }
  }
  const rootRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"file" | "link" | "replace" | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-focus="${focusNext.current}"]`)?.focus();
    focusNext.current = null;
  });

  async function measure(src: string): Promise<{ width: number; height: number; durationMs?: number } | null> {
    try {
      return kind === "video" ? await probeVideo(src) : await probeImage(src);
    } catch {
      return null;
    }
  }

  async function handleFile(file: File) {
    setProblem(null);
    if (!mimes.includes(file.type)) {
      setProblem(kind === "video" ? t.errVideoType : t.errImageType);
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setProblem(t.errTooLarge);
      return;
    }
    // Measured before the upload, from the local file: a file the browser
    // cannot read as a video is not worth sending.
    setBusy("reading");
    const local = URL.createObjectURL(file);
    const facts = await measure(local);
    URL.revokeObjectURL(local);
    if (!facts) {
      setBusy(null);
      setProblem(kind === "video" ? t.errProbeFile : t.errProbeImageFile);
      focusNext.current = "file";
      return;
    }
    setBusy("uploading");
    const result = await uploadMediaFile(file);
    setBusy(null);
    if ("error" in result) {
      setProblem(
        result.error === "wrong_type"
          ? kind === "video"
            ? t.errVideoType
            : t.errImageType
          : result.error === "too_large"
            ? t.errTooLarge
            : result.error === "unauthorized"
              ? t.errUnauthorized
              : t.errUploadFailed,
      );
      focusNext.current = "file";
      return;
    }
    onChange({ source: "upload", url: result.url, mime: file.type, ...facts, bytes: file.size, fileName: file.name });
    focusNext.current = "replace";
  }

  async function applyLink() {
    const url = link.trim();
    if (!url) return;
    setProblem(null);
    setBusy("reading");
    const facts = await measure(url);
    setBusy(null);
    if (!facts) {
      setProblem(kind === "video" ? t.errProbe : t.errProbeImage);
      // The input was swapped for the status while reading; give it back.
      focusNext.current = "link";
      return;
    }
    onChange({ source: "external", url, mime: linkMime, ...facts });
    focusNext.current = "replace";
  }

  function clear() {
    setProblem(null);
    onChange(null);
    setLink("");
    focusNext.current = mode === "link" ? "link" : "file";
  }

  const number = new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: 1 });
  const readout = value
    ? [
        MIME_LABEL[value.mime] ?? value.mime,
        value.width && value.height ? `${value.width}×${value.height}` : null,
        value.durationMs !== undefined ? vastTime(value.durationMs, "4.2") : null,
        value.bytes && value.durationMs
          ? `${number.format(Math.round((value.bytes * 8) / value.durationMs))} ${t.kbps}`
          : null,
        value.bytes ? `${number.format(value.bytes / (1024 * 1024))} ${t.megabytes}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const shown = problem ?? error;

  return (
    <div ref={rootRef} className="flex flex-col gap-2" id={id}>
      <span className="label-instr" id={`${id}-label`}>
        {label}
      </span>

      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* A frame one second in, never autoplaying: the page's one live
              creative stays in the well (§7). Only the thumbnail clips. */}
          <div className="h-16 w-28 shrink-0 overflow-hidden rounded-ctl border border-line bg-surface-2">
            {kind === "video" ? (
              <video
                src={value.url.includes("#") ? value.url : `${value.url}#t=1`}
                preload="metadata"
                muted
                playsInline
                className="h-full w-full object-contain"
                aria-hidden
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- an arbitrary user URL, not an optimisable asset
              <img src={value.url} alt="" className="h-full w-full object-contain" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* Our own upload is named for a person — its file name, or that it
                is one — never by its storage key; a link shows the link,
                character for character, which is what the tag will carry. */}
            {value.source === "external" ? (
              <>
                <span className="type-small text-fg">{t.linkedFile}</span>
                <span className="data-instr type-caption break-all text-fg-secondary">{value.url}</span>
              </>
            ) : (
              <span className="type-small text-fg [overflow-wrap:anywhere]">{value.fileName ?? t.uploadedFile}</span>
            )}
            <span className="data-instr type-caption text-fg-muted">{readout}</span>
          </div>
          <button type="button" data-focus="replace" onClick={clear} className={buttonClass("ghost", "sm")}>
            {t.replace}
          </button>
        </div>
      ) : busy ? (
        <p role="status" className="inline-flex items-center gap-2 type-small text-fg-secondary">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          {busy === "uploading" ? t.uploading : t.reading}
        </p>
      ) : mode === "link" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              data-focus="link"
              type="url"
              inputMode="url"
              spellCheck={false}
              aria-labelledby={`${id}-label`}
              aria-invalid={shown ? true : undefined}
              value={link}
              placeholder={kind === "video" ? t.linkPlaceholder : t.imageLinkPlaceholder}
              onChange={(event) => {
                setLink(event.target.value);
                const implied = mimeFromExtension(event.target.value, kind);
                if (implied) setLinkMime(implied);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void applyLink();
                }
              }}
              className={`${inputBaseClass} min-w-0 flex-1 basis-64`}
            />
            <select
              aria-label={t.linkType}
              value={linkMime}
              onChange={(event) => setLinkMime(event.target.value)}
              className={`${inputBaseClass} w-auto`}
            >
              {mimes.map((mime) => (
                <option key={mime} value={mime}>
                  {MIME_LABEL[mime]}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void applyLink()} className={buttonClass("secondary", "sm")}>
              {t.apply}
            </button>
          </div>
          {/* Signed out, the word says "sign in" and does exactly that, rather
              than opening an upload state with the same word in it again. */}
          <button
            type="button"
            onClick={() => {
              if (!signedIn) {
                onSignIn();
                return;
              }
              setProblem(null);
              setMode("upload");
              focusNext.current = "file";
            }}
            className={`${buttonClass("ghost", "sm")} self-start`}
          >
            {signedIn ? t.upload : t.signInToUpload}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {signedIn ? (
            // The real file input sits inside the label, so the label's
            // `has-[:focus-visible]` ring shows when it has focus (§6, Inputs).
            <label
              className={`${buttonClass("secondary", "sm")} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}
            >
              {t.chooseFile}
              <input
                data-focus="file"
                type="file"
                accept={mimes.join(",")}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
            </label>
          ) : (
            <button type="button" data-focus="file" onClick={onSignIn} className={buttonClass("secondary", "sm")}>
              {t.signInToUpload}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setProblem(null);
              setMode("link");
              focusNext.current = "link";
            }}
            className={buttonClass("ghost", "sm")}
          >
            {t.link}
          </button>
        </div>
      )}

      {shown ? (
        <span role="alert" className="type-caption text-dead">
          <MacroText text={shown} />
        </span>
      ) : (
        <span className="type-caption text-fg-muted">{help}</span>
      )}
    </div>
  );
}

/**
 * Reading a file's own facts in the browser, for the VAST generator (ADR-0035):
 * a video's duration and frame size, an image's natural size. They become the
 * MediaFile's `width`/`height` and the `<Duration>`, so they must come from the
 * file rather than from the user's guess.
 *
 * Both work cross-origin without CORS — a `<video>` exposes its metadata and an
 * `<img>` its natural size to any page — which is what lets a linked file be
 * measured the same way as an upload. The server bounds the numbers; it cannot
 * read them, and a wrong one only misdescribes the owner's own creative.
 */

const PROBE_TIMEOUT_MS = 15_000;

export interface VideoFacts {
  width: number;
  height: number;
  durationMs: number;
}

export function probeVideo(src: string): Promise<VideoFacts> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const release = () => {
      video.removeAttribute("src");
      video.load();
    };
    const timer = setTimeout(() => {
      release();
      reject(new Error("timeout"));
    }, PROBE_TIMEOUT_MS);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const facts = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs: Math.round(video.duration * 1000),
      };
      release();
      // An audio-only file, or a stream with no fixed duration, is no MediaFile.
      if (!facts.width || !facts.height || !Number.isFinite(facts.durationMs) || facts.durationMs <= 0) {
        reject(new Error("not a video"));
      } else {
        resolve(facts);
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      release();
      reject(new Error("unreadable"));
    };
    video.src = src;
  });
}

export function probeImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error("empty"));
      else resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("unreadable"));
    };
    image.src = src;
  });
}

/** The MIME a linked URL's extension implies, for the type menu's default. */
export function mimeFromExtension(url: string, kind: "video" | "image"): string | undefined {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
  const extension = match?.[1]?.toLowerCase();
  if (!extension) return undefined;
  const table: Record<string, string> =
    kind === "video"
      ? { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm" }
      : { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };
  return Object.hasOwn(table, extension) ? table[extension] : undefined;
}

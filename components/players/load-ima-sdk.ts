/**
 * Exported because it is the answer to "what do I allow?" when a blocker eats
 * the SDK — the preview panel quotes it verbatim in its notice, and a URL a
 * viewer is asked to copy must be the one the code actually requests.
 */
export const IMA_SDK_SRC = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

/**
 * Long enough for a cold CDN fetch on a slow link, short enough that a request
 * nobody is ever going to answer surfaces as an error instead of a status line
 * that says "loading" until the preview token expires.
 */
const LOAD_TIMEOUT_MS = 12_000;

/**
 * Why the SDK is not on the page. `blocked` covers both the request being
 * refused and it being answered with something that is not the SDK — from here
 * those are indistinguishable, and the thing to check is the same either way.
 */
export type ImaSdkLoadFailure = "blocked" | "timeout";

export class ImaSdkLoadError extends Error {
  constructor(readonly reason: ImaSdkLoadFailure) {
    super(`Google IMA SDK unavailable (${reason})`);
    this.name = "ImaSdkLoadError";
  }
}

let imaSdkPromise: Promise<void> | null = null;

/** Present *and* exposing what we actually call on it. */
function imaReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.google?.ima?.AdsLoader === "function"
  );
}

/**
 * Load Google's IMA SDK from its CDN exactly once per page. Shared by
 * ImaPlayer.tsx (configurator preview) and ValidatorStage.tsx (VAST validator).
 *
 * Rejects with an `ImaSdkLoadError` and nothing else, so a caller can report a
 * load failure as a load failure without guessing: everything that happens
 * after the SDK is on the page is the caller's own to catch.
 */
export function loadImaSdk(): Promise<void> {
  if (imaReady()) return Promise.resolve();
  if (!imaSdkPromise) {
    imaSdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");

      // A timed-out attempt is settled but its <script> is still live: removing
      // the element does not cancel a load in flight, so `onload`/`onerror` can
      // still fire minutes later. Without this guard that late event would
      // null out whatever attempt is current *by then* — a Restart's in-flight
      // promise — and the next caller would start a duplicate load.
      let settled = false;

      const fail = (reason: ImaSdkLoadFailure) => {
        if (settled) return;
        settled = true;
        // Drop the cached promise so a later Launch/Restart gets a fresh
        // attempt rather than replaying this rejection forever.
        imaSdkPromise = null;
        reject(new ImaSdkLoadError(reason));
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const timer = setTimeout(() => fail("timeout"), LOAD_TIMEOUT_MS);

      script.src = IMA_SDK_SRC;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        // An extension that answers this request with an empty 200 or a stub
        // fires `onload` exactly like a real load does. Only the SDK being
        // callable counts as loaded — otherwise the failure resurfaces further
        // down as a ReferenceError from whichever line touches `google.ima`
        // first, and gets reported as whatever that line happened to be doing.
        if (imaReady()) succeed();
        else fail("blocked");
      };
      script.onerror = () => {
        clearTimeout(timer);
        fail("blocked");
      };

      document.head.appendChild(script);
    });
  }
  return imaSdkPromise;
}

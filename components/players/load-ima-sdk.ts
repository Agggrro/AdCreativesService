const IMA_SDK_SRC = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

let imaSdkPromise: Promise<void> | null = null;

/**
 * Load Google's IMA SDK from its CDN exactly once per page. Both ImaPlayer
 * (direct integration) and VideoJsPlayer (videojs-ima, which does not bundle
 * the SDK itself — see its README) need it loaded first.
 */
export function loadImaSdk(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.ima) return Promise.resolve();
  if (!imaSdkPromise) {
    imaSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = IMA_SDK_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        imaSdkPromise = null;
        reject(new Error("Failed to load the Google IMA SDK"));
      };
      document.head.appendChild(script);
    });
  }
  return imaSdkPromise;
}

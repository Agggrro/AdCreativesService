const IMA_SDK_SRC = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";

let imaSdkPromise: Promise<void> | null = null;

/**
 * Load Google's IMA SDK from its CDN exactly once per page. Used by
 * ImaPlayer.tsx's direct IMA SDK integration.
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

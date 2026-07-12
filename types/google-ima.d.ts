// Minimal ambient types for the Google IMA SDK for HTML5 (loaded at runtime
// from https://imasdk.googleapis.com/js/sdkloader/ima3.js — no @types package
// exists for it). Covers only the surface components/players/*.tsx actually
// use; the full SDK surface is much larger.

export {};

declare global {
  namespace google.ima {
    class AdDisplayContainer {
      constructor(containerElement: HTMLElement, videoElement?: HTMLVideoElement);
      initialize(): void;
    }

    class AdsRequest {
      adTagUrl?: string;
      adsResponse?: string;
      linearAdSlotWidth?: number;
      linearAdSlotHeight?: number;
      nonLinearAdSlotWidth?: number;
      nonLinearAdSlotHeight?: number;
    }

    class AdError {
      getMessage(): string;
      getErrorCode(): number;
      getInnerError(): unknown;
    }

    class AdErrorEvent {
      static Type: { AD_ERROR: string };
      getError(): AdError;
    }

    class AdEvent {
      static Type: {
        CONTENT_PAUSE_REQUESTED: string;
        CONTENT_RESUME_REQUESTED: string;
        ALL_ADS_COMPLETED: string;
        CLICK: string;
        STARTED: string;
        COMPLETE: string;
        SKIPPED: string;
      };
    }

    class AdsManager {
      init(width: number, height: number, viewMode: string): void;
      start(): void;
      stop(): void;
      destroy(): void;
      addEventListener(
        type: string,
        listener: (event: AdEvent | AdErrorEvent) => void,
      ): void;
    }

    class AdsManagerLoadedEvent {
      static Type: { ADS_MANAGER_LOADED: string };
      getAdsManager(videoElement: HTMLVideoElement): AdsManager;
    }

    class AdsLoader {
      constructor(adDisplayContainer: AdDisplayContainer);
      addEventListener(
        type: string,
        listener: (event: AdsManagerLoadedEvent | AdErrorEvent) => void,
        useCapture?: boolean,
      ): void;
      requestAds(request: AdsRequest): void;
      destroy(): void;
    }

    class ImaSdkSettings {
      setVpaidMode(mode: number): void;
    }
    namespace ImaSdkSettings {
      const VpaidMode: { DISABLED: number; ENABLED: number; INSECURE: number };
    }

    const settings: ImaSdkSettings;

    namespace ViewMode {
      const NORMAL: string;
    }
  }

  interface Window {
    google?: typeof google;
  }
}

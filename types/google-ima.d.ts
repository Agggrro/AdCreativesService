// Ambient types for the Google IMA SDK for HTML5 (loaded at runtime from
// https://imasdk.googleapis.com/js/sdkloader/ima3.js — no @types package exists
// for it).
//
// Covers what components/players/*.tsx and components/validator/*.tsx use. The
// validator needs far more of the surface than the configurator preview did:
// the whole point of its timeline is that IMA reports the ad lifecycle in more
// detail than any other player we host, so the full AdEvent.Type set and the Ad
// metadata accessors are load-bearing rather than speculative.
//
// The full SDK surface is larger still; add to this file rather than reaching
// for `any`, which would defeat the reason these declarations exist.

export {};

declare global {
  namespace google.ima {
    class AdDisplayContainer {
      constructor(containerElement: HTMLElement, videoElement?: HTMLVideoElement);
      initialize(): void;
      destroy(): void;
    }

    class AdsRequest {
      adTagUrl?: string;
      adsResponse?: string;
      linearAdSlotWidth?: number;
      linearAdSlotHeight?: number;
      nonLinearAdSlotWidth?: number;
      nonLinearAdSlotHeight?: number;
      forceNonLinearFullSlot?: boolean;
      vastLoadTimeout?: number;
      omidAccessModeRules?: Record<string, string>;
      setAdWillAutoPlay(willAutoPlay: boolean): void;
      setAdWillPlayMuted(willPlayMuted: boolean): void;
      setContinuousPlayback(continuousPlayback: boolean): void;
    }

    class AdsRenderingSettings {
      restoreCustomPlaybackStateOnAdBreakComplete?: boolean;
      enablePreloading?: boolean;
      loadVideoTimeout?: number;
      bitrate?: number;
      mimeTypes?: string[];
      uiElements?: string[];
      useStyledLinearAds?: boolean;
      useStyledNonLinearAds?: boolean;
    }

    class AdError {
      getMessage(): string;
      getErrorCode(): number;
      getVastErrorCode(): number;
      getType(): string;
      getInnerError(): unknown;
    }

    class AdErrorEvent {
      static Type: { AD_ERROR: string };
      getError(): AdError;
    }

    /**
     * What IMA resolved the tag to, after following every wrapper.
     *
     * This is what makes the validator's parser-versus-player cross-check
     * possible: our own parse says what the XML declares, and these accessors
     * say what a real SDK actually took from it. Where the two disagree, the
     * disagreement is the finding.
     */
    class Ad {
      getAdId(): string;
      getAdSystem(): string;
      getApiFramework(): string | null;
      getContentType(): string;
      getCreativeAdId(): string;
      getCreativeId(): string;
      getDealId(): string;
      getDescription(): string;
      getDuration(): number;
      getHeight(): number;
      getWidth(): number;
      getMediaUrl(): string;
      getMinSuggestedDuration(): number;
      getSkipTimeOffset(): number;
      getTitle(): string;
      getAdvertiserName(): string;
      getUniversalAdIdRegistry(): string;
      getUniversalAdIdValue(): string;
      getVastMediaBitrate(): number;
      getVastMediaHeight(): number;
      getVastMediaWidth(): number;
      getWrapperAdIds(): string[];
      getWrapperAdSystems(): string[];
      getWrapperCreativeIds(): string[];
      isLinear(): boolean;
      isSkippable(): boolean;
    }

    class AdEvent {
      static Type: {
        AD_BREAK_READY: string;
        AD_BUFFERING: string;
        AD_CAN_PLAY: string;
        AD_METADATA: string;
        AD_PROGRESS: string;
        ALL_ADS_COMPLETED: string;
        CLICK: string;
        COMPLETE: string;
        CONTENT_PAUSE_REQUESTED: string;
        CONTENT_RESUME_REQUESTED: string;
        DURATION_CHANGE: string;
        FIRST_QUARTILE: string;
        IMPRESSION: string;
        INTERACTION: string;
        LINEAR_CHANGED: string;
        LOADED: string;
        /** IMA's own non-fatal diagnostics — carried in getAdData(). */
        LOG: string;
        MIDPOINT: string;
        PAUSED: string;
        RESUMED: string;
        SKIPPABLE_STATE_CHANGED: string;
        SKIPPED: string;
        STARTED: string;
        THIRD_QUARTILE: string;
        USER_CLOSE: string;
        VIDEO_CLICKED: string;
        VIDEO_ICON_CLICKED: string;
        VIEWABLE_IMPRESSION: string;
        VOLUME_CHANGED: string;
        VOLUME_MUTED: string;
      };
      type: string;
      getAd(): Ad | null;
      /** Populated for LOG and AD_PROGRESS; shape varies by event. */
      getAdData(): Record<string, unknown> | null;
    }

    class AdsManager {
      init(width: number, height: number, viewMode: string): void;
      start(): void;
      stop(): void;
      pause(): void;
      resume(): void;
      skip(): void;
      destroy(): void;
      resize(width: number, height: number, viewMode: string): void;
      getRemainingTime(): number;
      getVolume(): number;
      setVolume(volume: number): void;
      getAdSkippableState(): boolean;
      getCuePoints(): number[];
      addEventListener(
        type: string,
        listener: (event: AdEvent | AdErrorEvent) => void,
      ): void;
      removeEventListener(
        type: string,
        listener: (event: AdEvent | AdErrorEvent) => void,
      ): void;
    }

    class AdsManagerLoadedEvent {
      static Type: { ADS_MANAGER_LOADED: string };
      getAdsManager(
        contentPlayback: HTMLVideoElement,
        adsRenderingSettings?: AdsRenderingSettings,
      ): AdsManager;
    }

    class AdsLoader {
      constructor(adDisplayContainer: AdDisplayContainer);
      addEventListener(
        type: string,
        listener: (event: AdsManagerLoadedEvent | AdErrorEvent) => void,
        useCapture?: boolean,
      ): void;
      requestAds(request: AdsRequest): void;
      contentComplete(): void;
      destroy(): void;
    }

    class ImaSdkSettings {
      setVpaidMode(mode: number): void;
      setLocale(locale: string): void;
      setNumRedirects(redirects: number): void;
      setPlayerType(type: string): void;
      setPlayerVersion(version: string): void;
      setAutoPlayAdBreaks(autoPlay: boolean): void;
    }
    namespace ImaSdkSettings {
      const VpaidMode: { DISABLED: number; ENABLED: number; INSECURE: number };
    }

    const settings: ImaSdkSettings;

    namespace ViewMode {
      const NORMAL: string;
      const FULLSCREEN: string;
    }
  }

  interface Window {
    google?: typeof google;
  }
}

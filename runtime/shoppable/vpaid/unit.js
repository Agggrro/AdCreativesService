/**
 * AdInteract — Shoppable Video, VPAID 2.0 unit.
 *
 * A minimal, spec-compliant VPAID ad: plays the configured video and overlays a
 * "Shop Now" badge; clicking it fires AdClickThru to the click-through URL.
 * Config is injected via VAST <AdParameters> (creativeData.AdParameters), never
 * baked in. Reference implementation — validate against your target player
 * (e.g. Google IMA). Legacy standard, see ADR-0002.
 */
var getVPAIDAd = function () {
  return new ShoppableVpaid();
};

function ShoppableVpaid() {
  this._slot = null;
  this._videoSlot = null;
  this._params = {};
  this._attributes = {
    width: 640,
    height: 360,
    viewMode: "normal",
    volume: 1.0,
    duration: 30,
    expanded: false,
    remainingTime: 30,
  };
  this._quartiles = { start: false, q1: false, q2: false, q3: false };
  this._callbacks = {};
}

ShoppableVpaid.prototype.handshakeVersion = function () {
  return "2.0";
};

ShoppableVpaid.prototype.initAd = function (
  width,
  height,
  viewMode,
  desiredBitrate,
  creativeData,
  environmentVars,
) {
  this._attributes.width = width;
  this._attributes.height = height;
  this._attributes.viewMode = viewMode;
  this._slot = environmentVars.slot;
  this._videoSlot = environmentVars.videoSlot;

  try {
    this._params = JSON.parse((creativeData && creativeData.AdParameters) || "{}");
  } catch (e) {
    this._params = {};
  }
  if (this._params.durationSeconds) {
    this._attributes.duration = Number(this._params.durationSeconds);
    this._attributes.remainingTime = this._attributes.duration;
  }

  this._setupVideo();
  this._emit("AdLoaded");
};

ShoppableVpaid.prototype._setupVideo = function () {
  var video = this._videoSlot;
  if (!video) return;
  if (this._params.videoUrl) {
    video.src = this._params.videoUrl;
  }
  var self = this;
  video.addEventListener("timeupdate", function () {
    self._onTimeUpdate();
  });
  video.addEventListener("ended", function () {
    self._emit("AdVideoComplete");
    self._emit("AdStopped");
  });
};

ShoppableVpaid.prototype.startAd = function () {
  this._renderOverlay();
  if (this._videoSlot) {
    var p = this._videoSlot.play();
    if (p && p.catch) p.catch(function () {});
  }
  this._emit("AdStarted");
  this._emit("AdImpression");
};

ShoppableVpaid.prototype._renderOverlay = function () {
  if (!this._slot) return;
  var self = this;
  var btn = document.createElement("button");
  btn.textContent = this._params.productName
    ? "Shop Now — " + this._params.productName
    : "Shop Now";
  btn.style.cssText =
    "position:absolute;right:12px;bottom:12px;z-index:2;padding:8px 14px;" +
    "border:0;border-radius:6px;background:#000;color:#fff;font:600 14px sans-serif;" +
    "cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)";
  btn.addEventListener("click", function () {
    self._emit("AdClickThru", [self._params.clickThroughUrl || "", "", true]);
  });

  if (getComputedStyle(this._slot).position === "static") {
    this._slot.style.position = "relative";
  }
  this._slot.appendChild(btn);
};

ShoppableVpaid.prototype._onTimeUpdate = function () {
  var v = this._videoSlot;
  if (!v || !v.duration) return;
  this._attributes.remainingTime = v.duration - v.currentTime;
  var pct = v.currentTime / v.duration;
  if (!this._quartiles.start && pct > 0) {
    this._quartiles.start = true;
    this._emit("AdVideoStart");
  }
  if (!this._quartiles.q1 && pct >= 0.25) {
    this._quartiles.q1 = true;
    this._emit("AdVideoFirstQuartile");
  }
  if (!this._quartiles.q2 && pct >= 0.5) {
    this._quartiles.q2 = true;
    this._emit("AdVideoMidpoint");
  }
  if (!this._quartiles.q3 && pct >= 0.75) {
    this._quartiles.q3 = true;
    this._emit("AdVideoThirdQuartile");
  }
};

ShoppableVpaid.prototype.stopAd = function () {
  this._emit("AdStopped");
};
ShoppableVpaid.prototype.skipAd = function () {
  this._emit("AdSkipped");
  this._emit("AdStopped");
};
ShoppableVpaid.prototype.resizeAd = function (width, height, viewMode) {
  this._attributes.width = width;
  this._attributes.height = height;
  this._attributes.viewMode = viewMode;
  this._emit("AdSizeChange");
};
ShoppableVpaid.prototype.pauseAd = function () {
  if (this._videoSlot) this._videoSlot.pause();
  this._emit("AdPaused");
};
ShoppableVpaid.prototype.resumeAd = function () {
  if (this._videoSlot) this._videoSlot.play();
  this._emit("AdPlaying");
};
ShoppableVpaid.prototype.expandAd = function () {};
ShoppableVpaid.prototype.collapseAd = function () {};

// Property getters required by the VPAID interface.
ShoppableVpaid.prototype.getAdLinear = function () {
  return true;
};
ShoppableVpaid.prototype.getAdWidth = function () {
  return this._attributes.width;
};
ShoppableVpaid.prototype.getAdHeight = function () {
  return this._attributes.height;
};
ShoppableVpaid.prototype.getAdExpanded = function () {
  return this._attributes.expanded;
};
ShoppableVpaid.prototype.getAdSkippableState = function () {
  return false;
};
ShoppableVpaid.prototype.getAdRemainingTime = function () {
  return this._attributes.remainingTime;
};
ShoppableVpaid.prototype.getAdDuration = function () {
  return this._attributes.duration;
};
ShoppableVpaid.prototype.getAdVolume = function () {
  return this._attributes.volume;
};
ShoppableVpaid.prototype.setAdVolume = function (volume) {
  this._attributes.volume = volume;
  if (this._videoSlot) this._videoSlot.volume = volume;
  this._emit("AdVolumeChange");
};
ShoppableVpaid.prototype.getAdCompanions = function () {
  return "";
};
ShoppableVpaid.prototype.getAdIcons = function () {
  return false;
};

// Event subscription.
ShoppableVpaid.prototype.subscribe = function (callback, event, context) {
  this._callbacks[event] = { fn: callback, ctx: context };
};
ShoppableVpaid.prototype.unsubscribe = function (event) {
  delete this._callbacks[event];
};
ShoppableVpaid.prototype._emit = function (event, args) {
  var cb = this._callbacks[event];
  if (cb && typeof cb.fn === "function") {
    cb.fn.apply(cb.ctx || null, args || []);
  }
};

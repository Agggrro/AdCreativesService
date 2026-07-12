/**
 * AdInteract — shared VPAID 2.0 base.
 *
 * Concatenated AFTER a per-template render module (which defines `var TEMPLATE`)
 * by runtime/build.mjs. The template only implements `onStart(slot, params, api)`;
 * this base provides the full VPAID interface, quartile events (video- OR
 * timer-driven when there is no video), and the click helper.
 *
 * `api` given to onStart: { params, slot, videoSlot, clickThrough(url?), emit(e,a) }
 * Config arrives via VAST <AdParameters> (creativeData.AdParameters). ADR-0005.
 */
function AdInteractVpaid(template) {
  this._t = template || {};
  this._slot = null;
  this._videoSlot = null;
  this._params = {};
  this._attributes = {
    width: 640,
    height: 360,
    viewMode: "normal",
    volume: 1.0,
    duration: 15,
    expanded: false,
    remainingTime: 15,
  };
  this._q = { start: false, q1: false, q2: false, q3: false, done: false };
  this._cb = {};
  this._timer = null;
  this._startedAt = 0;
}

AdInteractVpaid.prototype.handshakeVersion = function () {
  return "2.0";
};

AdInteractVpaid.prototype.initAd = function (
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
  this._slot = environmentVars && environmentVars.slot;
  this._videoSlot = environmentVars && environmentVars.videoSlot;

  try {
    this._params = JSON.parse((creativeData && creativeData.AdParameters) || "{}");
  } catch (e) {
    this._params = {};
  }
  var d = Number(this._params.durationSeconds) || this._t.duration || 15;
  this._attributes.duration = d;
  this._attributes.remainingTime = d;

  if (this._params.videoUrl && this._videoSlot) this._setupVideo();
  this._emit("AdLoaded");
};

AdInteractVpaid.prototype._setupVideo = function () {
  var self = this,
    v = this._videoSlot;
  v.src = this._params.videoUrl;
  v.addEventListener("timeupdate", function () {
    self._onVideoTime();
  });
  v.addEventListener("ended", function () {
    self._complete();
  });
};

AdInteractVpaid.prototype._api = function () {
  var self = this;
  return {
    params: this._params,
    slot: this._slot,
    videoSlot: this._videoSlot,
    clickThrough: function (url) {
      self._emit("AdClickThru", [
        url || self._params.clickThroughUrl || "",
        "",
        true,
      ]);
    },
    emit: function (e, a) {
      self._emit(e, a);
    },
  };
};

AdInteractVpaid.prototype.startAd = function () {
  if (this._slot && getComputedStyle(this._slot).position === "static") {
    this._slot.style.position = "relative";
  }
  try {
    if (this._t.onStart) this._t.onStart(this._slot, this._params, this._api());
  } catch (e) {
    /* never let template errors break the ad lifecycle */
  }
  this._emit("AdStarted");
  this._emit("AdImpression");
  this._emit("AdVideoStart");
  this._q.start = true;

  if (this._params.videoUrl && this._videoSlot) {
    var p = this._videoSlot.play();
    if (p && p.catch) p.catch(function () {});
  } else {
    this._startTimer();
  }
};

AdInteractVpaid.prototype._startTimer = function () {
  var self = this;
  this._startedAt = Date.now();
  this._timer = setInterval(function () {
    var pct =
      (Date.now() - self._startedAt) / 1000 / self._attributes.duration;
    self._attributes.remainingTime = Math.max(
      0,
      self._attributes.duration * (1 - pct),
    );
    self._progress(pct);
    if (pct >= 1) self._complete();
  }, 250);
};

AdInteractVpaid.prototype._onVideoTime = function () {
  var v = this._videoSlot;
  if (!v || !v.duration) return;
  this._attributes.remainingTime = v.duration - v.currentTime;
  this._progress(v.currentTime / v.duration);
};

AdInteractVpaid.prototype._progress = function (pct) {
  if (!this._q.q1 && pct >= 0.25) {
    this._q.q1 = true;
    this._emit("AdVideoFirstQuartile");
  }
  if (!this._q.q2 && pct >= 0.5) {
    this._q.q2 = true;
    this._emit("AdVideoMidpoint");
  }
  if (!this._q.q3 && pct >= 0.75) {
    this._q.q3 = true;
    this._emit("AdVideoThirdQuartile");
  }
};

AdInteractVpaid.prototype._complete = function () {
  if (this._q.done) return;
  this._q.done = true;
  if (this._timer) {
    clearInterval(this._timer);
    this._timer = null;
  }
  this._emit("AdVideoComplete");
};

AdInteractVpaid.prototype.stopAd = function () {
  if (this._timer) clearInterval(this._timer);
  this._emit("AdStopped");
};
AdInteractVpaid.prototype.skipAd = function () {
  this._emit("AdSkipped");
  this._emit("AdStopped");
};
AdInteractVpaid.prototype.resizeAd = function (width, height, viewMode) {
  this._attributes.width = width;
  this._attributes.height = height;
  this._attributes.viewMode = viewMode;
  this._emit("AdSizeChange");
};
AdInteractVpaid.prototype.pauseAd = function () {
  if (this._videoSlot) this._videoSlot.pause();
  this._emit("AdPaused");
};
AdInteractVpaid.prototype.resumeAd = function () {
  if (this._videoSlot) this._videoSlot.play();
  this._emit("AdPlaying");
};
AdInteractVpaid.prototype.expandAd = function () {};
AdInteractVpaid.prototype.collapseAd = function () {};

AdInteractVpaid.prototype.getAdLinear = function () {
  return true;
};
AdInteractVpaid.prototype.getAdWidth = function () {
  return this._attributes.width;
};
AdInteractVpaid.prototype.getAdHeight = function () {
  return this._attributes.height;
};
AdInteractVpaid.prototype.getAdExpanded = function () {
  return this._attributes.expanded;
};
AdInteractVpaid.prototype.getAdSkippableState = function () {
  return false;
};
AdInteractVpaid.prototype.getAdRemainingTime = function () {
  return this._attributes.remainingTime;
};
AdInteractVpaid.prototype.getAdDuration = function () {
  return this._attributes.duration;
};
AdInteractVpaid.prototype.getAdVolume = function () {
  return this._attributes.volume;
};
AdInteractVpaid.prototype.setAdVolume = function (volume) {
  this._attributes.volume = volume;
  if (this._videoSlot) this._videoSlot.volume = volume;
  this._emit("AdVolumeChange");
};
AdInteractVpaid.prototype.getAdCompanions = function () {
  return "";
};
AdInteractVpaid.prototype.getAdIcons = function () {
  return false;
};

AdInteractVpaid.prototype.subscribe = function (callback, event, context) {
  this._cb[event] = { fn: callback, ctx: context };
};
AdInteractVpaid.prototype.unsubscribe = function (event) {
  delete this._cb[event];
};
AdInteractVpaid.prototype._emit = function (event, args) {
  var c = this._cb[event];
  if (c && typeof c.fn === "function") c.fn.apply(c.ctx || null, args || []);
};

// The player entry point. TEMPLATE is defined by the concatenated render module.
var getVPAIDAd = function () {
  return new AdInteractVpaid(typeof TEMPLATE !== "undefined" ? TEMPLATE : {});
};

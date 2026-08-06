/**
 * AdInteract — shared VPAID 2.0 base.
 *
 * Concatenated AFTER a per-template render module (which defines `var TEMPLATE`)
 * by runtime/build.mjs. The template only implements `onStart(slot, params, api)`;
 * this base provides the full VPAID interface, quartile events (video- OR
 * timer-driven when there is no video), the click helper, a shared media-layer
 * helper (image or video URL → a rendered element), and the mandatory close
 * control (ADR-0009).
 *
 * `api` given to onStart: { params, slot, videoSlot, clickThrough(url?), emit(e,a) }
 * Config arrives via VAST <AdParameters> (creativeData.AdParameters). ADR-0005.
 */

/**
 * A URL whose path looks like a video file. GIF and every static raster/vector
 * format (jpg/png/webp/avif/svg) already animate or render fine as a CSS
 * `background-image` — only real video containers need a `<video>` element
 * instead, since `background-image` cannot play one.
 */
function adInteractIsVideoUrl(url) {
  return typeof url === "string" && /\.(webm|mp4|m4v|mov|ogv)(\?|#|$)/i.test(url);
}

/**
 * A `url('...')` CSS token for an advertiser-supplied URL. A literal `'` is
 * legal in a URL but would otherwise terminate the quoted token early and
 * silently fail to parse (blank background, no error) — escape it and any
 * backslash rather than assume advertiser input never contains one.
 */
function adInteractCssUrl(url) {
  return "url('" + String(url).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "')";
}

/**
 * One image/gif/video URL → a filled (`width:100%;height:100%`) element ready
 * to drop into a positioned wrapper. Every template's "picture" fields
 * (background, before/after, option thumbnails, reveal image, …) go through
 * this so gif/webm/mp4 "instead of a picture" works everywhere without each
 * template reimplementing the type sniff.
 */
function adInteractMediaLayer(url) {
  var el;
  if (adInteractIsVideoUrl(url)) {
    el = document.createElement("video");
    el.src = url;
    el.autoplay = true;
    el.loop = true;
    el.muted = true;
    el.setAttribute("muted", "");
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.style.cssText =
      "display:block;width:100%;height:100%;object-fit:cover;background:#000;";
    var p = el.play();
    if (p && p.catch) p.catch(function () {});
  } else {
    el = document.createElement("div");
    el.style.cssText = "width:100%;height:100%;background:#000 center/cover no-repeat;";
    if (url) el.style.backgroundImage = adInteractCssUrl(url);
  }
  return el;
}

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
  this._closed = false;
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
    // For a template's own early-end UI (e.g. age-gate's "Leave"): ends the
    // ad the same way the host calling stopAd() would — timer cleared,
    // AdStopped fired — rather than a raw emit() that leaves the quartile
    // timer running past the point the template itself declared the ad over.
    stop: function () {
      self.stopAd();
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
  try {
    // Same guard as onStart above: this does real DOM/SVG work (including a
    // forced-reflow read), and must never block AdStarted/AdImpression from
    // firing if it throws in some unusual host.
    this._mountCloseControl();
  } catch (e) {
    /* never let the close control break the ad lifecycle */
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

/** Shared by every terminal path (stop, skip, the mandatory close, a template's own early-end UI) so the quartile timer never outlives the ad it was tracking. */
AdInteractVpaid.prototype._teardown = function () {
  this._closed = true;
  if (this._timer) {
    clearInterval(this._timer);
    this._timer = null;
  }
};
AdInteractVpaid.prototype.stopAd = function () {
  this._teardown();
  this._emit("AdStopped");
};
AdInteractVpaid.prototype.skipAd = function () {
  this._teardown();
  this._emit("AdSkipped");
  this._emit("AdStopped");
};

/**
 * The close control every creative gets, mandatory, built once here rather
 * than per template (ADR-0009). A tidy "×" in the corner, disabled behind a
 * ring that fills over `closeDelaySeconds` (default 5, not yet a creative
 * setting — read from AdParameters so a future setting needs no runtime
 * change). Clicking it once live tears down the creative like a user-
 * initiated skip: no auto-expiry, no forced completion, the viewer decides.
 */
AdInteractVpaid.prototype._mountCloseControl = function () {
  var self = this;
  var slot = this._slot;
  if (!slot) return;

  // Clamped even though no template exposes this yet: it lands directly in a
  // CSS transition duration and a setTimeout delay, and an unvalidated huge
  // value would cross setTimeout's ~24.8-day int32 overflow and fire
  // immediately — the opposite of a "mandatory" delay.
  var delaySeconds = Math.min(Math.max(Number(this._params.closeDelaySeconds) || 5, 1), 30);
  var SIZE = 26,
    R = 11,
    C = 2 * Math.PI * R;
  var svgNS = "http://www.w3.org/2000/svg";

  var host = document.createElement("div");
  host.style.cssText =
    "position:absolute;top:10px;right:10px;z-index:2147483000;width:" +
    SIZE +
    "px;height:" +
    SIZE +
    "px;";

  var svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", SIZE);
  svg.setAttribute("height", SIZE);
  svg.setAttribute("viewBox", "0 0 " + SIZE + " " + SIZE);
  svg.style.cssText =
    "position:absolute;inset:0;transform:rotate(-90deg);pointer-events:none;";

  var track = document.createElementNS(svgNS, "circle");
  track.setAttribute("cx", SIZE / 2);
  track.setAttribute("cy", SIZE / 2);
  track.setAttribute("r", R);
  track.setAttribute("fill", "rgba(0,0,0,.38)");
  track.setAttribute("stroke", "rgba(255,255,255,.3)");
  track.setAttribute("stroke-width", "1.5");
  svg.appendChild(track);

  var ring = document.createElementNS(svgNS, "circle");
  ring.setAttribute("cx", SIZE / 2);
  ring.setAttribute("cy", SIZE / 2);
  ring.setAttribute("r", R);
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "#fff");
  ring.setAttribute("stroke-width", "1.5");
  ring.setAttribute("stroke-linecap", "round");
  ring.setAttribute("stroke-dasharray", C);
  ring.setAttribute("stroke-dashoffset", C);
  ring.style.cssText = "transition:stroke-dashoffset " + delaySeconds + "s linear;";
  svg.appendChild(ring);
  host.appendChild(svg);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Close");
  btn.disabled = true;
  btn.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
    "border:0;border-radius:50%;background:transparent;padding:0;margin:0;" +
    "cursor:default;opacity:.5;transition:opacity .25s ease;" +
    "font:400 15px/1 Arial,sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;";
  btn.textContent = "×";
  btn.addEventListener("click", function () {
    if (btn.disabled) return;
    self._closeCreative();
  });
  host.appendChild(btn);

  slot.appendChild(host);

  // Force layout before flipping the target value, so the browser has
  // committed the ring's initial (full) offset before the transition starts.
  // A forced reflow (not requestAnimationFrame) works even when the host
  // page isn't actively compositing frames — rAF alone can silently never
  // fire there, leaving the ring stuck full forever.
  void ring.getBoundingClientRect();
  ring.style.strokeDashoffset = "0";

  setTimeout(function () {
    if (self._closed) return;
    btn.disabled = false;
    btn.style.cursor = "pointer";
    btn.style.opacity = "1";
  }, delaySeconds * 1000);
};

AdInteractVpaid.prototype._closeCreative = function () {
  if (this._closed) return;
  if (this._videoSlot) {
    try {
      this._videoSlot.pause();
    } catch (e) {
      /* noop */
    }
  }
  if (this._slot) this._slot.innerHTML = "";
  this.skipAd();
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

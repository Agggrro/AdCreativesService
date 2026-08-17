/**
 * CreoSmith — shared VPAID 2.0 base.
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

/**
 * The origin this unit was served from.
 *
 * Captured here, at top level, because `document.currentScript` is only valid
 * while the script is still executing — read it from inside a method later and
 * it is null. The built unit is one concatenated file, so this runs in the same
 * synchronous pass as everything else in it.
 *
 * Null when a player injects the unit some way that has no script element
 * (`eval`, a fetched string). Telemetry then stays silent rather than guessing
 * an origin, which is the only safe failure mode: a wrong guess would be a
 * message sent somewhere we did not intend.
 */
var CREOSMITH_ORIGIN = (function () {
  try {
    var script = document.currentScript;
    if (!script || !script.src) return null;
    var origin = new URL(script.src, document.baseURI).origin;
    // `origin` is the *string* "null" for a `data:` or `blob:null/...` src.
    // That is not a parseable URL, so passing it to postMessage would throw a
    // SyntaxError rather than fail the origin check — failing closed by
    // accident instead of by design.
    return origin && origin !== "null" ? origin : null;
  } catch (e) {
    return null;
  }
})();

/**
 * Whether `w` is a window we are allowed to talk to — i.e. one of our own pages.
 *
 * This exists because a mismatched `targetOrigin` is not silent. The delivery
 * itself is: the HTML spec's post-message steps return without dispatching when
 * the recipient's origin does not match. But Chromium and Firefox both write a
 * console **error** for the attempt, so posting blindly would print one or two
 * errors per lifecycle event on the publisher's page, on every impression —
 * exactly the noise ADR-0019 promises never to make. In a player that runs the
 * unit in the top-level document there is not even an iframe to attribute them
 * to.
 *
 * Reading `w.location.origin` across origins throws a SecurityError, which is
 * caught here and logs nothing. So this asks the question quietly, and a target
 * that is not ours is simply never posted to: in production the channel makes
 * zero postMessage calls and produces zero console output.
 */
function adInteractReachable(w) {
  try {
    return !!w && w.location.origin === CREOSMITH_ORIGIN;
  } catch (e) {
    return false;
  }
}

/**
 * Force a value into something `postMessage`'s structured clone can carry.
 * A template calling `api.debug()` with a DOM node or anything cyclic would
 * otherwise throw inside postMessage and silently drop the record.
 */
function adInteractCloneable(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return String(value);
  }
}

function CreoSmithVpaid(template) {
  this._t = template || {};
  // Start of this run, and an id for it. Only ever one unit is live per page —
  // `getVPAIDAd` is a global, so a second would take over the first's factory —
  // but records still have to be attributable to a run: a host that remounts to
  // re-run (the harness, and React StrictMode's double mount) has the previous
  // unit's teardown record still in flight when the next one starts.
  this._epoch = Date.now();
  this._runId = "r" + Math.random().toString(36).slice(2, 8);
  this._seq = 0;
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
  this._viewObserver = null;
  this._viewTimer = null;
  this._viewableFired = false;
  this._onVisibilityChange = null;
}

CreoSmithVpaid.prototype.handshakeVersion = function () {
  return "2.0";
};

CreoSmithVpaid.prototype.initAd = function (
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

CreoSmithVpaid.prototype._setupVideo = function () {
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

CreoSmithVpaid.prototype._api = function () {
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
    // A template's own state, reported on the same origin-locked channel as
    // the VPAID lifecycle (ADR-0019). The lifecycle says an ad started; this
    // says which quiz branch the viewer took, how much of the cover has been
    // scratched, where the slider sits — the things that actually go wrong
    // when a template is being built, and that no VPAID event can express.
    // Namespaced `tpl:` so a template can never shadow a lifecycle event.
    // `String(name)` because the concatenation happens outside `_report`'s own
    // guard, and most api.debug calls sit in a template's event handlers rather
    // than inside startAd's try — so a non-string name would throw a TypeError
    // straight into a click handler.
    debug: function (name, data) {
      self._report("tpl:" + String(name), data);
    },
  };
};

CreoSmithVpaid.prototype.startAd = function () {
  if (this._slot && getComputedStyle(this._slot).position === "static") {
    this._slot.style.position = "relative";
  }
  // These three stay swallowed — the ad lifecycle must survive all of them —
  // but they are no longer swallowed *silently*. A template throwing in onStart
  // is precisely the failure ADR-0019's channel exists to make legible, and
  // without a record it is indistinguishable from the unit never having loaded:
  // both leave a slot that drew nothing. `_report` is safe to call from a catch
  // by construction.
  try {
    if (this._t.onStart) this._t.onStart(this._slot, this._params, this._api());
  } catch (e) {
    this._report("error", { at: "onStart", message: String((e && e.message) || e) });
  }
  try {
    // Same guard as onStart above: this does real DOM/SVG work (including a
    // forced-reflow read), and must never block AdStarted/AdImpression from
    // firing if it throws in some unusual host.
    this._mountCloseControl();
  } catch (e) {
    this._report("error", {
      at: "closeControl",
      message: String((e && e.message) || e),
    });
  }
  try {
    // Self-reported viewability (ADR-0012), not OMID-accredited: never let a
    // player without IntersectionObserver (or a missing beacon URL) break the
    // ad lifecycle either.
    this._startViewabilityObserver();
  } catch (e) {
    this._report("error", {
      at: "viewability",
      message: String((e && e.message) || e),
    });
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

CreoSmithVpaid.prototype._startTimer = function () {
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

CreoSmithVpaid.prototype._onVideoTime = function () {
  var v = this._videoSlot;
  if (!v || !v.duration) return;
  this._attributes.remainingTime = v.duration - v.currentTime;
  this._progress(v.currentTime / v.duration);
};

CreoSmithVpaid.prototype._progress = function (pct) {
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

CreoSmithVpaid.prototype._complete = function () {
  if (this._q.done) return;
  this._q.done = true;
  if (this._timer) {
    clearInterval(this._timer);
    this._timer = null;
  }
  this._emit("AdVideoComplete");
};

/**
 * Self-reported viewability (ADR-0012, not OMID-accredited): fires
 * `AdParameters.viewableTrackingUrl` once the slot has been >=50% on-screen
 * for a continuous 2s, the MRC video threshold. VPAID-only — SIMID's
 * viewability is measured by whatever OMID vendor the advertiser configures
 * (pass-through), never by us. A pixel `Image()` request is used instead of
 * `fetch` to avoid CORS/opaque-response ambiguity across the sandboxed/
 * cross-origin contexts VPAID units run in (IMA, Fluid Player, ...).
 */
CreoSmithVpaid.prototype._startViewabilityObserver = function () {
  var self = this;
  var url = this._params.viewableTrackingUrl;
  if (!url || !this._slot || typeof IntersectionObserver === "undefined") return;

  function clearPendingFire() {
    if (self._viewTimer) {
      clearTimeout(self._viewTimer);
      self._viewTimer = null;
    }
  }

  function fireViewable() {
    if (self._viewableFired) return;
    self._viewableFired = true;
    self._stopViewabilityObserver();
    try {
      new Image().src = url;
    } catch (e) {
      /* noop */
    }
  }

  this._onVisibilityChange = function () {
    // A backgrounded tab isn't "viewed" even if IntersectionObserver still
    // reports the slot as intersecting; browsers don't guarantee identical
    // throttling of IO callbacks on hidden tabs across the players this runs
    // in, so this is checked explicitly rather than relied on implicitly.
    if (document.hidden) clearPendingFire();
  };

  this._viewObserver = new IntersectionObserver(function (entries) {
    var entry = entries[entries.length - 1];
    var visible =
      entry.isIntersecting && entry.intersectionRatio >= 0.5 && !document.hidden;
    if (visible) {
      if (!self._viewTimer) self._viewTimer = setTimeout(fireViewable, 2000);
    } else {
      clearPendingFire();
    }
  }, { threshold: [0, 0.5] });

  this._viewObserver.observe(this._slot);
  document.addEventListener("visibilitychange", this._onVisibilityChange);
};

/** Disconnects the observer/timer/listener without firing — used on every teardown path once the ad no longer needs measuring. */
CreoSmithVpaid.prototype._stopViewabilityObserver = function () {
  if (this._viewTimer) {
    clearTimeout(this._viewTimer);
    this._viewTimer = null;
  }
  if (this._viewObserver) {
    this._viewObserver.disconnect();
    this._viewObserver = null;
  }
  if (this._onVisibilityChange) {
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this._onVisibilityChange = null;
  }
};

/** Shared by every terminal path (stop, skip, the mandatory close, a template's own early-end UI) so the quartile timer never outlives the ad it was tracking. */
CreoSmithVpaid.prototype._teardown = function () {
  if (this._timer) {
    clearInterval(this._timer);
    this._timer = null;
  }
  this._stopViewabilityObserver();
};
CreoSmithVpaid.prototype.stopAd = function () {
  this._teardown();
  this._emit("AdStopped");
};
CreoSmithVpaid.prototype.skipAd = function () {
  this._teardown();
  this._emit("AdSkipped");
  this._emit("AdStopped");
};

/**
 * The close control every creative gets, mandatory, built once here rather
 * than per template (ADR-0009). A tidy drawn cross in the corner, disabled behind a
 * ring that fills over `closeDelaySeconds` (default 5, not yet a creative
 * setting — read from AdParameters so a future setting needs no runtime
 * change). Clicking it once live tears down the creative like a user-
 * initiated skip: no auto-expiry, no forced completion, the viewer decides.
 */
CreoSmithVpaid.prototype._mountCloseControl = function () {
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
    "position:absolute;inset:0;" +
    "border:0;border-radius:50%;background:transparent;padding:0;margin:0;" +
    "cursor:default;opacity:.5;transition:opacity .25s ease;" +
    "color:#fff;-webkit-tap-highlight-color:transparent;";

  // The cross is drawn, not typed. A text "×" was centred by flexbox, but
  // flexbox centres the *line box* while the glyph's ink sits off-centre
  // inside it (and differs per font — Arial is absent on the Android/Linux
  // players this runs in, so the fallback shifts it further). Worse, glyph
  // rasterisation snaps to the pixel grid while the SVG ring does not, and the
  // 26px control routinely lands on a half pixel, which pushed the cross up
  // and left of the ring it sits in. Drawing it into an SVG that shares the
  // ring's box and viewBox puts both in one coordinate system, so the cross is
  // centred by geometry on every device and can no longer drift.
  var mark = document.createElementNS(svgNS, "svg");
  mark.setAttribute("width", SIZE);
  mark.setAttribute("height", SIZE);
  mark.setAttribute("viewBox", "0 0 " + SIZE + " " + SIZE);
  mark.setAttribute("aria-hidden", "true");
  mark.setAttribute("focusable", "false");
  mark.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  var ARM = 3; // half-length of each stroke, from the centre
  var cross = document.createElementNS(svgNS, "path");
  cross.setAttribute(
    "d",
    "M" + (SIZE / 2 - ARM) + " " + (SIZE / 2 - ARM) +
      "L" + (SIZE / 2 + ARM) + " " + (SIZE / 2 + ARM) +
      "M" + (SIZE / 2 + ARM) + " " + (SIZE / 2 - ARM) +
      "L" + (SIZE / 2 - ARM) + " " + (SIZE / 2 + ARM),
  );
  cross.setAttribute("fill", "none");
  cross.setAttribute("stroke", "currentColor");
  cross.setAttribute("stroke-width", "1.5");
  cross.setAttribute("stroke-linecap", "round");
  mark.appendChild(cross);
  btn.appendChild(mark);

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

CreoSmithVpaid.prototype._closeCreative = function () {
  if (this._closed) return;
  this._closed = true;
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
CreoSmithVpaid.prototype.resizeAd = function (width, height, viewMode) {
  this._attributes.width = width;
  this._attributes.height = height;
  this._attributes.viewMode = viewMode;
  this._emit("AdSizeChange");
};
CreoSmithVpaid.prototype.pauseAd = function () {
  if (this._videoSlot) this._videoSlot.pause();
  this._emit("AdPaused");
};
CreoSmithVpaid.prototype.resumeAd = function () {
  if (this._videoSlot) this._videoSlot.play();
  this._emit("AdPlaying");
};
CreoSmithVpaid.prototype.expandAd = function () {};
CreoSmithVpaid.prototype.collapseAd = function () {};

CreoSmithVpaid.prototype.getAdLinear = function () {
  return true;
};
CreoSmithVpaid.prototype.getAdWidth = function () {
  return this._attributes.width;
};
CreoSmithVpaid.prototype.getAdHeight = function () {
  return this._attributes.height;
};
CreoSmithVpaid.prototype.getAdExpanded = function () {
  return this._attributes.expanded;
};
CreoSmithVpaid.prototype.getAdSkippableState = function () {
  return false;
};
CreoSmithVpaid.prototype.getAdRemainingTime = function () {
  return this._attributes.remainingTime;
};
CreoSmithVpaid.prototype.getAdDuration = function () {
  return this._attributes.duration;
};
CreoSmithVpaid.prototype.getAdVolume = function () {
  return this._attributes.volume;
};
CreoSmithVpaid.prototype.setAdVolume = function (volume) {
  this._attributes.volume = volume;
  if (this._videoSlot) this._videoSlot.volume = volume;
  this._emit("AdVolumeChange");
};
CreoSmithVpaid.prototype.getAdCompanions = function () {
  return "";
};
CreoSmithVpaid.prototype.getAdIcons = function () {
  return false;
};

CreoSmithVpaid.prototype.subscribe = function (callback, event, context) {
  this._cb[event] = { fn: callback, ctx: context };
};
CreoSmithVpaid.prototype.unsubscribe = function (event) {
  delete this._cb[event];
};
/**
 * Post one telemetry record to whichever of OUR OWN pages is hosting this unit
 * (ADR-0019). Always compiled in, in every build, production included.
 *
 * `targetOrigin` is the entire access-control mechanism here, not a formality.
 * In production `window.top` is the publisher's page, its origin does not match
 * `CREOSMITH_ORIGIN`, and the browser discards the message before delivering
 * it. A creative therefore cannot leak its state to the page it runs on even if
 * something there is listening — that is enforced by the browser, not by our
 * discipline. On our own preview and harness pages the origins match and the
 * record arrives. One binary everywhere: no debug build, no AdParameters flag,
 * and so no chance of debugging something other than what ships.
 *
 * Both `parent` and `top` are addressed because the unit sits one frame deep in
 * some players and two in others, and posting to both costs less than walking
 * the ancestor chain — which cross-origin ancestors would not permit anyway.
 * The collector de-duplicates on `runId` + sequence.
 *
 * Nothing here may throw: telemetry must never be able to break an ad, the same
 * rule the onStart / close-control / viewability call sites already follow.
 */
/**
 * The windows this unit may report to, resolved once and cached.
 *
 * `parent` and `top` are both considered because the unit sits one frame deep
 * in some players and two in others; `window` itself covers the host that loads
 * the unit straight into its own document (the Sandbox player and the harness),
 * where there is no ancestor to post to at all. Each is kept only if
 * `adInteractReachable` says it is ours, so nothing is ever posted at a window
 * that would reject it — see that function for why that matters.
 *
 * The frame tree does not change under a running ad, so this is computed on
 * first use rather than per event.
 */
CreoSmithVpaid.prototype._targets = function () {
  if (this._tgt) return this._tgt;
  var candidates = [];
  try {
    if (window.parent === window) candidates.push(window);
    else {
      candidates.push(window.parent);
      if (window.top && window.top !== window.parent) candidates.push(window.top);
    }
  } catch (e) {
    /* an environment that will not even let us look: report to nobody */
  }
  this._tgt = [];
  for (var i = 0; i < candidates.length; i++) {
    if (adInteractReachable(candidates[i])) this._tgt.push(candidates[i]);
  }
  return this._tgt;
};

/**
 * Post one telemetry record to whichever of OUR OWN pages is hosting this unit
 * (ADR-0019). Always compiled in, in every build, production included.
 *
 * `targetOrigin` is still passed on every call and is still the guarantee of
 * record: even if the reachability probe above were ever wrong, the browser
 * refuses to deliver to an origin that does not match. The probe is what keeps
 * the attempt from being made at all, and so keeps a publisher's console clean.
 *
 * Nothing here may throw: telemetry must never be able to break an ad, the same
 * rule the onStart / close-control / viewability call sites already follow. Each
 * post is wrapped separately, so one failing target cannot cancel the others.
 */
CreoSmithVpaid.prototype._report = function (name, data) {
  if (!CREOSMITH_ORIGIN) return;
  var targets;
  var message;
  try {
    targets = this._targets();
    if (targets.length === 0) return;
    message = {
      __creosmith: 1,
      v: 1,
      runId: this._runId,
      seq: ++this._seq,
      template: this._t.name || null,
      name: name,
      at: Date.now() - this._epoch,
      data: adInteractCloneable(data),
    };
  } catch (e) {
    return;
  }
  for (var i = 0; i < targets.length; i++) {
    try {
      targets[i].postMessage(message, CREOSMITH_ORIGIN);
    } catch (e) {
      /* never let telemetry break the ad, and never let one target stop another */
    }
  }
};

/**
 * Events the player drives at input frequency: a window-resize drag calls
 * resizeAd continuously, a volume-slider drag calls setAdVolume the same way.
 * Reporting them would turn one gesture into hundreds of records on the main
 * thread while video decodes — the very thing the templates are careful about
 * (slider reports on drag end, scratch-reveal buckets its coverage). Neither is
 * a lifecycle event anyone debugs, so they are simply not on the channel.
 */
var ADINTERACT_UNREPORTED = { AdSizeChange: 1, AdVolumeChange: 1 };

CreoSmithVpaid.prototype._emit = function (event, args) {
  // Reported before dispatch, so the record reflects the order the unit decided
  // things in rather than the order subscribers happened to finish in.
  if (!ADINTERACT_UNREPORTED[event]) {
    this._report(event, args && args.length ? { args: args } : undefined);
  }
  var c = this._cb[event];
  if (c && typeof c.fn === "function") c.fn.apply(c.ctx || null, args || []);
};

// The player entry point. TEMPLATE is defined by the concatenated render module.
var getVPAIDAd = function () {
  return new CreoSmithVpaid(typeof TEMPLATE !== "undefined" ? TEMPLATE : {});
};

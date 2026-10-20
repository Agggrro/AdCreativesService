/**
 * Step Builder — VPAID render module.
 *
 * The first steps of a "build your own" flow, played inside the ad: two or
 * three steps, each a row of two to four tiles (a looping clip or a picture
 * with a label). The viewer taps one per step; after the last, the last pick
 * takes the slot under a summary of every pick, a progress counter and a
 * button, which opens the click-through. With `passPicks` on, the picks are
 * appended to it as query parameters, so a landing built to read them carries
 * on from where the ad stopped instead of starting over (ADR-0031).
 *
 * Inside ADR-0005's deception boundary: every word on screen is the
 * advertiser's copy, the progress counter is the advertiser's own count of
 * their flow's steps, and nothing is picked for the viewer — a viewer who never
 * taps stays on step one, with its clips playing, until the ad ends.
 *
 * Config (AdParameters):
 *   stepCount  "2" | "3"                         (absent => 3)
 *   passPicks  "on" | "off"                      append the picks to the
 *                       click-through (absent => off)
 *   step<N>Title                                  the line over step N's tiles
 *   step<N>Key                                    the query parameter step N sets
 *   step<N>Opt<I>Label, step<N>Opt<I>Value,
 *   step<N>Opt<I>Media                            option I (1–4) of step N; an
 *                       option without a label is left out. "{key}" in a media
 *                       URL is the value picked at the earlier step whose key
 *                       it names, so a later step can show clips that match an
 *                       earlier pick ("…/{style}/blonde.mp4").
 *   step<N>Opt<I>MediaB                           steps 2–3: the option's clip when
 *                       step one's option B was picked (absent => its Media).
 *                       For uploads, whose URLs have no path to template.
 *   stepsTotal                                    the counter's total, at least
 *                       the ad's own steps: the landing's whole flow (absent =>
 *                       the ad's steps)
 *   finishTitle, ctaText                          the end screen
 *   accentColor                                   rings, counter, button, #rgb/#rrggbb
 *   clickThroughUrl                               the destination
 *
 * Picks are appended only as key=value pairs matching the same patterns `/r`
 * forwards (lib/click-destination.ts, appendForwardedParams), and never over a
 * parameter the URL already has. On a served tag that URL is the `/r` link, so
 * the "finish" record cannot know the owner's own parameters: a pick whose key
 * the destination already carries is in that record and still dropped by `/r`.
 *
 * Chrome's heavy-ad intervention unloads an ad that downloads more than 4 MB
 * before the viewer touches it, so only step one's tiles load at mount; each
 * later step loads after the tap that reached it.
 *
 * Duration is 30 to match DEFAULT_DURATION_SECONDS in lib/vast/builder.ts, as
 * Duel's is: production injects its own, and the catalog demo none.
 */
var TEMPLATE = {
  name: "step-builder",
  duration: 30,
  onStart: function (slot, params, api) {
    if (!slot) return;

    var FONT = "Arial,Helvetica,sans-serif";
    var MAX_STEPS = 3;
    var MAX_OPTIONS = 4;
    // How long a pick stays on screen, ringed, before the next step replaces it.
    var ADVANCE_MS = 550;
    // A tap on the end screen this soon after the last pick is the same gesture,
    // not a deliberate click-through (ADR-0024's rule).
    var CTA_GUARD_MS = 600;
    // Idle this long on a step, and the tiles start taking turns to light up.
    var HINT_AFTER_MS = 1600;
    var HINT_EVERY_MS = 900;
    // The base's close control: 26px at a 10px inset, top-right.
    var CLOSE_CLEAR = 44;
    // The same patterns `/r` forwards (lib/click-destination.ts).
    var KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
    var VALUE_RE = /^[A-Za-z0-9_\-]{1,64}$/;
    var FILL = "position:absolute;top:0;right:0;bottom:0;left:0;";
    var BUTTON_RESET =
      "margin:0;border:0;-webkit-appearance:none;appearance:none;box-sizing:border-box;" +
      "text-transform:none;letter-spacing:normal;cursor:pointer;font:inherit;";

    function str(key, fallback) {
      var v = params[key];
      return typeof v === "string" && v.trim() ? v.trim() : fallback;
    }
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }
    function place(el, x, y, w, h) {
      el.style.left = Math.round(x) + "px";
      el.style.top = Math.round(y) + "px";
      el.style.width = Math.round(w) + "px";
      el.style.height = Math.round(h) + "px";
    }
    /** Black or white, whichever reads better on the advertiser's fill (WCAG). */
    function inkOn(hex) {
      var h = hex.slice(1);
      if (h.length === 3) {
        h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      }
      var lin = [0, 2, 4].map(function (o) {
        var c = parseInt(h.substr(o, 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      var L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? "#fff" : "#111";
    }

    var accent = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(params.accentColor)
      ? params.accentColor
      : "#e11d48";
    var accentInk = inkOn(accent);

    // --- the flow, from the config ------------------------------------------------
    var stepCount = params.stepCount === "2" ? 2 : MAX_STEPS;
    var passPicks = params.passPicks === "on";
    var steps = [];
    for (var s = 1; s <= stepCount; s++) {
      var options = [];
      for (var o = 1; o <= MAX_OPTIONS; o++) {
        var p = "step" + s + "Opt" + o;
        var label = str(p + "Label", "");
        if (!label) continue;
        options.push({
          label: label,
          value: str(p + "Value", label),
          media: str(p + "Media", ""),
          mediaB: s > 1 ? str(p + "MediaB", "") : "",
        });
      }
      // A step with nothing to pick from is skipped rather than shown empty.
      if (!options.length) continue;
      steps.push({
        title: str("step" + s + "Title", ""),
        key: str("step" + s + "Key", "step" + s),
        options: options,
      });
    }
    if (!steps.length) return;
    var total = Math.max(
      steps.length,
      Math.min(Math.round(Number(params.stepsTotal)) || 0, 12),
    );
    var view = slot.ownerDocument.defaultView || window;

    var still = false;
    try {
      still = !!(view.matchMedia && view.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      /* no matchMedia: animate */
    }

    var current = 0, // index into steps; steps.length is the end screen
      picks = [], // { key, value, label, media } per step taken
      locked = false, // between a pick and the next step
      finishedAt = 0,
      fired = false,
      stopped = false,
      paused = false,
      geo = null,
      tiles = [],
      hintAt = 0,
      hintOn = -1,
      pendingAdvance = false,
      motions = [],
      resumeList = [];
    var advanceTimer = null,
      hintTimer = null,
      resizeTimer = null,
      observer = null,
      onResize = null;

    var wrap = document.createElement("div");
    wrap.style.cssText =
      FILL + "overflow:hidden;background:#0b0a10;color:#fff;direction:ltr;" +
      "font-family:" + FONT + ";text-transform:none;letter-spacing:normal;line-height:1.2;" +
      "-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;";
    slot.appendChild(wrap);
    if (typeof api.onStop === "function") api.onStop(cleanup);
    if (typeof api.onPause === "function") api.onPause(pause);
    if (typeof api.onResume === "function") api.onResume(resume);

    // --- the header: counter pill, title, progress bar ----------------------------
    var head = document.createElement("div");
    head.style.cssText =
      "position:absolute;z-index:2;display:flex;align-items:center;white-space:nowrap;overflow:hidden;";
    wrap.appendChild(head);
    var counter = document.createElement("span");
    counter.style.cssText =
      "flex:none;font-weight:700;border-radius:999px;font-variant-numeric:tabular-nums;" +
      "background:" + accent + ";color:" + accentInk + ";";
    head.appendChild(counter);
    var title = document.createElement("span");
    title.style.cssText =
      "flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:700;" +
      "text-shadow:0 1px 3px rgba(0,0,0,.6);";
    head.appendChild(title);

    var track = document.createElement("div");
    track.style.cssText =
      "position:absolute;z-index:2;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.18);";
    wrap.appendChild(track);
    var fill = document.createElement("div");
    fill.style.cssText =
      FILL + "transform-origin:0 50%;transform:scaleX(0);background:" + accent + ";" +
      (still ? "" : "transition:transform .5s cubic-bezier(.22,1,.36,1);");
    track.appendChild(fill);

    var stage = document.createElement("div");
    stage.style.cssText = FILL + (still ? "" : "transition:opacity .3s ease;");
    wrap.appendChild(stage);

    // --- the end screen -----------------------------------------------------------
    var end = document.createElement("div");
    end.style.cssText = FILL + "visibility:hidden;opacity:0;" + (still ? "" : "transition:opacity .4s ease;");
    wrap.appendChild(end);
    var endMedia = document.createElement("div");
    endMedia.style.cssText = FILL;
    end.appendChild(endMedia);
    var scrim = document.createElement("div");
    scrim.style.cssText =
      FILL + "pointer-events:none;" +
      "background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.45) 45%,rgba(0,0,0,0) 75%);";
    end.appendChild(scrim);
    var panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;display:flex;flex-direction:column;align-items:flex-start;box-sizing:border-box;";
    end.appendChild(panel);
    var summary = document.createElement("div");
    summary.style.cssText =
      "max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:700;" +
      "color:" + accent + ";text-shadow:0 1px 3px rgba(0,0,0,.7);";
    panel.appendChild(summary);
    var endTitle = document.createElement("div");
    endTitle.textContent = str("finishTitle", "Almost there");
    endTitle.style.cssText =
      "max-width:100%;font-weight:800;line-height:1.15;text-shadow:0 2px 6px rgba(0,0,0,.7);" +
      "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;";
    panel.appendChild(endTitle);
    var ctaBox = document.createElement("div");
    ctaBox.style.cssText = "position:relative;max-width:100%;";
    panel.appendChild(ctaBox);
    // A ring that ripples out of the button while it waits to be pressed.
    var halo = document.createElement("span");
    halo.style.cssText =
      FILL + "pointer-events:none;border-radius:999px;opacity:0;border:2px solid " + accent + ";";
    ctaBox.appendChild(halo);
    var cta = document.createElement("button");
    cta.type = "button";
    cta.tabIndex = -1;
    cta.setAttribute("aria-hidden", "true");
    cta.textContent = str("ctaText", "Continue");
    cta.style.cssText =
      BUTTON_RESET + "position:relative;display:block;max-width:100%;overflow:hidden;" +
      "white-space:nowrap;text-overflow:ellipsis;font-weight:800;border-radius:999px;" +
      "background:" + accent + ";color:" + accentInk + ";box-shadow:0 6px 18px rgba(0,0,0,.45);";
    ctaBox.appendChild(cta);
    cta.addEventListener("click", onCta);

    // --- picks → URLs ---------------------------------------------------------------
    function picked(key) {
      for (var k = 0; k < picks.length; k++) if (picks[k].key === key) return picks[k].value;
      return null;
    }
    /**
     * "{key}" in a media URL is the value picked for that key, once it has been.
     * Also "%7Bkey%7D", which is what the braces become once anything normalizes
     * the URL (they are in the WHATWG path percent-encode set).
     */
    function mediaUrl(url) {
      return url.replace(/\{([A-Za-z][A-Za-z0-9_]{0,31})\}|%7B([A-Za-z][A-Za-z0-9_]{0,31})%7D/gi, function (m, typed, encoded) {
        var v = picked(typed || encoded);
        return v === null ? m : encodeURIComponent(v);
      });
    }
    /**
     * The destination with the picks appended as query parameters — the same
     * pairs `/r` forwards to the landing when this is the served click link.
     * A parameter the URL already carries is never repeated: on the click link
     * that is `/r`'s own, and on a plain destination the advertiser's.
     */
    function withPicks(base) {
      if (!base || !passPicks) return base;
      var hash = "";
      var cut = base.indexOf("#");
      if (cut >= 0) {
        hash = base.slice(cut);
        base = base.slice(0, cut);
      }
      var q = base.indexOf("?");
      var have = {};
      if (q >= 0) {
        var pairs = base.slice(q + 1).split("&");
        for (var k = 0; k < pairs.length; k++) {
          var name = pairs[k].split("=")[0];
          try {
            name = decodeURIComponent(name.replace(/\+/g, " "));
          } catch (e) {
            /* compared as written */
          }
          if (name) have[name] = true;
        }
      }
      var add = [];
      for (var j = 0; j < picks.length; j++) {
        var pk = picks[j];
        if (have[pk.key] || !KEY_RE.test(pk.key) || !VALUE_RE.test(pk.value)) continue;
        have[pk.key] = true;
        add.push(pk.key + "=" + pk.value);
      }
      if (!add.length) return base + hash;
      var sep = q < 0 ? "?" : /[?&]$/.test(base) ? "" : "&";
      return base + sep + add.join("&") + hash;
    }

    // --- the tiles of one step --------------------------------------------------------
    function makeTile(step, i) {
      var opt = steps[step].options[i];
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", opt.label);
      b.style.cssText =
        "position:absolute;padding:0;overflow:hidden;background:#16141c;color:#fff;" +
        BUTTON_RESET + (still ? "" : "transition:opacity .3s ease,transform .3s ease;");
      // After step one's option B, an option's own B clip, if it has one: an
      // uploaded file's URL has no path to put a "{key}" in.
      var raw = picks.length && picks[0].index === 1 && opt.mediaB ? opt.mediaB : opt.media;
      var src = raw ? mediaUrl(raw) : "";
      if (src) b.appendChild(adInteractFitMedia(src, api, "s" + (step + 1) + ":" + (i + 1)).el);
      var shade = document.createElement("span");
      shade.style.cssText =
        "position:absolute;left:0;right:0;bottom:0;height:42%;pointer-events:none;" +
        "background:linear-gradient(to top,rgba(0,0,0,.8),rgba(0,0,0,0));";
      b.appendChild(shade);
      var name = document.createElement("span");
      name.textContent = opt.label;
      name.style.cssText =
        "position:absolute;left:4px;right:4px;bottom:0;overflow:hidden;white-space:nowrap;" +
        "text-overflow:ellipsis;text-align:center;font-weight:700;pointer-events:none;";
      b.appendChild(name);
      // The hint and the pick share one ring, its own layer over the clip: an
      // inset box-shadow on the button would be painted under the fitted media.
      var ring = document.createElement("span");
      ring.style.cssText =
        FILL + "pointer-events:none;opacity:0;border:2px solid " + accent + ";" +
        (still ? "" : "transition:opacity .35s ease;");
      b.appendChild(ring);
      // The viewer's pick, as a drawn tick: a glyph would depend on the host
      // page's charset, which a publisher's non-UTF-8 page gets wrong.
      var mark = document.createElement("span");
      mark.style.cssText =
        "position:absolute;display:none;border-radius:50%;pointer-events:none;background:" + accent + ";";
      var tick = document.createElement("span");
      tick.style.cssText =
        "position:absolute;left:36%;top:22%;width:22%;height:42%;box-sizing:border-box;" +
        "border:solid " + accentInk + ";border-width:0 2px 2px 0;transform:rotate(45deg);";
      mark.appendChild(tick);
      b.appendChild(mark);
      b.addEventListener("click", function () {
        onTileTap(step, i);
      });
      stage.appendChild(b);
      return { el: b, name: name, ring: ring, mark: mark, src: src };
    }

    /** Release a <video> no longer shown — a detached decoder can live on until GC. */
    function releaseVideos(el) {
      var vs = el.getElementsByTagName("video");
      for (var k = vs.length - 1; k >= 0; k--) {
        try {
          vs[k].pause();
          vs[k].removeAttribute("src");
          vs[k].load();
        } catch (e) {
          /* hidden anyway */
        }
      }
    }

    function showStep(step) {
      current = step;
      locked = false;
      releaseVideos(stage);
      stage.innerHTML = "";
      tiles = [];
      for (var i = 0; i < steps[step].options.length; i++) tiles.push(makeTile(step, i));
      title.textContent = steps[step].title;
      counter.textContent = step + 1 + "/" + total;
      fill.style.transform = "scaleX(" + step / total + ")";
      layout();
      api.debug("step", {
        step: step + 1,
        of: steps.length,
        key: steps[step].key,
        options: steps[step].options.length,
        media: tiles.map(function (t) {
          return t.src;
        }),
      });
      startHint();
    }

    // --- the idle hint: the tiles take turns to light up --------------------------------
    // `opacity` only, so it may run as long as the viewer waits (runtime/README.md).
    function startHint() {
      clearInterval(hintTimer);
      hintOn = -1;
      hintAt = Date.now() + HINT_AFTER_MS;
      hintTimer = setInterval(hintTick, 150);
    }
    function hintTick() {
      if (stopped || paused || locked || Date.now() < hintAt) return;
      hintAt = Date.now() + HINT_EVERY_MS;
      if (hintOn >= 0 && tiles[hintOn]) tiles[hintOn].ring.style.opacity = "0";
      hintOn = (hintOn + 1) % tiles.length;
      tiles[hintOn].ring.style.opacity = ".9";
    }
    function stopHint() {
      clearInterval(hintTimer);
      hintTimer = null;
      for (var k = 0; k < tiles.length; k++) tiles[k].ring.style.opacity = "0";
      hintOn = -1;
    }

    // --- a pick ------------------------------------------------------------------------
    function onTileTap(step, i) {
      // A paused ad takes no pick; a double tap's second event may reach a tile
      // of a step that is already over.
      if (stopped || paused || locked || step !== current) return;
      locked = true;
      stopHint();
      var opt = steps[step].options[i];
      picks.push({
        key: steps[step].key,
        value: opt.value,
        label: opt.label,
        media: tiles[i].src,
        index: i,
      });
      for (var k = 0; k < tiles.length; k++) {
        if (k === i) {
          tiles[k].ring.style.opacity = "1";
          tiles[k].mark.style.display = "block";
        } else {
          tiles[k].el.style.opacity = ".3";
        }
      }
      fill.style.transform = "scaleX(" + (step + 1) / total + ")";
      api.debug("pick", { step: step + 1, key: steps[step].key, value: opt.value });
      advanceTimer = setTimeout(function () {
        advanceTimer = null;
        if (stopped) return;
        // A pauseAd inside this window: the next step would start its clips,
        // or the end screen its motion, under a player showing the ad paused.
        // resume() takes the step instead.
        if (paused) {
          pendingAdvance = true;
          return;
        }
        advance();
      }, still ? 200 : ADVANCE_MS);
    }

    function advance() {
      if (current + 1 < steps.length) showStep(current + 1);
      else finish();
    }

    function finish() {
      current = steps.length;
      finishedAt = Date.now();
      var last = picks[picks.length - 1];
      // The end screen's clip is the last pick's own, already playing in its
      // tile; a fresh element rather than the tile's, so the tile can go.
      if (last.media) endMedia.appendChild(adInteractFitMedia(last.media, api, "end").el);
      releaseVideos(stage);
      stage.innerHTML = "";
      tiles = [];
      summary.textContent = picks
        .map(function (pk) {
          return pk.label;
        })
        .join(" · ");
      counter.textContent = steps.length + "/" + total;
      title.textContent = "";
      end.style.visibility = "visible";
      cta.tabIndex = 0;
      cta.removeAttribute("aria-hidden");
      layout();
      void end.offsetWidth;
      end.style.opacity = "1";
      if (!still && typeof cta.animate === "function") {
        motions.push(
          cta.animate(
            [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
            { duration: 1100, iterations: Infinity, easing: "ease-in-out", delay: 400 },
          ),
          halo.animate(
            [
              { transform: "scale(1)", opacity: 0.8 },
              { transform: "scale(1.15, 1.6)", opacity: 0 },
            ],
            { duration: 1400, iterations: Infinity, easing: "ease-out", delay: 400 },
          ),
        );
      }
      api.debug("finish", {
        picks: picks.map(function (pk) {
          return pk.key + "=" + pk.value;
        }),
        url: withPicks(str("clickThroughUrl", "")),
      });
    }

    function onCta() {
      if (stopped || paused || fired || current !== steps.length) return;
      if (Date.now() - finishedAt < CTA_GUARD_MS) return;
      fired = true;
      for (var a = 0; a < motions.length; a++) {
        try {
          motions[a].cancel();
        } catch (e) {
          /* already gone */
        }
      }
      motions = [];
      api.debug("cta", { picks: picks.length });
      // The URL as the tag delivered it — on a served tag, the `/r` link — with
      // the picks appended. Empty, the base falls back to the same URL, picks
      // and all being impossible without one.
      api.clickThrough(withPicks(str("clickThroughUrl", "")));
    }

    // --- layout ------------------------------------------------------------------------
    function layout() {
      var w = wrap.clientWidth || slot.clientWidth || 0;
      var h = wrap.clientHeight || slot.clientHeight || 0;
      if (!w || !h) return false;
      var m = Math.min(w, h);
      var pad = Math.round(clamp(m * 0.045, 6, 22));
      var fs = Math.round(clamp(Math.min(w * 0.04, h * 0.065), 10, 26));

      // The header sits on the close control's row, clear of it.
      var headH = Math.round(Math.max(26, fs * 1.7));
      var headTop = Math.max(4, Math.round(10 + 13 - headH / 2));
      place(head, pad, headTop, w - pad - CLOSE_CLEAR, headH);
      head.style.fontSize = fs + "px";
      head.style.gap = Math.round(fs * 0.5) + "px";
      counter.style.fontSize = Math.round(fs * 0.8) + "px";
      counter.style.padding = Math.round(fs * 0.2) + "px " + Math.round(fs * 0.55) + "px";
      var barTop = headTop + headH + Math.round(pad * 0.4);
      place(track, pad, barTop, w - pad - CLOSE_CLEAR, Math.max(3, Math.round(fs * 0.22)));

      // One row of tiles under the bar. A tile is never wider than 0.8 of its
      // height, nor narrower than 0.5 — past that it is shortened and centred.
      var top = barTop + Math.max(3, Math.round(fs * 0.22)) + pad;
      var areaH = h - top - pad;
      var n = tiles.length;
      if (n) {
        var gap = Math.round(clamp(pad * 0.7, 4, 14));
        var tw = Math.min((w - 2 * pad - gap * (n - 1)) / n, areaH * 0.8);
        var th = Math.min(areaH, tw / 0.5);
        var x0 = (w - (tw * n + gap * (n - 1))) / 2;
        var y0 = top + (areaH - th) / 2;
        var lfs = Math.round(clamp(Math.min(tw * 0.12, th * 0.075), 9, 20));
        var radius = Math.round(clamp(tw * 0.08, 6, 16));
        for (var i = 0; i < n; i++) {
          var t = tiles[i];
          place(t.el, x0 + i * (tw + gap), y0, tw, th);
          t.el.style.borderRadius = radius + "px";
          t.ring.style.borderRadius = radius + "px";
          t.ring.style.borderWidth = Math.max(2, Math.round(tw * 0.02)) + "px";
          t.name.style.fontSize = lfs + "px";
          t.name.style.paddingBottom = Math.round(lfs * 0.6) + "px";
          var ms = Math.round(clamp(tw * 0.16, 16, 28));
          place(t.mark, tw - ms - Math.round(ms * 0.35), Math.round(ms * 0.35), ms, ms);
        }
      }

      // The end screen: summary, title and button at the bottom left.
      var efs = Math.round(clamp(Math.min(w * 0.055, h * 0.085), 12, 34));
      panel.style.left = pad + "px";
      panel.style.width = w - 2 * pad + "px";
      panel.style.bottom = Math.round(pad * 1.2) + "px";
      panel.style.gap = Math.round(efs * 0.35) + "px";
      summary.style.fontSize = Math.round(efs * 0.55) + "px";
      endTitle.style.fontSize = efs + "px";
      endTitle.style.maxWidth = Math.round(Math.max(w * 0.7, Math.min(w - 2 * pad, 260))) + "px";
      cta.style.fontSize = Math.round(clamp(efs * 0.62, 11, 22)) + "px";
      cta.style.padding = Math.round(efs * 0.42) + "px " + Math.round(efs * 1.1) + "px";
      ctaBox.style.marginTop = Math.round(efs * 0.25) + "px";

      geo = { w: w, h: h, tiles: n };
      return true;
    }

    // --- resize, and a host that detaches the slot without stopAd ---------------------------
    var lastSize = "";
    var wasConnected = wrap.isConnected !== false;
    function onBoxChange() {
      if (stopped) return;
      if (wrap.isConnected !== false) wasConnected = true;
      else if (wasConnected) {
        cleanup();
        return;
      }
      if (layout() === false) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var size = geo.w + "x" + geo.h;
        if (stopped || size === lastSize) return;
        lastSize = size;
        api.debug("resize", { w: geo.w, h: geo.h });
      }, 300);
    }
    if (typeof view.ResizeObserver === "function") {
      observer = new view.ResizeObserver(onBoxChange);
      observer.observe(wrap);
    } else {
      onResize = onBoxChange;
      view.addEventListener("resize", onResize);
    }

    function cleanup() {
      if (stopped) return;
      stopped = true;
      clearInterval(hintTimer);
      clearTimeout(advanceTimer);
      clearTimeout(resizeTimer);
      for (var a = 0; a < motions.length; a++) {
        try {
          motions[a].cancel();
        } catch (e) {
          /* already gone */
        }
      }
      motions = [];
      if (observer) observer.disconnect();
      if (onResize) view.removeEventListener("resize", onResize);
      releaseVideos(wrap);
    }

    // --- the player's pauseAd / resumeAd ----------------------------------------------
    // Every clip is the unit's own, so the base's pause of the video slot reaches
    // none of them.
    function pause() {
      if (stopped || paused) return;
      paused = true;
      resumeList = [];
      var vs = wrap.getElementsByTagName("video");
      for (var k = 0; k < vs.length; k++) {
        if (!vs[k].paused) {
          resumeList.push(vs[k]);
          vs[k].pause();
        }
      }
      for (var a = 0; a < motions.length; a++) {
        try {
          motions[a].pause();
        } catch (e) {
          /* already gone */
        }
      }
      api.debug("pause", { step: current + 1 });
    }
    function resume() {
      if (stopped || !paused) return;
      paused = false;
      for (var k = 0; k < resumeList.length; k++) {
        var pr = resumeList[k].play();
        if (pr && pr.catch) pr.catch(function () {});
      }
      resumeList = [];
      for (var a = 0; a < motions.length; a++) {
        try {
          motions[a].play();
        } catch (e) {
          /* already gone */
        }
      }
      // The hint restarts its wait rather than lighting up the moment play resumes.
      hintAt = Date.now() + HINT_AFTER_MS;
      if (pendingAdvance) {
        pendingAdvance = false;
        advance();
      }
      api.debug("resume", { step: current + 1 });
    }

    api.debug("mount", {
      w: wrap.clientWidth,
      h: wrap.clientHeight,
      steps: steps.length,
      total: total,
      passPicks: passPicks,
      options: steps.map(function (st) {
        return st.options.length;
      }),
      keys: steps.map(function (st) {
        return st.key;
      }),
      motion: still ? "reduced" : "full",
    });
    showStep(0);
  },
};

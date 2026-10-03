/**
 * Duel — VPAID render module.
 *
 * One round of a two-way vote. Two clips play side by side (stacked on a
 * portrait slot) under a round label, a countdown and a question; the viewer
 * taps the one they pick. The other side folds away, the pick takes the whole
 * slot and plays its "winner" clip — with sound when the viewer's own tap made
 * the pick — and a button drives the click-through. If the countdown runs out
 * first, the unit picks a side itself, shows it without calling it a vote, and
 * plays the winner clip muted.
 *
 * Inside ADR-0005's deception boundary (ADR-0030): the round is the ad's own
 * game, not a live broadcast. The unit shows no viewer counts, no other people's
 * votes, no chat — nothing it would have to invent. Every word on screen is the
 * advertiser's copy, and the defaults claim nothing.
 *
 * Config (AdParameters):
 *   videoAUrl, videoBUrl        the two clips during the vote (image, gif or video)
 *   winAUrl, winBUrl            each side's winner clip; absent => its vote clip
 *   nameA, nameB                a name over each side
 *   roundLabel                  the label beside the countdown; absent => none
 *   questionText                the line across the middle
 *   hintText                    under the question, until the pick
 *   winText                     over the viewer's pick; "{name}" is its name
 *   ctaText                     the button
 *   voteSeconds                 the countdown, 4–30, and 5s short of the ad (absent => 10)
 *   accentColor                 rings, countdown, button, #rgb/#rrggbb
 *   sound      "on" | "off"     the winner clip's own audio         (absent => on)
 *   clickThroughUrl             the destination
 *
 * Sound is ADR-0024's rule: it starts inside the viewer's tap or not at all —
 * a winner clip that has not begun within 800ms plays on muted — at the
 * player's VPAID volume (api.volume()), re-read while it plays, and it sounds
 * once: the clip then loops on muted. The player's pauseAd pauses it
 * (api.onPause). Everything the unit started stops with the ad (api.onStop).
 *
 * Duration is 30 to match DEFAULT_DURATION_SECONDS in lib/vast/builder.ts, as
 * pick-message's is: production injects its own, and the catalog demo none.
 */
var TEMPLATE = {
  name: "duel",
  duration: 30,
  onStart: function (slot, params, api) {
    if (!slot) return;

    var FONT = "Arial,Helvetica,sans-serif";
    var SIDES = ["A", "B"];
    // A tap on the winner this soon after the pick is the same gesture, not a
    // deliberate click-through (ADR-0024's rule).
    var CTA_GUARD_MS = 600;
    // Sound that has not started this long after the tap is not "inside the
    // tap" any more (docs/adtech-standards.md, "Sound in a creative").
    var SOUND_DEADLINE_MS = 800;
    // The base's close control: 26px at a 10px inset, top-right. The top bar
    // keeps this far in from both edges so nothing sits under it.
    var CLOSE_CLEAR = 44;
    var FILL = "position:absolute;top:0;right:0;bottom:0;left:0;";
    var BUTTON_RESET =
      "margin:0;border:0;-webkit-appearance:none;appearance:none;box-sizing:border-box;" +
      "text-transform:none;letter-spacing:normal;cursor:pointer;font:inherit;";

    function str(key, fallback) {
      var v = params[key];
      return typeof v === "string" && v.trim() ? v.trim() : fallback;
    }
    function url(key) {
      var v = params[key];
      return typeof v === "string" ? v.trim() : "";
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
    // Ends at least 5s before the ad's own duration, so the winner and the
    // button are on screen before the timer-driven AdVideoComplete.
    var adSeconds = Number(params.durationSeconds) || 30;
    var voteSeconds = Math.round(
      clamp(Math.min(Number(params.voteSeconds) || 10, adSeconds - 5), 4, 30),
    );
    var soundOn = params.sound !== "off";
    var names = [str("nameA", "A"), str("nameB", "B")];
    var voteUrls = [url("videoAUrl"), url("videoBUrl")];
    var winUrls = [url("winAUrl") || voteUrls[0], url("winBUrl") || voteUrls[1]];
    var view = slot.ownerDocument.defaultView || window;

    var still = false;
    try {
      still = !!(view.matchMedia && view.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      /* no matchMedia: animate */
    }
    var EASE = " .5s cubic-bezier(.22,1,.36,1)";
    var MOTION = still
      ? ""
      : "left" + EASE + ",top" + EASE + ",width" + EASE + ",height" + EASE + ",opacity .35s ease";

    var picked = -1,
      pickedAt = 0,
      fired = false,
      stopped = false,
      paused = false,
      deadline = 0,
      left = voteSeconds * 1000, // countdown remaining while paused
      shownSecond = -1,
      geo = null;
    var tickTimer = null,
      resizeTimer = null,
      soundTimer = null,
      observer = null,
      onResize = null,
      blinks = [],
      winVideo = null,
      resumeList = [];

    var wrap = document.createElement("div");
    wrap.style.cssText =
      FILL + "overflow:hidden;background:#000;color:#fff;direction:ltr;" +
      "font-family:" + FONT + ";text-transform:none;letter-spacing:normal;line-height:1.2;" +
      "-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;";
    slot.appendChild(wrap);
    if (typeof api.onStop === "function") api.onStop(cleanup);
    if (typeof api.onPause === "function") api.onPause(pause);
    if (typeof api.onResume === "function") api.onResume(resume);

    // --- the two sides --------------------------------------------------------
    var sides = [];
    for (var n = 0; n < 2; n++) sides.push(makeSide(n));

    function makeSide(i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", names[i]);
      b.style.cssText =
        "position:absolute;padding:0;overflow:hidden;background:#111;color:#fff;" +
        BUTTON_RESET + "transition:" + MOTION + ";";
      var fit = adInteractFitMedia(voteUrls[i], api, "vote:" + SIDES[i]);
      b.appendChild(fit.el);
      // The ring is its own layer over the clip: an inset box-shadow on the
      // button would be painted under the fitted media.
      var ring = document.createElement("span");
      ring.style.cssText = FILL + "pointer-events:none;opacity:0;";
      b.appendChild(ring);
      // A scrim under the name, so a bright clip cannot swallow it.
      var shade = document.createElement("span");
      shade.style.cssText =
        "position:absolute;left:0;right:0;bottom:0;height:38%;pointer-events:none;" +
        "background:linear-gradient(to top,rgba(0,0,0,.65),rgba(0,0,0,0));";
      b.appendChild(shade);
      var name = document.createElement("span");
      name.textContent = names[i];
      name.style.cssText =
        "position:absolute;bottom:0;max-width:calc(100% - 16px);overflow:hidden;" +
        "white-space:nowrap;text-overflow:ellipsis;font-weight:700;border-radius:999px;" +
        "background:rgba(0,0,0,.55);";
      b.appendChild(name);
      // The viewer's pick, as a drawn tick: a glyph would depend on the host
      // page's charset, which a publisher's non-UTF-8 page gets wrong.
      var mark = document.createElement("span");
      mark.style.cssText =
        "position:absolute;display:none;border-radius:50%;background:" + accent + ";";
      var tick = document.createElement("span");
      tick.style.cssText =
        "position:absolute;left:36%;top:22%;width:22%;height:42%;" +
        "border-right:2px solid " + accentInk + ";border-bottom:2px solid " + accentInk + ";" +
        "transform:rotate(45deg);";
      mark.appendChild(tick);
      b.appendChild(mark);
      b.addEventListener("click", function () {
        onSideTap(i);
      });
      wrap.appendChild(b);
      return { el: b, fit: fit, ring: ring, name: name, mark: mark, shade: shade };
    }

    // --- the top bar: round label, countdown ---------------------------------
    // Margins rather than flex `gap`, which Safari before 14.1 does not lay out.
    var bar = document.createElement("div");
    bar.style.cssText =
      "position:absolute;display:flex;align-items:center;pointer-events:none;transition:opacity .3s ease;";
    var roundText = str("roundLabel", "");
    var pill = document.createElement("span");
    pill.textContent = roundText;
    // Shrinks to an ellipsis rather than pushing the clock under the close control.
    pill.style.cssText =
      "flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:700;" +
      "border-radius:999px;background:rgba(0,0,0,.6);white-space:nowrap;";
    if (!roundText) pill.style.display = "none";
    var track = document.createElement("span");
    track.style.cssText =
      "position:relative;flex:1;min-width:24px;border-radius:999px;overflow:hidden;" +
      "background:rgba(255,255,255,.28);";
    var fill = document.createElement("span");
    fill.style.cssText = FILL + "transform-origin:left center;background:" + accent + ";";
    track.appendChild(fill);
    var clock = document.createElement("span");
    clock.style.cssText =
      "flex:none;font-weight:700;font-variant-numeric:tabular-nums;border-radius:999px;" +
      "background:rgba(0,0,0,.6);";
    bar.appendChild(pill);
    bar.appendChild(track);
    bar.appendChild(clock);
    wrap.appendChild(bar);

    // --- the question across the middle --------------------------------------
    var center = document.createElement("div");
    center.style.cssText =
      "position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;" +
      "pointer-events:none;text-align:center;transition:opacity .3s ease;";
    var question = document.createElement("div");
    question.textContent = str("questionText", "Who do you pick?");
    question.style.cssText =
      "max-width:88%;font-weight:800;border-radius:12px;background:rgba(0,0,0,.6);" +
      "overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;" +
      "text-shadow:0 1px 3px rgba(0,0,0,.6);";
    var hint = document.createElement("div");
    hint.textContent = str("hintText", "Tap to vote");
    hint.style.cssText =
      "font-weight:700;border-radius:999px;background:" + accent + ";color:" + accentInk + ";";
    center.appendChild(question);
    center.appendChild(hint);
    wrap.appendChild(center);

    // --- the end state: winner line and button --------------------------------
    var banner = document.createElement("div");
    banner.style.cssText =
      "position:absolute;left:" + CLOSE_CLEAR + "px;right:" + CLOSE_CLEAR + "px;text-align:center;" +
      "font-weight:800;pointer-events:none;visibility:hidden;opacity:0;" +
      "text-shadow:0 2px 6px rgba(0,0,0,.7);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" +
      (still ? "" : "transition:opacity .35s ease;");
    wrap.appendChild(banner);

    var cta = document.createElement("button");
    cta.type = "button";
    cta.tabIndex = -1;
    cta.setAttribute("aria-hidden", "true");
    cta.textContent = str("ctaText", "Watch more");
    // The reset first: its `font:inherit` would otherwise undo the weight below.
    cta.style.cssText =
      BUTTON_RESET +
      "position:absolute;left:50%;padding:0;font-weight:800;border-radius:999px;" +
      "background:" + accent + ";color:" + accentInk + ";white-space:nowrap;overflow:hidden;" +
      "text-overflow:ellipsis;box-shadow:0 6px 18px rgba(0,0,0,.45);" +
      "visibility:hidden;opacity:0;pointer-events:none;transform:translateX(-50%) translateY(8px);" +
      (still ? "" : "transition:opacity .35s ease,transform .35s cubic-bezier(.22,1,.36,1);");
    cta.addEventListener("click", function () {
      clickThrough("button");
    });
    wrap.appendChild(cta);

    // --- layout -----------------------------------------------------------------
    /**
     * Positioned from the slot's measured size and re-run on every resize: a
     * player going fullscreen mid-round must not strand the layout. Side by side
     * on a landscape slot, stacked on a portrait one. Returns false once torn down.
     */
    function layout() {
      if (stopped || !wrap.parentNode) return false;
      var w = slot.clientWidth || 640,
        h = slot.clientHeight || 360,
        m = Math.min(w, h),
        row = w >= h,
        pad = Math.round(clamp(m * 0.035, 8, 18)),
        fs = clamp(m * 0.045, 11, 18);

      for (var k = 0; k < 2; k++) {
        var s = sides[k];
        if (picked === -1) {
          if (row) place(s.el, k * (w / 2), 0, w / 2, h);
          else place(s.el, 0, k * (h / 2), w, h / 2);
        } else if (k === picked) {
          place(s.el, 0, 0, w, h);
        } else {
          // Folds toward its own edge rather than vanishing in place.
          if (row) place(s.el, k ? w : 0, 0, 0, h);
          else place(s.el, 0, k ? h : 0, w, 0);
        }
        s.name.style.fontSize = Math.round(fs) + "px";
        s.name.style.padding = Math.round(fs * 0.3) + "px " + Math.round(fs * 0.7) + "px";
        s.name.style.left = pad + "px";
        s.name.style.bottom = pad + "px";
        var mk = Math.round(fs * 1.5);
        s.mark.style.width = s.mark.style.height = mk + "px";
        s.mark.style.right = pad + "px";
        s.mark.style.bottom = pad + "px";
        s.ring.style.boxShadow =
          "inset 0 0 0 " + Math.round(clamp(m / 90, 3, 6)) + "px " + accent;
      }

      // The bar sits on the close control's row, kept clear of it on the right
      // and mirrored on the left so it stays centred.
      var barH = Math.round(clamp(m * 0.07, 20, 30)),
        space = Math.round(barH * 0.3);
      bar.style.left = CLOSE_CLEAR + "px";
      bar.style.right = CLOSE_CLEAR + "px";
      bar.style.top = Math.round(10 + 13 - barH / 2) + "px";
      bar.style.height = barH + "px";
      pill.style.marginRight = space + "px";
      clock.style.marginLeft = space + "px";
      var small = Math.round(clamp(barH * 0.5, 10, 14));
      pill.style.fontSize = clock.style.fontSize = small + "px";
      pill.style.padding = clock.style.padding =
        Math.round((barH - small * 1.2) / 2) + "px " + Math.round(small * 0.8) + "px";
      track.style.height = Math.max(4, Math.round(barH * 0.22)) + "px";

      question.style.fontSize = Math.round(clamp(m * 0.07, 14, 32)) + "px";
      question.style.padding = Math.round(fs * 0.35) + "px " + Math.round(fs * 0.8) + "px";
      hint.style.fontSize = Math.round(fs) + "px";
      hint.style.padding = Math.round(fs * 0.3) + "px " + Math.round(fs * 0.8) + "px";
      hint.style.marginTop = Math.round(fs * 0.5) + "px";
      center.style.top = Math.round((h - center.offsetHeight) / 2) + "px";

      banner.style.fontSize = Math.round(clamp(m * 0.075, 15, 34)) + "px";
      banner.style.top = Math.max(CLOSE_CLEAR, pad) + "px";
      cta.style.fontSize = Math.round(clamp(m * 0.05, 13, 22)) + "px";
      cta.style.padding = Math.round(fs * 0.6) + "px " + Math.round(fs * 1.6) + "px";
      cta.style.maxWidth = w - 2 * pad + "px";
      cta.style.bottom = Math.round(pad * 1.5) + "px";

      geo = { w: w, h: h, layout: row ? "row" : "column" };
      return true;
    }

    layout();
    api.debug("mount", {
      w: geo.w,
      h: geo.h,
      layout: geo.layout,
      voteSeconds: voteSeconds,
      sound: soundOn ? "on" : "off",
      winClips: [!!url("winAUrl"), !!url("winBUrl")],
      motion: still ? "reduced" : "full",
    });

    var lastSize = geo.w + "x" + geo.h;
    var wasConnected = wrap.isConnected !== false;
    function onBoxChange() {
      if (stopped) return;
      if (wrap.isConnected !== false) wasConnected = true;
      else if (wasConnected) {
        cleanup();
        return;
      }
      if (layout() === false) {
        cleanup();
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var size = geo.w + "x" + geo.h;
        if (stopped || size === lastSize) return;
        lastSize = size;
        api.debug("resize", { w: geo.w, h: geo.h, layout: geo.layout });
      }, 300);
    }
    // Observing the ad's own box: it drops to 0x0 when a host detaches the slot
    // without stopAd, which ends the work below too.
    if (typeof view.ResizeObserver === "function") {
      observer = new view.ResizeObserver(onBoxChange);
      observer.observe(wrap);
    } else {
      onResize = onBoxChange;
      view.addEventListener("resize", onResize);
    }

    // --- the countdown -----------------------------------------------------------
    // The bar empties by one `transform` transition over what is left of the
    // round; the clock text changes only when its second does. Under reduced
    // motion the bar steps once a second instead.
    function runCountdown() {
      deadline = Date.now() + left;
      fill.style.transition = "none";
      fill.style.transform = "scaleX(" + left / (voteSeconds * 1000) + ")";
      if (!still) {
        void fill.offsetWidth;
        fill.style.transition = "transform " + left / 1000 + "s linear";
        fill.style.transform = "scaleX(0)";
      }
      clearInterval(tickTimer);
      tickTimer = setInterval(countdown, 250);
      countdown();
    }
    function countdown() {
      if (stopped || paused || picked !== -1) return;
      var ms = Math.max(0, deadline - Date.now());
      var sec = Math.ceil(ms / 1000);
      if (sec !== shownSecond) {
        shownSecond = sec;
        clock.textContent = "0:" + (sec < 10 ? "0" : "") + sec;
        if (still) fill.style.transform = "scaleX(" + sec / voteSeconds + ")";
      }
      if (ms <= 0) {
        // Nobody picked: the unit does, and says so by not calling it a vote.
        pick(Math.random() < 0.5 ? 0 : 1, "timeout");
      }
    }
    runCountdown();

    // --- the blink: each side's ring in turn, for the vote only ----------------
    for (var j = 0; j < 2; j++) {
      if (typeof sides[j].ring.animate !== "function") {
        sides[j].ring.style.opacity = "1";
        continue;
      }
      blinks.push(
        sides[j].ring.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
          duration: 1600,
          iterations: Infinity,
          delay: j ? -800 : 0,
          easing: "ease-in-out",
        }),
      );
    }
    function stopBlink() {
      for (var k = 0; k < blinks.length; k++) {
        try {
          blinks[k].cancel();
        } catch (e) {
          /* already gone */
        }
      }
      blinks = [];
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

    function cleanup() {
      if (stopped) return;
      stopped = true;
      stopBlink();
      clearInterval(tickTimer);
      clearTimeout(resizeTimer);
      clearTimeout(soundTimer);
      if (observer) observer.disconnect();
      if (onResize) view.removeEventListener("resize", onResize);
      for (var k = 0; k < sides.length; k++) releaseVideos(sides[k].el);
    }

    // --- the player's pauseAd / resumeAd ------------------------------------------
    // Every clip the unit plays is its own, so the base's pause of the video slot
    // reaches none of them; and the countdown must not pick while the ad is paused.
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
      for (var a = 0; a < blinks.length; a++) {
        try {
          blinks[a].pause();
        } catch (e) {
          /* already gone */
        }
      }
      if (picked === -1) {
        clearInterval(tickTimer);
        left = Math.max(0, deadline - Date.now());
        // Freeze the bar where it is; under reduced motion it already stands
        // on its last whole second.
        if (!still) {
          fill.style.transition = "none";
          fill.style.transform = "scaleX(" + left / (voteSeconds * 1000) + ")";
        }
      }
      api.debug("pause", { picked: picked === -1 ? null : SIDES[picked], left: left });
    }
    function resume() {
      if (stopped || !paused) return;
      paused = false;
      for (var k = 0; k < resumeList.length; k++) resumePlay(resumeList[k]);
      resumeList = [];
      for (var a = 0; a < blinks.length; a++) {
        try {
          blinks[a].play();
        } catch (e) {
          /* already gone */
        }
      }
      if (picked === -1) runCountdown();
      api.debug("resume", { picked: picked === -1 ? null : SIDES[picked], left: left });
    }

    /** Play a clip the pause stopped; refused with sound, it carries on muted. */
    function resumePlay(v) {
      var p = v.play();
      if (p && typeof p.then === "function") {
        p.then(null, function () {
          if (stopped || v.muted || !v.getAttribute("src")) return;
          v.muted = true;
          v.loop = true;
          var q = v.play();
          if (q && q.catch) q.catch(function () {});
        });
      }
    }

    // --- the pick ------------------------------------------------------------------
    function onSideTap(i) {
      // A paused ad picks nothing: the winner would start, with its sound,
      // under a player that shows the ad as paused.
      if (stopped || paused) return;
      if (picked === -1) pick(i, "tap");
      else if (i === picked) clickThrough("winner");
    }

    function pick(i, via) {
      if (picked !== -1 || stopped) return;
      picked = i;
      pickedAt = Date.now();
      clearInterval(tickTimer);
      stopBlink();
      var won = sides[i],
        lost = sides[1 - i];
      won.ring.style.opacity = "1";
      won.shade.style.display = "none";
      won.name.style.display = "none";
      lost.el.tabIndex = -1;
      lost.el.setAttribute("aria-hidden", "true");
      lost.el.style.pointerEvents = "none";
      lost.el.style.opacity = "0";
      bar.style.opacity = "0";
      center.style.opacity = "0";
      // The fold animates the box; the clip inside follows by CSS alone.
      layout();
      setTimeout(function () {
        if (stopped) return;
        lost.el.style.visibility = "hidden";
        releaseVideos(lost.el);
      }, 520);

      api.debug("vote", { picked: SIDES[i], via: via, remaining: Math.max(0, deadline - pickedAt) });
      playWinner(i, via === "tap" && soundOn);

      // A tick and "{name} wins!" claim a vote, which only the viewer's tap is;
      // the countdown's own pick is shown by name alone (ADR-0030).
      if (via === "tap") {
        won.mark.style.display = "block";
        banner.textContent = str("winText", "{name} wins!").replace(/\{name\}/g, function () {
          return names[i];
        });
      } else {
        banner.textContent = names[i];
      }
      banner.style.visibility = "visible";
      banner.style.opacity = "1";
      cta.style.visibility = "visible";
      cta.style.pointerEvents = "auto";
      cta.tabIndex = 0;
      cta.removeAttribute("aria-hidden");
      void cta.offsetWidth;
      cta.style.opacity = "1";
      cta.style.transform = "translateX(-50%)";
    }

    /** The player's ad volume, 0–1. Anything that is not a volume is silence. */
    function volume() {
      var v = typeof api.volume === "function" ? Number(api.volume()) : 1;
      return v >= 0 ? Math.min(v, 1) : 0;
    }

    /**
     * The winner clip, in the winning side. A clip of its own is built inside
     * the tap — which is what lets it play with sound — and laid over the vote
     * clip invisibly: it is shown at its first frame, and dropped, leaving the
     * vote clip, if it fails. Without its own clip the vote clip carries on.
     */
    function playWinner(i, withSound) {
      var src = winUrls[i],
        s = sides[i],
        same = src === voteUrls[i];
      if (!same && !adInteractIsVideoUrl(src)) {
        // An image (or gif): nothing to play or to hear. It replaces the vote
        // clip once decoded — not before, which would show black meanwhile —
        // and a picture that will not load leaves the vote clip in place.
        var img = new Image();
        img.onload = function () {
          if (stopped) return;
          var pic = adInteractFitMedia(src, api, "win:" + SIDES[i]);
          s.el.replaceChild(pic.el, s.fit.el);
          releaseVideos(s.fit.el);
          s.fit = pic;
          api.debug("win", { side: SIDES[i], clip: "image", sound: false });
        };
        img.onerror = function () {
          if (stopped) return;
          api.debug("win", { side: SIDES[i], clip: "vote", sound: false, reason: "win-image-error" });
        };
        img.src = src;
        return;
      }
      if (same) {
        winVideo = s.el.getElementsByTagName("video")[0] || null;
        if (!winVideo) {
          api.debug("win", { side: SIDES[i], clip: "image", sound: false });
          return;
        }
      } else {
        var fit = adInteractFitMedia(src, api, "win:" + SIDES[i]);
        fit.el.style.position = "absolute";
        fit.el.style.top = fit.el.style.left = "0";
        fit.el.style.opacity = "0";
        s.el.insertBefore(fit.el, s.fit.el.nextSibling);
        var old = s.fit;
        winVideo = fit.media;
        fit.media.addEventListener("playing", function shown() {
          fit.media.removeEventListener("playing", shown);
          if (stopped) return;
          fit.el.style.opacity = "1";
          s.fit = fit;
          releaseVideos(old.el);
          if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
        });
        winVideo.addEventListener("error", function () {
          if (stopped || s.fit === fit) return;
          // The vote clip stays; it was never taken down.
          if (fit.el.parentNode) fit.el.parentNode.removeChild(fit.el);
          winVideo = null;
          clearTimeout(soundTimer);
          report({ side: SIDES[i], clip: "vote", sound: false, reason: "win-clip-error" });
        });
      }

      var reported = false;
      function report(rec) {
        if (reported || stopped) return;
        reported = true;
        clearTimeout(soundTimer);
        api.debug("win", rec);
      }
      var clip = same ? "vote" : "win";
      var vol = withSound ? volume() : 0;
      var v = winVideo;
      if (vol > 0) {
        var alreadyPlaying = !v.paused && v.readyState >= 3,
          rewound = false;
        if (same) {
          // The vote clip, mid-loop: from its start, so the sound plays it whole.
          try {
            v.currentTime = 0;
            rewound = true;
          } catch (e) {
            /* not seekable yet: it plays on from where it is */
          }
        }
        // Sound once: the clip plays through with its audio, then loops on muted.
        v.loop = false;
        v.muted = false;
        v.removeAttribute("muted");
        v.volume = vol;
        var follow = function () {
          if (stopped || v.muted && v.loop) return;
          var now = volume();
          // A player that mutes and then unmutes the ad gets its sound back: the
          // viewer's tap is still the permission.
          v.muted = now === 0;
          if (now > 0 && Math.abs(v.volume - now) > 0.01) v.volume = now;
        };
        v.addEventListener("playing", follow);
        v.addEventListener("timeupdate", follow);
        v.addEventListener("ended", function () {
          if (stopped) return;
          v.muted = true;
          v.loop = true;
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        });
        if (alreadyPlaying && !rewound) {
          // Already playing — the vote clip carrying on as the winner — so its
          // sound starts now, inside the tap; no "playing" event will follow.
          report({ side: SIDES[i], clip: clip, sound: !v.muted, volume: vol });
        } else {
          // Inside the tap or not at all: a clip that has not started in time —
          // or not finished its rewind — plays on, but muted.
          soundTimer = setTimeout(function () {
            if (reported || stopped) return;
            v.muted = true;
            v.loop = true;
            report({ side: SIDES[i], clip: clip, sound: false, reason: "late" });
          }, SOUND_DEADLINE_MS);
          v.addEventListener("playing", function started() {
            v.removeEventListener("playing", started);
            report({ side: SIDES[i], clip: clip, sound: !v.muted, volume: vol });
          });
          if (rewound && alreadyPlaying) {
            // A rewind into buffered data completes without a "playing" event.
            v.addEventListener("seeked", function landed() {
              v.removeEventListener("seeked", landed);
              if (!v.paused && v.readyState >= 3) {
                report({ side: SIDES[i], clip: clip, sound: !v.muted, volume: vol });
              }
            });
          }
        }
      }
      var p = v.play();
      if (p && typeof p.then === "function") {
        p.then(
          function () {
            if (vol === 0) report({ side: SIDES[i], clip: clip, sound: false });
          },
          function (e) {
            var reason = (e && e.name) || "error";
            // The ad ending, or the clip's own failure, which its error handler owns.
            if (stopped || reason === "AbortError" || winVideo !== v) return;
            // Refused with sound: play it muted rather than freeze the winner.
            if (!v.muted) {
              v.muted = true;
              v.loop = true;
              var q = v.play();
              if (q && q.catch) q.catch(function () {});
            }
            report({ side: SIDES[i], clip: clip, sound: false, reason: reason });
          },
        );
      } else if (vol === 0) {
        report({ side: SIDES[i], clip: clip, sound: false });
      }
    }

    function clickThrough(via) {
      if (stopped || fired || picked === -1 || Date.now() - pickedAt < CTA_GUARD_MS) return;
      fired = true;
      api.debug("cta", { via: via });
      api.clickThrough();
    }
  },
};

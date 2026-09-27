/**
 * Pick & Message — VPAID render module.
 *
 * Two pictures under a question, their rings blinking in turn. The viewer taps
 * one: the other fades out, the pick grows, and a chat message pops in above it
 * with a short sound — sent, by its avatar, from the picture the viewer chose.
 * The message, or the picked picture, fires the click-through.
 *
 * A chat message inside the ad, not an operating-system notification (ADR-0024,
 * inside ADR-0005's deception boundary): a light speech bubble in the ad's own
 * type, no translucent banner, no OS font or colours, no real messenger's logo,
 * no bundled system sound. Who "writes" and what they say is the advertiser's
 * copy, and the defaults claim nothing.
 *
 * Config (AdParameters):
 *   questionText                        the line over the two pictures
 *   option1ImageUrl, option2ImageUrl    the pictures (image, gif or video)
 *   senderName, messageText             the message
 *   timeLabel                           beside the name; absent => none
 *   highlightColor                      the rings, as #rgb or #rrggbb
 *   soundMode    "chime" | "custom" | "off"                  (absent => chime)
 *   soundUrl     an https audio file, read only when soundMode is "custom"
 *   clickThroughUrl                     the destination
 *
 * Sound is user-initiated only: it starts inside the viewer's own tap or not at
 * all, and plays at the player's VPAID volume (api.volume()), so a player that
 * mutes the ad through setAdVolume(0) keeps it silent. Everything the unit
 * started — the blink, the observer, a sound mid-play — stops with the ad
 * (api.onStop).
 *
 * Duration is 30 to match DEFAULT_DURATION_SECONDS in lib/vast/builder.ts, as the
 * quiz's is: production injects its own, and the catalog demo injects none.
 */
var TEMPLATE = {
  name: "pick_message",
  duration: 30,
  onStart: function (slot, params, api) {
    if (!slot) return;

    var FONT = "Arial,Helvetica,sans-serif";
    var LETTERS = ["A", "B"];
    // Pictures are laid out at their own shape, within these bounds (9:16 to
    // 16:9) — past them a tile gets too thin to tap or to read.
    var MIN_ASPECT = 0.56,
      MAX_ASPECT = 1.78;
    // Tapping the picture twice in quick succession is one gesture, not a pick
    // followed by a deliberate click-through.
    var CTA_GUARD_MS = 500;
    // A sound that has not started this long after the tap is not "inside the
    // tap" any more, and is stopped rather than played late.
    var SOUND_DEADLINE_MS = 800;
    // The base's close control is 26px at a 10px inset, top-right; content that
    // must not sit under it starts below this line (or 48px on a portrait slot,
    // where there is height to spare).
    var CLOSE_CLEAR = 42;

    function str(key, fallback) {
      var v = params[key];
      return typeof v === "string" && v.trim() ? v : fallback;
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
    function mediaUrl(i) {
      var v = params["option" + (i + 1) + "ImageUrl"];
      return typeof v === "string" ? v : "";
    }
    /**
     * Black or white, whichever reads better on a #rgb/#rrggbb fill — by WCAG
     * contrast, since the fill is the advertiser's colour and may be pale.
     */
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
    /** A publisher's `button {}` rule reaches us in a same-document player. */
    var BUTTON_RESET =
      "margin:0;border:0;-webkit-appearance:none;appearance:none;box-sizing:border-box;" +
      "text-transform:none;letter-spacing:normal;cursor:pointer;";

    var ringColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(params.highlightColor)
      ? params.highlightColor
      : "#e11d48";
    // https only: the file is fetched on every impression, and an http one on an
    // https page is mixed content — a console warning, or no sound at all.
    var soundUrl =
      typeof params.soundUrl === "string" && /^https:\/\//i.test(params.soundUrl.trim())
        ? params.soundUrl.trim()
        : "";
    // "custom" without a usable link plays the chime rather than nothing: the
    // configurator requires the link, so only a hand-built config gets here.
    var soundMode =
      params.soundMode === "off"
        ? "off"
        : params.soundMode === "custom" && soundUrl
          ? "custom"
          : "chime";

    // The ring width is fixed at mount: it lives inside the blink keyframes,
    // which cannot be re-targeted on resize.
    var m0 = Math.min(slot.clientWidth || 640, slot.clientHeight || 360);
    var RING = Math.round(clamp(m0 / 90, 3, 6));
    var RING_ON = "0 0 0 " + RING + "px " + ringColor;
    var RING_OFF = "0 0 0 " + RING + "px rgba(0,0,0,0)";
    var TILE_MOTION =
      "left .45s ease,top .45s ease,width .45s ease,height .45s ease," +
      "opacity .3s ease,transform .3s ease";
    var CARD_MOTION = "transform .35s cubic-bezier(.22,1,.36,1),opacity .25s ease";
    var CARD_REST = "translateY(10px) scale(.94)";
    // Under reduced motion only colour still changes: the rings keep blinking,
    // while the pick and the message arrive in their final place, unmoving.
    var still = false;
    try {
      still = !!(
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      /* no matchMedia: animate */
    }

    var picked = -1,
      pickedAt = 0,
      fired = false,
      settled = false,
      stopped = false,
      geo = null;
    var aspect = [0, 0]; // natural width / height per picture; 0 = not known yet
    var settleTimer = null,
      resizeTimer = null,
      soundDeadline = null,
      closeChime = null, // closes the chime's AudioContext, once
      observer = null,
      onResize = null,
      blinks = [];

    var wrap = document.createElement("div");
    wrap.style.cssText =
      "position:absolute;inset:0;overflow:hidden;background:#000;color:#fff;" +
      "font-family:" + FONT + ";text-transform:none;letter-spacing:normal;" +
      "-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;";
    slot.appendChild(wrap);
    // Registered before anything that could need stopping is started, so a throw
    // later in onStart (which the base swallows) cannot leave a blink running.
    if (typeof api.onStop === "function") api.onStop(cleanup);

    // 44px each side keeps the centred line clear of the base's close control.
    var question = document.createElement("div");
    question.textContent = str("questionText", "Which one do you like better?");
    question.style.cssText =
      "position:absolute;left:44px;right:44px;text-align:center;font-weight:700;" +
      "line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;" +
      "-webkit-line-clamp:2;text-shadow:0 1px 3px rgba(0,0,0,.5);";
    if (!still) question.style.transition = "opacity .3s ease";
    wrap.appendChild(question);

    var tiles = [];
    for (var n = 0; n < 2; n++) tiles.push(makeTile(n));

    function makeTile(i) {
      var url = mediaUrl(i);
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Option " + LETTERS[i]);
      b.style.cssText =
        "position:absolute;padding:0;overflow:hidden;background:#111;" +
        BUTTON_RESET +
        "box-shadow:" + RING_OFF + ";";
      var media = adInteractMediaLayer(url);
      // Upper-biased crop: when a picture does get cropped it is almost always
      // a person, and the face sits in the top third.
      media.style.backgroundPosition = "50% 30%";
      media.style.objectPosition = "50% 30%";
      b.appendChild(media);
      probe(i, url, media);
      b.addEventListener("click", function () {
        onTileTap(i);
      });
      wrap.appendChild(b);
      return b;
    }

    /** Learn a picture's own shape, so a tile can match it instead of cropping. */
    function probe(i, url, media) {
      function got(w, h) {
        if (stopped || !(w > 0 && h > 0)) return;
        aspect[i] = w / h;
        layout();
        if (aspect[0] && aspect[1]) settle();
      }
      if (adInteractIsVideoUrl(url)) {
        media.addEventListener("loadedmetadata", function () {
          got(media.videoWidth, media.videoHeight);
        });
      } else if (url) {
        var img = new Image();
        img.onload = function () {
          got(img.naturalWidth, img.naturalHeight);
        };
        img.src = url;
      }
    }

    // --- the message ------------------------------------------------------
    // One <button> for the avatar and the bubble, so the message is a single
    // tappable, focusable target; spans inside it, because a button's content
    // model is phrasing content.
    var card = document.createElement("button");
    card.type = "button";
    card.tabIndex = -1;
    card.setAttribute("aria-hidden", "true");
    card.style.cssText =
      "position:absolute;display:flex;align-items:flex-end;padding:0;background:none;" +
      "text-align:left;color:#16161a;font:inherit;" +
      BUTTON_RESET +
      "visibility:hidden;opacity:0;pointer-events:none;transform:" + CARD_REST + ";";
    var avatar = document.createElement("span");
    avatar.style.cssText =
      "position:relative;display:block;flex:none;border-radius:50%;overflow:hidden;" +
      "background:#333;box-shadow:0 2px 8px rgba(0,0,0,.4);";
    // A light speech bubble with a tail toward the avatar: the shape of a message
    // inside a conversation, not the translucent banner of a system notification.
    var bubble = document.createElement("span");
    bubble.style.cssText =
      "position:relative;display:block;flex:1;min-width:0;background:#fff;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.35);";
    var tail = document.createElement("span");
    tail.style.cssText =
      "position:absolute;left:-5px;width:12px;height:12px;background:#fff;" +
      "transform:rotate(45deg);border-radius:2px;";
    var head = document.createElement("span");
    head.style.cssText = "position:relative;display:flex;align-items:baseline;";
    var sender = document.createElement("span");
    sender.textContent = str("senderName", "New message");
    sender.style.cssText =
      "flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    // Optional: an advertiser who clears the field gets no time at all, not a
    // default "now" (an empty field is not saved, so absent is the only signal).
    var timeText = str("timeLabel", "");
    var time = document.createElement("span");
    time.textContent = timeText;
    time.style.cssText = "flex:none;margin-left:8px;color:#65656d;";
    if (!timeText) time.style.display = "none";
    var message = document.createElement("span");
    message.textContent = str("messageText", "Nice choice! Tap to see more");
    message.style.cssText =
      "position:relative;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;" +
      "overflow:hidden;line-height:1.3;overflow-wrap:anywhere;margin-top:2px;";
    head.appendChild(sender);
    head.appendChild(time);
    bubble.appendChild(tail);
    bubble.appendChild(head);
    bubble.appendChild(message);
    card.appendChild(avatar);
    card.appendChild(bubble);
    card.addEventListener("click", function () {
      cta("message");
    });
    wrap.appendChild(card);

    // Only a "custom" sound needs an element. It is attached to the ad, so the
    // close control's teardown (slot.innerHTML = "") detaches — and so pauses —
    // it; the player's own stopAd reaches it through cleanup().
    var audio = null;
    if (soundMode === "custom") {
      audio = document.createElement("audio");
      audio.preload = "auto";
      audio.src = soundUrl;
      audio.style.display = "none";
      // VPAID's volume is the whole ad's, for as long as it sounds: a player
      // that turns the ad down or mutes it mid-file is honoured mid-file.
      audio.addEventListener("timeupdate", function () {
        if (stopped) {
          audio.pause();
          return;
        }
        var v = volume();
        if (v === 0) audio.pause();
        else if (Math.abs(audio.volume - v) > 0.01) audio.volume = v;
      });
      wrap.appendChild(audio);
    }

    // --- layout -----------------------------------------------------------
    function known(i) {
      return aspect[i] ? clamp(aspect[i], MIN_ASPECT, MAX_ASPECT) : 0;
    }
    /** One shape for both tiles, so the pair reads as a balanced choice. */
    function tileAspect() {
      var a = known(0),
        b = known(1);
      return a && b ? (a + b) / 2 : a || b || 1;
    }

    /**
     * Everything is positioned from the slot's measured size, and re-run on every
     * resize — a player going fullscreen mid-ad must not strand the layout at the
     * size it had at mount. Returns false once the ad has been torn down.
     */
    function layout() {
      if (stopped || !wrap.parentNode) return false;
      var w = slot.clientWidth || 640,
        h = slot.clientHeight || 360,
        m = Math.min(w, h),
        pad = Math.round(clamp(m * 0.04, 8, 20)),
        gap = Math.round(clamp(m * 0.035, 6, 18)),
        radius = Math.round(clamp(m * 0.03, 6, 14)) + "px",
        portrait = h > w;

      question.style.top = pad + "px";
      question.style.fontSize = Math.round(clamp(m * 0.062, 14, 30)) + "px";
      // Never above CLOSE_CLEAR: on a short slot a one-line question leaves the
      // pictures starting under the close control, which then sits on a corner.
      var top = Math.max(pad + question.offsetHeight + gap, CLOSE_CLEAR),
        availW = w - 2 * pad,
        availH = Math.max(h - top - pad, 10);

      // Side by side or stacked — whichever gives the bigger pictures.
      var a = tileAspect();
      var rowW = Math.min((availW - gap) / 2, availH * a),
        rowH = rowW / a,
        colH = Math.min((availH - gap) / 2, availW / a),
        colW = colH * a;
      var row = rowW * rowH >= colW * colH;
      var tw = Math.floor(row ? rowW : colW),
        th = Math.floor(row ? rowH : colH);
      var x0 = row ? (w - (2 * tw + gap)) / 2 : (w - tw) / 2,
        y0 = top + (availH - (row ? th : 2 * th + gap)) / 2;
      for (var k = 0; k < 2; k++) {
        tiles[k].style.borderRadius = radius;
        if (k === picked) continue;
        place(tiles[k], row ? x0 + k * (tw + gap) : x0, row ? y0 : y0 + k * (th + gap), tw, th);
      }

      // The message stays clear of the close control: below it on a portrait
      // slot, narrower than the corner it sits in on a landscape one.
      var fs = clamp(m * 0.042, 11, 16);
      sender.style.fontSize = Math.round(fs + 1) + "px";
      message.style.fontSize = Math.round(fs) + "px";
      time.style.fontSize = Math.max(10, Math.round(fs - 2)) + "px";
      var av = Math.round(clamp(m * 0.12, 30, 52));
      avatar.style.width = av + "px";
      avatar.style.height = av + "px";
      avatar.style.marginRight = Math.round(clamp(m * 0.03, 10, 14)) + "px";
      avatar.style.lineHeight = av + "px";
      avatar.style.fontSize = Math.round(av * 0.45) + "px";
      bubble.style.padding =
        Math.round(clamp(m * 0.028, 7, 12)) + "px " + Math.round(clamp(m * 0.036, 10, 16)) + "px";
      bubble.style.borderRadius = Math.round(clamp(m * 0.045, 12, 20)) + "px";
      tail.style.bottom = Math.round(av / 2 - 6) + "px";
      var cw = portrait
        ? w - 2 * pad
        : Math.min(Math.round(clamp(w * 0.64, 240, 480)), w - 96);
      card.style.width = cw + "px";
      card.style.left = Math.round((w - cw) / 2) + "px";
      var ch = card.offsetHeight,
        minTop = portrait ? CLOSE_CLEAR + 6 : pad,
        cardTop = minTop;

      if (picked !== -1) {
        // The message and the pick are centred as one group, as in the reference.
        var pa = known(picked) || a,
          areaW = w - 2 * pad,
          areaH = Math.max(h - minTop - ch - gap - pad, 10);
        var ph = Math.min(areaH, areaW / pa, h * 0.7),
          pw = ph * pa;
        cardTop = Math.max(minTop, Math.round((h - (ch + gap + ph)) / 2));
        place(tiles[picked], (w - pw) / 2, cardTop + ch + gap, pw, ph);
      }
      card.style.top = cardTop + "px";

      geo = { w: w, h: h, layout: row ? "row" : "column", tile: [tw, th] };
      return true;
    }

    /**
     * Turn motion on only once the pictures' shapes are known (or given up on):
     * the first correction from the square guess to the real shape is a jump,
     * not something to watch. The reflow commits the settled geometry first —
     * otherwise enabling the transition in the same style pass animates it.
     */
    function settle() {
      if (settled || stopped || !wrap.parentNode) return;
      settled = true;
      void wrap.offsetWidth;
      if (!still) for (var k = 0; k < 2; k++) tiles[k].style.transition = TILE_MOTION;
      if (geo) {
        api.debug("layout", {
          layout: geo.layout,
          tile: geo.tile,
          aspect: [Math.round(aspect[0] * 100) / 100, Math.round(aspect[1] * 100) / 100],
        });
      }
    }

    layout();
    api.debug("mount", {
      w: geo.w,
      h: geo.h,
      layout: geo.layout,
      tile: geo.tile,
      sound: soundMode,
      motion: still ? "reduced" : "full",
    });
    // A picture that never loads must not leave the ad without motion.
    settleTimer = setTimeout(settle, 1200);

    // Observing the ad's own box rather than the slot: it has the slot's size
    // while mounted and drops to 0×0 the moment it is detached, so a host that
    // removes the slot without calling stopAd still ends the work below.
    var lastSize = geo.w + "x" + geo.h;
    // Detached counts as the end only after the ad has been in a document: a
    // player that builds its slot off-screen and attaches it later has not ended
    // anything.
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
      // Debounced: a resize is a drag, and one record per gesture is enough to
      // confirm a live resize inside a player we cannot see into.
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var size = geo.w + "x" + geo.h;
        if (stopped || size === lastSize) return;
        lastSize = size;
        api.debug("resize", { w: geo.w, h: geo.h, layout: geo.layout });
      }, 300);
    }
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(onBoxChange);
      observer.observe(wrap);
    } else {
      onResize = onBoxChange;
      window.addEventListener("resize", onResize);
    }

    // --- the blink ----------------------------------------------------------
    // Web Animations rather than a <style> block: nothing to inject into a page
    // we do not own, no class names to collide with a publisher's. A player
    // without it gets both rings lit and still.
    for (var j = 0; j < 2; j++) {
      if (typeof tiles[j].animate !== "function") {
        tiles[j].style.boxShadow = RING_ON;
        continue;
      }
      blinks.push(
        tiles[j].animate(
          [
            { boxShadow: RING_ON, easing: "ease-in-out" },
            { boxShadow: RING_OFF, easing: "ease-in-out" },
            { boxShadow: RING_ON },
          ],
          // Half a cycle apart, so the rings take turns.
          { duration: 2000, iterations: Infinity, delay: j ? -1000 : 0 },
        ),
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

    /** Release a <video> a tile no longer shows — a detached decoder can live on until GC. */
    function releaseVideo(el) {
      var v = el.getElementsByTagName("video")[0];
      if (!v) return;
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch (e) {
        /* a browser that refuses this still has the element hidden */
      }
    }

    /**
     * Everything this unit started, stopped. Web Animations and observers do not
     * end when their target leaves the DOM, and in a same-document player that
     * DOM is the publisher's page — so the ad's end is the unit's end, however it
     * comes: the close control, the player's stopAd, or the slot simply removed.
     */
    function cleanup() {
      if (stopped) return;
      stopped = true;
      stopBlink();
      if (observer) observer.disconnect();
      if (onResize) window.removeEventListener("resize", onResize);
      clearTimeout(settleTimer);
      clearTimeout(resizeTimer);
      clearTimeout(soundDeadline);
      // A host that calls stopAd and leaves the slot up would otherwise keep both
      // looping tile videos decoding after AdStopped (a detached one pauses itself).
      for (var k = 0; tiles && k < tiles.length; k++) releaseVideo(tiles[k]);
      if (audio) {
        try {
          audio.pause();
          // And stop fetching it: a paused element still downloads its source.
          audio.removeAttribute("src");
          audio.load();
        } catch (e) {
          /* already stopped */
        }
      }
      if (closeChime) closeChime();
    }

    // --- the pick -----------------------------------------------------------
    function onTileTap(i) {
      if (stopped) return;
      if (picked !== -1) {
        if (i === picked) cta("picture");
        return;
      }
      picked = i;
      pickedAt = Date.now();
      api.debug("pick", { picked: LETTERS[i] });
      settle();
      stopBlink();
      tiles[i].style.boxShadow = RING_ON;

      var other = tiles[1 - i];
      other.style.opacity = "0";
      other.style.transform = "scale(.92)";
      other.style.pointerEvents = "none";
      other.tabIndex = -1;
      other.setAttribute("aria-hidden", "true");
      setTimeout(function () {
        other.style.visibility = "hidden";
        releaseVideo(other);
      }, 320);
      question.style.opacity = "0";

      // The chosen picture, again, as the sender's avatar — or, for a video, the
      // sender's initial: a second decoder for the same clip is not worth a face.
      var url = mediaUrl(i);
      if (adInteractIsVideoUrl(url)) {
        // First character, not first code unit: charAt(0) would halve an emoji.
        var name = str("senderName", "New message");
        avatar.textContent = (name.match(/^[\uD800-\uDBFF][\uDC00-\uDFFF]|^./) || [""])[0].toUpperCase();
        avatar.style.background = ringColor;
        avatar.style.color = inkOn(ringColor);
        avatar.style.fontWeight = "700";
        avatar.style.textAlign = "center";
      } else {
        var face = adInteractMediaLayer(url);
        face.style.backgroundPosition = "50% 30%";
        avatar.appendChild(face);
      }
      card.style.visibility = "visible";
      card.style.pointerEvents = "auto";
      card.tabIndex = 0;
      card.removeAttribute("aria-hidden");
      // Place the message at its final spot while still at rest, commit that
      // without motion, then let it pop in — were the transition live while it is
      // placed, the entrance would start from wherever that move had got to.
      layout();
      void card.offsetWidth;
      if (!still) card.style.transition = CARD_MOTION;
      card.style.opacity = "1";
      card.style.transform = "none";
      api.debug("message", { w: card.offsetWidth, h: card.offsetHeight });

      playSound();
    }

    function cta(via) {
      if (stopped || fired || picked === -1 || Date.now() - pickedAt < CTA_GUARD_MS) return;
      // The ad stays mounted after the click, so without this every further tap
      // would raise another AdClickThru and open the destination again.
      fired = true;
      api.debug("cta", { via: via });
      api.clickThrough();
    }

    // --- sound --------------------------------------------------------------
    /** The player's ad volume, 0–1. Anything that is not a volume is silence, not full blast. */
    function volume() {
      var v = typeof api.volume === "function" ? Number(api.volume()) : 1;
      return v >= 0 ? Math.min(v, 1) : 0;
    }

    function playSound() {
      if (soundMode === "off") {
        api.debug("sound", { mode: "off", played: false });
        return;
      }
      var vol = volume();
      if (vol === 0) {
        api.debug("sound", { mode: soundMode, played: false, reason: "muted" });
        return;
      }
      // A file that already failed to load gets the chime, inside the tap.
      if (audio && !audio.error) playCustom(vol, Date.now());
      else chime(vol, audio ? "chime-fallback" : "chime");
    }

    /**
     * The advertiser's file, started inside the tap or not at all. One that has
     * not begun within SOUND_DEADLINE_MS — a cold cache on a slow link, a browser
     * that ignored preload — is stopped rather than left to sound seconds after
     * the gesture that asked for it. One that fails fast plays the chime while
     * the tap is still the reason; the ad ending, our own stop, or a browser
     * that refused playback outright play nothing.
     */
    function playCustom(vol, tapAt) {
      var reported = false;
      // Nothing is reported once the ad has ended: cleanup's own pause rejects a
      // pending play(), and that is the ad stopping, not a sound failing.
      function report(record) {
        if (reported) return;
        reported = true;
        clearTimeout(soundDeadline);
        if (!stopped) api.debug("sound", record);
      }
      function onPlaying() {
        audio.removeEventListener("playing", onPlaying);
        report({ mode: "custom", played: true, volume: vol });
      }
      audio.addEventListener("playing", onPlaying);
      soundDeadline = setTimeout(function () {
        if (reported) return;
        audio.removeEventListener("playing", onPlaying);
        report({ mode: "custom", played: false, reason: "late" });
        audio.pause();
      }, SOUND_DEADLINE_MS);
      // No rewind first: the file has never played (there is one pick), and an
      // engine that throws on seeking before metadata would take play() with it.
      audio.volume = vol;
      var p;
      try {
        p = audio.play();
      } catch (e) {
        report({ mode: "custom", played: false, reason: "error" });
        if (Date.now() - tapAt < SOUND_DEADLINE_MS) chime(vol, "chime-fallback");
        return;
      }
      if (p && typeof p.then === "function") {
        p.then(null, function (e) {
          var reason = (e && e.name) || "error";
          if (reported) return;
          audio.removeEventListener("playing", onPlaying);
          report({ mode: "custom", played: false, reason: reason });
          if (stopped || reason === "AbortError" || reason === "NotAllowedError") return;
          if (Date.now() - tapAt < SOUND_DEADLINE_MS) chime(vol, "chime-fallback");
        });
      }
    }

    /**
     * A short two-note chime, synthesised rather than shipped: no audio file to
     * fetch on every impression, and nobody else's recording (ADR-0024). Created
     * inside the viewer's tap, which is what lets an AudioContext start running.
     */
    function chime(vol, mode) {
      if (stopped) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        api.debug("sound", { mode: mode, played: false, reason: "no-webaudio" });
        return;
      }
      var ctx;
      try {
        ctx = new AC();
        var out = ctx.createGain();
        out.gain.value = vol;
        out.connect(ctx.destination);
        var t0 = ctx.currentTime + 0.01;
        note(ctx, out, 1046.5, t0, 0.3); // C6
        note(ctx, out, 1568, t0 + 0.1, 0.55); // G6
      } catch (e) {
        api.debug("sound", { mode: mode, played: false, reason: "error" });
        return;
      }
      // Idempotent, and the promise swallowed: a second close() — the ad ending
      // inside the 1.5s below — rejects asynchronously with InvalidStateError,
      // which no try/catch sees, and that lands in the host page's console.
      var closed = false;
      function closeIt() {
        if (closed) return;
        closed = true;
        if (closeChime === closeIt) closeChime = null;
        try {
          var c = ctx.close();
          if (c && typeof c.catch === "function") c.catch(function () {});
        } catch (e) {
          /* an engine whose close() throws instead */
        }
      }
      closeChime = closeIt;
      var reported = false;
      function done() {
        if (reported) return;
        reported = true;
        if (!stopped) {
          api.debug("sound", {
            mode: mode,
            played: ctx.state === "running",
            volume: vol,
            state: ctx.state,
          });
        }
        setTimeout(closeIt, 1500);
      }
      var r = ctx.state === "suspended" && ctx.resume ? ctx.resume() : null;
      if (r && typeof r.then === "function") r.then(done, done);
      else done();
    }

    /** One bell-like note: a sine plus a quieter octave, fast attack, exponential decay. */
    function note(ctx, out, freq, at, dur) {
      var partials = [
        [1, 0.3],
        [2, 0.07],
      ];
      for (var k = 0; k < partials.length; k++) {
        var o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * partials[k][0];
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(partials[k][1], at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur / partials[k][0]);
        o.connect(g);
        g.connect(out);
        o.start(at);
        o.stop(at + dur + 0.05);
      }
    }
  },
};

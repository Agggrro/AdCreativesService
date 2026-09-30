/**
 * Dress/Undress (Before/After) Slider — VPAID render module.
 * Two same-framed images; a draggable divider reveals the "after" image over the
 * "before". A CTA fires the click-through. Config (AdParameters):
 * imageBeforeUrl, imageAfterUrl, direction, startPercent, hintStyle, hintText,
 * hintSwing, ctaText, clickThroughUrl.
 *
 * `direction` is "horizontal" — the divider moves left and right, "after" to its
 * left — or "vertical" — it moves up and down, "after" above it. Anything else is
 * horizontal, absent included: every creative saved before the setting existed
 * has no `direction` at all, and must keep rendering the way it did.
 * `startPercent` is measured along that axis, from the left edge or the top.
 * The CTA sits at the bottom centre; in vertical mode, where the divider sweeps
 * the whole height, it sits at the right edge instead, centred in the height.
 *
 * Until the viewer first grabs the divider, the unit says it can be grabbed, in
 * the way `hintStyle` names:
 * - "label" (the default, absent included): the knob is a white capsule holding
 *   `hintText` (default "PULL") between the two ways to drag, its chevrons
 *   nudging outward. Nothing is laid over the picture beyond the handle itself,
 *   and at the first grab the capsule shrinks back into the round knob.
 * - "arrows": the round knob alone, its chevrons nudging, a ring pulsing round it.
 * - "off": nothing.
 * `hintSwing` "on" adds, to any of them, the divider swinging by itself — out,
 * back past its start, to rest — every few seconds for about half a minute,
 * showing a sliver of "after".
 * Everything drawn over the advertiser's picture carries its own contrast (a
 * white knob on a dark shadow, a haloed line), because that picture can be
 * anything.
 */
var TEMPLATE = {
  name: "slider",
  duration: 15,
  onStart: function (slot, params, api) {
    if (!slot) return;
    var vertical = params.direction === "vertical";
    // The window the slot lives in, which is not always the one this code runs
    // in: Fluid Player loads the unit into an iframe of its own but builds the
    // slot in the host page (fluid-player: modules/vpaid.js `loadVpaid`,
    // modules/adsupport.js `switchPlayerToVpaidMode`). A mouseup over the slot
    // never reaches this script's `window` there, so a drag bound to it never
    // let go — the divider kept following the cursor after the button was up.
    var win = (slot.ownerDocument && slot.ownerDocument.defaultView) || window;
    var SVG_NS = "http://www.w3.org/2000/svg";
    // 44px across: the floor for anything a finger has to find
    // (docs/design-system.md §8). The knob this replaced was 34.
    var KNOB = 44;
    // The capsule is shorter than the round knob — it carries a word across the
    // picture and should cover as little of it as a word allows. It is no
    // smaller a target for that: the whole slot is the drag surface.
    var CAP_H = 30;
    var KNOB_GAP = 8; // clear space kept between the knob and the CTA, px
    var CTA_EDGE = 14; // the CTA's offset from the slot edge it sits against, px
    var EDGE = 8; // the least room the capsule leaves to any edge of the slot, px
    var SWING = 12; // the swing's first peak, % of the axis
    var SWINGS = 10; // how many before the divider rests
    var TURN = { right: 0, down: 90, left: 180, up: -90 };
    var FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    var hintStyle =
      params.hintStyle === "arrows" || params.hintStyle === "off" ? params.hintStyle : "label";
    var hintText = (typeof params.hintText === "string" && params.hintText.trim()) || "PULL";
    // Under reduced motion nothing travels: the chevrons rest, the ring pulses in
    // opacity alone, and the swing — nothing but movement — does not run at all.
    var still = false;
    try {
      still = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      /* no matchMedia: animate */
    }
    var swing = params.hintSwing === "on" && !still;

    // The axis is reported with the size, because every later `position`
    // record means something different on each: 80% from the left edge, or
    // 80% from the top.
    api.debug("mount", {
      w: slot.clientWidth,
      h: slot.clientHeight,
      direction: vertical ? "vertical" : "horizontal",
      hint: hintStyle,
      swing: swing ? "on" : "off",
      motion: still ? "reduced" : "full",
    });

    // Web Animations rather than a <style> block: nothing injected into a page we
    // do not own, no class names to collide with a publisher's. Every one is kept,
    // because none of them stops when its element leaves the DOM.
    var anims = [];
    function animate(el, frames, opts) {
      if (typeof el.animate !== "function") return null;
      var a = el.animate(frames, opts);
      anims.push(a);
      return a;
    }
    function cancelAnims() {
      for (var i = 0; i < anims.length; i++) {
        try {
          anims[i].cancel();
        } catch (e) {
          /* already gone */
        }
      }
      anims = [];
    }
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    /**
     * One `>` chevron, drawn rather than typed — a glyph is centred by its line
     * box, not its ink, and its shape depends on the fonts a player's device
     * happens to have (the base's close control made the same move).
     */
    function chevron(size, stroke, colour) {
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);
      svg.setAttribute("viewBox", "0 0 12 12");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.style.cssText = "display:block;flex:none;overflow:visible;";
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", "M4.25 2.5 7.75 6l-3.5 3.5");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", colour);
      p.setAttribute("stroke-width", stroke);
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
      return svg;
    }
    /**
     * A chevron turned to point `dir`. The turn is held by a wrapper, so the
     * chevron inside can be nudged along its own axis: one motion, all four ways.
     */
    function pointer(dir, size) {
      var turn = document.createElement("span");
      turn.style.cssText = "display:block;flex:none;transform:rotate(" + TURN[dir] + "deg);";
      var head = chevron(size, 2, "#1d1f23");
      turn.appendChild(head);
      return { el: turn, head: head };
    }
    function nudge(head, px) {
      if (still) return;
      animate(
        head,
        [
          { transform: "translateX(0)" },
          { transform: "translateX(" + px + "px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 1400, iterations: Infinity, easing: "ease-in-out" },
      );
    }

    function layer(url, name) {
      var d = document.createElement("div");
      d.style.cssText = "position:absolute;inset:0;overflow:hidden;";
      d.appendChild(adInteractFitMedia(url, api, name).el);
      return d;
    }

    // Bottom = "before" (full); top = "after", the same full-slot layer clipped
    // back to the divider. Clipping keeps the two pictures framed identically on
    // either axis and at any size, with nothing measured. The box this replaced
    // shrank instead, which meant pinning the picture inside it to the slot's
    // width in pixels at mount — a pin that went stale when a player resized the
    // slot, and one that would have needed a second, height-pinned twin here.
    slot.appendChild(layer(params.imageBeforeUrl, "before"));
    var after = layer(params.imageAfterUrl, "after");
    slot.appendChild(after);

    // Divider handle: a line across the slot, centred on the edge it reveals —
    // white, inside a dark hairline, so it reads on a white picture as well as a
    // black one.
    var handle = document.createElement("div");
    handle.style.cssText =
      "position:absolute;z-index:3;background:#fff;touch-action:none;" +
      "box-shadow:0 0 0 1px rgba(0,0,0,.22),0 0 12px rgba(0,0,0,.4);" +
      (vertical
        ? "left:0;right:0;height:2px;transform:translateY(-50%);cursor:ns-resize;"
        : "top:0;bottom:0;width:2px;transform:translateX(-50%);cursor:ew-resize;");
    // The knob: a white disc on a soft dark shadow, or while the "label" hint is
    // up, a capsule. Centred with margins, which leaves `transform` free for the
    // press feedback below; radii in pixels, since 50% of a capsule is an
    // ellipse. Left to right whatever the page says: in a player that builds the
    // slot in the host page, the slot inherits that page's direction, and on a
    // right-to-left one its rows would run the other way — the two chevrons
    // pointing at each other.
    var knob = document.createElement("div");
    knob.style.cssText =
      "position:absolute;top:50%;left:50%;box-sizing:border-box;" +
      "width:" + KNOB + "px;height:" + KNOB + "px;padding:0;" +
      "margin:-" + KNOB / 2 + "px 0 0 -" + KNOB / 2 + "px;border-radius:" + KNOB / 2 + "px;" +
      "background:#fff;border:1px solid rgba(0,0,0,.08);" +
      "box-shadow:0 6px 18px rgba(0,0,0,.32),0 1px 3px rgba(0,0,0,.28);" +
      "display:flex;align-items:center;justify-content:center;direction:ltr;" +
      "color:#1d1f23;font:700 12px/14px " + FONT + ";letter-spacing:.12em;" +
      "text-transform:uppercase;white-space:nowrap;";
    // What the knob holds — the round grip, or the capsule's word and chevrons —
    // in one box, so swapping one for the other leaves the ring where it is.
    // min-width:0 down the chain, or an over-long word never gives way to its
    // ellipsis.
    var body = document.createElement("span");
    body.style.cssText = "display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;";
    knob.appendChild(body);
    // "arrows" only: a ring pulsing outward until the first grab. A dark hairline
    // keeps it visible over white.
    var ring = null;
    if (hintStyle === "arrows") {
      ring = document.createElement("div");
      ring.style.cssText =
        "position:absolute;inset:-1px;border-radius:50%;border:2px solid #fff;" +
        "box-shadow:0 0 0 1px rgba(0,0,0,.14);pointer-events:none;opacity:0;";
      knob.appendChild(ring);
    }
    handle.appendChild(knob);
    slot.appendChild(handle);

    function emptyBody() {
      while (body.firstChild) body.removeChild(body.firstChild);
    }
    /** The round knob's two chevrons, pointing the two ways it travels. */
    function showGrip(nudging) {
      emptyBody();
      var grip = document.createElement("span");
      grip.style.cssText =
        "display:flex;align-items:center;justify-content:center;" +
        (vertical ? "flex-direction:column;" : "");
      var dirs = vertical ? ["up", "down"] : ["left", "right"];
      for (var i = 0; i < dirs.length; i++) {
        var p = pointer(dirs[i], 14);
        grip.appendChild(p.el);
        if (nudging) nudge(p.head, 3);
      }
      body.appendChild(grip);
    }

    // CTA. Above the handle, so a divider crossing it never covers the click.
    // At the bottom centre it would sit in the vertical divider's path for the
    // whole lower stretch of the drag, so in vertical mode it moves to the right
    // edge, centred in the height, and keeps to the right half: the knob rides
    // down the centre.
    var btn = document.createElement("button");
    // Not the default "submit": in a player that builds the slot in the host
    // page, a page-wide <form> around it would be submitted by the CTA.
    btn.type = "button";
    btn.textContent = params.ctaText || "See more";
    // border-box stated rather than inherited: the right-half cap is the button's
    // outer width only then, whatever a host page's own button rules say. The
    // cap wraps a label at its spaces; min-content keeps it from squeezing one
    // long word ("Зарегистрироваться") narrower than the word, which overflowed
    // the button and the slot. A button that widens past the centre that way is
    // one the knob already steps around (knobLeft reads its real width). At
    // least 44px tall, like the knob; white on #e11d48 is 4.7:1. Hover darkens
    // the red alone, to #cf1b42 (5.4:1): a brightness filter would dim the white
    // label with it, to 4.5:1, and lightening drops the pair to 4.1:1.
    var RED = "#e11d48";
    btn.style.cssText =
      "position:absolute;z-index:4;box-sizing:border-box;" +
      (vertical
        ? "right:" + CTA_EDGE + "px;top:50%;transform:translateY(-50%);" +
          "max-width:calc(50% - " + CTA_EDGE + "px);min-width:min-content;"
        : "left:50%;bottom:" + CTA_EDGE + "px;transform:translateX(-50%);") +
      "min-height:44px;padding:12px 22px;border:0;border-radius:999px;" +
      "background:" + RED + ";color:#fff;font:700 15px/1.2 " + FONT + ";letter-spacing:.01em;" +
      "cursor:pointer;box-shadow:0 8px 22px rgba(225,29,72,.38),0 2px 6px rgba(0,0,0,.3);" +
      "transition:background-color .15s ease-out;";
    btn.addEventListener("click", function () {
      api.clickThrough();
    });
    btn.addEventListener("mouseenter", function () {
      btn.style.backgroundColor = "#cf1b42";
    });
    // Back to the red, not to "": the inline colour is the only thing between
    // this button and the page's own button style.
    btn.addEventListener("mouseleave", function () {
      btn.style.backgroundColor = RED;
    });
    slot.appendChild(btn);

    // --- the hint --------------------------------------------------------------
    var hintGone = false;
    // The capsule's state while it is up: its width as the word sets it, that
    // width capped to the slot, and how far an edge of the slot pushed it off
    // the line, px (at a start by the edge, it hangs inside rather than half out).
    var capsuleOn = false;
    var capNatural = 0;
    var capW = 0;
    var capShift = 0;
    // True until the first grab when the divider swings: the knob keeps clear of
    // the CTA across the whole swing, not just where the divider starts.
    var swinging = swing;
    /** How far the swing can carry the knob either way, px: 0.76 of its first peak, rounded up. */
    function swingReach(h) {
      return swinging ? ((SWING * 0.8) / 100) * h : 0;
    }

    /**
     * The "label" hint: the word between the two ways to drag, in the knob itself
     * — nothing over the picture that the knob would not cover anyway. Vertical
     * mode stacks its chevrons before the word; horizontal puts one either side.
     */
    function buildCapsule() {
      emptyBody();
      var word = document.createElement("span");
      word.textContent = hintText;
      word.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;";
      // An instruction for the eye, hidden from screen readers like the chevrons:
      // the divider has no keyboard control for it to name.
      word.setAttribute("aria-hidden", "true");
      if (vertical) {
        var stack = document.createElement("span");
        stack.style.cssText = "display:flex;flex-direction:column;align-items:center;flex:none;";
        var up = pointer("up", 10);
        var down = pointer("down", 10);
        down.el.style.marginTop = "-1px";
        stack.appendChild(up.el);
        stack.appendChild(down.el);
        body.appendChild(stack);
        body.appendChild(word);
        nudge(up.head, 2);
        nudge(down.head, 2);
      } else {
        var back = pointer("left", 11);
        var ahead = pointer("right", 11);
        body.appendChild(back.el);
        body.appendChild(word);
        body.appendChild(ahead.el);
        nudge(back.head, 3);
        nudge(ahead.head, 3);
      }
      knob.style.padding = "0 12px";
      knob.style.height = CAP_H + "px";
      knob.style.borderRadius = CAP_H / 2 + "px";
      capsuleOn = true;
      measureCapsule();
    }
    // Measured at max-content, then pinned in pixels, which is what lets the
    // width animate when the capsule collapses. Not shrink-to-fit: that sizes
    // the capsule to the box it sits in, the line — 2px wide in horizontal
    // mode, which cut the word to "PU…". Each assignment an engine does not
    // understand is ignored, so the last one it does is the one it keeps. One
    // pixel over, because offsetWidth rounds and a word a fraction of a pixel
    // wider than its box still ends in an ellipsis. A slot not yet laid out
    // measures 0; the observer measures again once it has a size.
    function measureCapsule() {
      knob.style.width = "auto";
      knob.style.width = "-webkit-max-content";
      knob.style.width = "max-content";
      capNatural = knob.offsetWidth ? knob.offsetWidth + 1 : 0;
    }

    // The vertical divider still crosses the CTA at mid-height, and a knob that
    // met the button there would sink behind it — a white rim showing past the
    // CTA's edge. The two only meet when a long label, or the capsule's width,
    // reaches toward the centre column; then the knob steps aside to the left of
    // the button, and back once the line has passed. Worked out in pixels,
    // because that is how the CTA is anchored, on every move and on every
    // resize: a player can resize the slot under a divider left parked there.
    // With no room beside the CTA, the knob stays centred behind it.
    function knobLeft() {
      var w = slot.clientWidth;
      var h = slot.clientHeight;
      var kw = capsuleOn ? capW : KNOB;
      var kh = capsuleOn ? CAP_H : KNOB;
      var y = (pct / 100) * h;
      if (capsuleOn) y = clamp(y, kh / 2 + EDGE, h - kh / 2 - EDGE);
      var hx = kw / 2 + KNOB_GAP;
      var hy = kh / 2 + KNOB_GAP + swingReach(h);
      var ctaLeft = w - CTA_EDGE - btn.offsetWidth;
      var ctaHalf = btn.offsetHeight / 2;
      var meets = w / 2 + hx > ctaLeft && y + hy > h / 2 - ctaHalf && y - hy < h / 2 + ctaHalf;
      var aside = ctaLeft - hx;
      return meets && aside >= kw / 2 ? aside + "px" : "50%";
    }
    /**
     * The widest the capsule may be, the rest of a long word giving way to an
     * ellipsis. The slot, less its margins — and in vertical mode, where the
     * capsule rides the centre column across the full width, less what it would
     * run into at its height (the swing's included): at the CTA's height, the
     * room left of the button, which the knob then steps into; near the top,
     * whatever keeps it clear of the close control while it stays centred.
     */
    function capsuleRoom(w, h) {
      var room = w - 2 * EDGE;
      if (!vertical) return room;
      var y = clamp((pct / 100) * h, CAP_H / 2 + EDGE, h - CAP_H / 2 - EDGE);
      var reach = CAP_H / 2 + KNOB_GAP + swingReach(h);
      var ctaHalf = btn.offsetHeight / 2;
      if (y + reach > h / 2 - ctaHalf && y - reach < h / 2 + ctaHalf) {
        room = Math.min(room, w - CTA_EDGE - btn.offsetWidth - KNOB_GAP - EDGE);
      }
      // The base's close control is 26px, 10px in from the top-right corner.
      if (y - reach < 36) room = Math.min(room, w - 2 * (36 + KNOB_GAP));
      return room;
    }
    // Horizontal mode has the mirror case on a short slot: the knob rides the
    // middle of the height, and there that puts its lower rim behind the bottom
    // CTA wherever the two cross. Then it rides higher, clear of the button's
    // top edge — at one height for the whole drag, so it never jumps under the
    // pointer. With no room above the CTA either, it stays centred.
    function knobTop() {
      var h = slot.clientHeight;
      var y = h - CTA_EDGE - btn.offsetHeight - KNOB_GAP - KNOB / 2;
      return y < h / 2 && y >= KNOB / 2 ? y + "px" : "50%";
    }
    function placeKnob() {
      var w = slot.clientWidth;
      var h = slot.clientHeight;
      if (capsuleOn) {
        if (!capNatural) measureCapsule();
        capW = Math.max(0, Math.min(capNatural, capsuleRoom(w, h)));
        if (capW) knob.style.width = capW + "px";
      }
      if (vertical) knob.style.left = knobLeft();
      else knob.style.top = knobTop();
      if (!capsuleOn || !w || !h) return;
      // On the line, unless that would put part of the capsule off the slot.
      var at = (pct / 100) * (vertical ? h : w);
      var half = (vertical ? CAP_H : capW) / 2;
      var shift = clamp(at, half + EDGE, (vertical ? h : w) - half - EDGE) - at;
      capShift = shift;
      knob.style.margin = vertical
        ? -CAP_H / 2 + shift + "px 0 0 " + -capW / 2 + "px"
        : -CAP_H / 2 + "px 0 0 " + (-capW / 2 + shift) + "px";
    }

    var pct = 50;
    function setPct(next) {
      // NaN comes only from a slot measured at zero size mid-drag: keep the
      // last position rather than store it.
      if (isNaN(next)) return;
      pct = Math.max(0, Math.min(100, next));
      // Read before writing. move() has just measured the slot, so the knob's
      // measurements cost nothing here; taken after the writes below, they
      // would force a second layout on every pointer move.
      var left = vertical ? knobLeft() : "";
      // inset(top right bottom left): trim "after" on the far side of the divider.
      var clip = clipAt(pct);
      after.style.setProperty("-webkit-clip-path", clip);
      after.style.setProperty("clip-path", clip);
      handle.style[vertical ? "top" : "left"] = pct + "%";
      if (vertical) knob.style.left = left;
    }
    function clipAt(p) {
      var rest = 100 - p + "%";
      return vertical ? "inset(0 0 " + rest + " 0)" : "inset(0 " + rest + " 0 0)";
    }

    if (hintStyle === "label") buildCapsule();
    else showGrip(hintStyle === "arrows");

    // parseFloat, not `Number(x) || 50`, which turned a configured 0 into 50.
    // A start at the edge is a real setting: the whole "before", with the drag
    // revealing every bit of "after".
    var start = parseFloat(params.startPercent);
    setPct(isFinite(start) ? start : 50);
    placeKnob();

    // --- the hint's motion -----------------------------------------------------
    if (ring) {
      var pulse = animate(
        ring,
        still
          ? [{ opacity: 0.7 }, { opacity: 0.15 }, { opacity: 0.7 }]
          : [
              { transform: "scale(1)", opacity: 0.8 },
              { transform: "scale(1.7)", opacity: 0 },
            ],
        { duration: still ? 2000 : 1600, iterations: Infinity, easing: "cubic-bezier(.22,.61,.36,1)" },
      );
      // Without Web Animations the ring still marks the knob, just unmoving.
      if (!pulse) ring.style.opacity = ".6";
    }
    /**
     * The swing: a pause, then out toward the side with more room, back past the
     * start and to rest — one damped sine, 12% of the axis at its first peak,
     * every 3.4s. Sampled into Web Animations on the line and on the "after"
     * picture's clip, both on the same timing, so the two keep in step with no
     * script per frame; the knob rides the line. The capsule rides it too, and
     * never past the slot's margin: each way, the swing goes only as far as the
     * capsule has room — none toward an edge it already hangs against, less for
     * a word as wide as the slot.
     */
    function startSwing() {
      var from = pct;
      var sign = from > 50 ? -1 : 1;
      var fwd = SWING;
      var back = SWING;
      var L = vertical ? slot.clientHeight : slot.clientWidth;
      if (capsuleOn && L) {
        var half = (vertical ? CAP_H : capW) / 2;
        var c = (from / 100) * L + capShift;
        var up = ((L - EDGE - half - c) / L) * 100;
        var down = ((c - half - EDGE) / L) * 100;
        sign = up >= down ? 1 : -1;
        fwd = Math.max(0, sign > 0 ? up : down);
        back = Math.max(0, sign > 0 ? down : up);
      }
      var REST = 0.4;
      var SPAN = 1.8;
      var PERIOD = 3.4;
      var STEPS = 16;
      var line = [];
      var clip = [];
      function key(offset, p) {
        p = clamp(p, 0, 100);
        var k = { offset: offset };
        k[vertical ? "top" : "left"] = p + "%";
        line.push(k);
        clip.push({ offset: offset, clipPath: clipAt(p) });
      }
      key(0, from);
      for (var i = 0; i <= STEPS; i++) {
        var u = i / STEPS;
        var o = clamp(SWING * Math.sin(u * 2 * Math.PI) * (1 - u), -back, fwd);
        key((REST + u * SPAN) / PERIOD, from + sign * o);
      }
      key(1, from);
      // Ten swings, about half a minute, and then the divider rests — the hint in
      // the knob keeps saying the rest. Moving the line and re-clipping "after"
      // are main-thread work on every frame, and an ad left on screen untouched
      // would otherwise spend it for as long as it stayed up, against Chrome's
      // heavy-ad allowance of a minute of main-thread time in all.
      var timing = { duration: PERIOD * 1000, iterations: SWINGS };
      animate(handle, line, timing);
      animate(after, clip, timing);
    }
    if (swing) startSwing();

    api.debug("hint", {
      style: hintStyle,
      swing: swing ? "on" : "off",
      w: Math.round(knob.offsetWidth),
      h: Math.round(knob.offsetHeight),
    });

    /**
     * The hint goes at the first grab — or when the ad ends, or the slot leaves
     * the page. The swing stops where the viewer takes over, the chevrons come to
     * rest, and the capsule shrinks back into the round knob.
     */
    function hideHint(reason) {
      if (hintGone) return;
      hintGone = true;
      swinging = false;
      cancelAnims();
      if (ring) ring.style.display = "none";
      if (capsuleOn) {
        capsuleOn = false;
        showGrip(false);
        knob.style.padding = "0";
        knob.style.width = KNOB + "px";
        knob.style.height = KNOB + "px";
        knob.style.margin = "-" + KNOB / 2 + "px 0 0 -" + KNOB / 2 + "px";
        knob.style.borderRadius = KNOB / 2 + "px";
      }
      // "off" with no swing showed nothing, and has nothing to report going.
      if (reason && (hintStyle !== "off" || swing)) api.debug("hint", { hidden: reason });
    }

    // The knob's first place is committed before the knob is given a transition:
    // with one already set, a start inside the CTA band would slide the knob
    // there from the centre as the ad appears. A call, not a bare property read,
    // so minification cannot drop it (the base's close ring does the same).
    knob.getBoundingClientRect();
    knob.style.transition =
      "transform .15s ease-out,width .2s ease-out,height .2s ease-out," +
      "margin .2s ease-out,border-radius .2s ease-out" +
      (vertical ? ",left .15s ease-out" : "");

    function relayout() {
      // A host can take the slot out of its page without ending the ad — a
      // single-page site tearing its player down, say — and the hint's endless
      // animations would run on there for the rest of the visit, with no stopAd
      // to end them. The observer sees the slot go (it reports 0×0), and the
      // hint goes with it, as at the first grab.
      if (!slot.isConnected) {
        hideHint("detached");
        return;
      }
      placeKnob();
    }
    // From the slot's own window as well: an observer belongs to the document
    // of the realm that made it, not to its target's.
    var observer = null;
    if (typeof win.ResizeObserver === "function") {
      observer = new win.ResizeObserver(relayout);
      observer.observe(slot);
    } else {
      win.addEventListener("resize", relayout);
    }

    var dragging = false;
    var stopped = false;
    function move(e) {
      if (!dragging) return;
      var r = slot.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      setPct(
        vertical
          ? ((t.clientY - r.top) / r.height) * 100
          : ((t.clientX - r.left) / r.width) * 100,
      );
      if (e.preventDefault) e.preventDefault();
    }
    // A press on a button in the slot — the CTA, or the base's close control —
    // belongs to that button. Taken as a grab, it moved the divider to wherever
    // the button sits before the click landed, and reported that as a drag.
    function startDrag(e) {
      if (stopped) return;
      var target = e.target;
      if (target && target.closest && target.closest("button")) return;
      hideHint("drag");
      dragging = true;
      // The knob answers the grab: a touch larger while held.
      knob.style.transform = "scale(1.08)";
      move(e);
    }
    // Reported when the drag ends, not from setPct: setPct runs on every
    // mousemove and would turn one gesture into a hundred records.
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      knob.style.transform = "";
      api.debug("position", { pct: Math.round(pct) });
    }
    slot.addEventListener("mousedown", startDrag);
    slot.addEventListener("mousemove", move);
    win.addEventListener("mouseup", endDrag);
    slot.addEventListener("touchstart", startDrag);
    slot.addEventListener("touchmove", move);
    slot.addEventListener("touchend", endDrag);
    // A touch the browser takes back (a system gesture, an incoming call) ends
    // with this rather than touchend.
    slot.addEventListener("touchcancel", endDrag);

    // The slot's window outlives the ad — it is the publisher's own page in
    // any player that builds the slot there — and neither an observer nor an
    // animation stops with its target, so all of it goes when the ad does. A
    // host may leave the slot up after that, and what is left is inert: without
    // the window's mouseup to end it, a drag started there would never let go of
    // the divider.
    api.onStop(function () {
      stopped = true;
      dragging = false;
      // A knob still held when the ad ends goes back to rest with it.
      knob.style.transform = "";
      hideHint(null);
      win.removeEventListener("mouseup", endDrag);
      win.removeEventListener("resize", relayout);
      if (observer) observer.disconnect();
    });
  },
};

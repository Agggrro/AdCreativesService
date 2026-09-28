/**
 * Dress/Undress (Before/After) Slider — VPAID render module.
 * Two same-framed images; a draggable divider reveals the "after" image over the
 * "before". A CTA fires the click-through. Config (AdParameters):
 * imageBeforeUrl, imageAfterUrl, direction, startPercent, hintText, ctaText,
 * clickThroughUrl.
 *
 * `direction` is "horizontal" — the divider moves left and right, "after" to its
 * left — or "vertical" — it moves up and down, "after" above it. Anything else is
 * horizontal, absent included: every creative saved before the setting existed
 * has no `direction` at all, and must keep rendering the way it did.
 * `startPercent` is measured along that axis, from the left edge or the top.
 * The CTA sits at the bottom centre; in vertical mode, where the divider sweeps
 * the whole height, it sits at the right edge instead, centred in the height.
 *
 * Until the viewer first grabs the divider, the unit says it can be grabbed: a
 * ring pulses round the knob, and beside it a pill carries `hintText` (default
 * "PULL") with an arrow that keeps nudging the way to drag — toward whichever
 * side of the slot has the room, flipped and nudged clear of the edges, the CTA
 * and the close control. Everything drawn over the advertiser's picture carries
 * its own contrast (a dark glass pill, a white knob on a dark shadow, a haloed
 * line), because that picture can be anything.
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
    var KNOB_GAP = 8; // clear space kept between the knob or the hint and the CTA, px
    var CTA_EDGE = 14; // the CTA's offset from the slot edge it sits against, px
    var HINT_GAP = 10; // between the knob's rim and the hint, px
    var EDGE = 8; // the least room the hint leaves to any edge of the slot, px
    var FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    var hintText = (typeof params.hintText === "string" && params.hintText.trim()) || "PULL";
    // Under reduced motion nothing travels: the ring and the arrow still pulse,
    // in opacity alone, and the hint appears where it stands.
    var still = false;
    try {
      still = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      /* no matchMedia: animate */
    }

    // The axis is reported with the size, because every later `position`
    // record means something different on each: 80% from the left edge, or
    // 80% from the top.
    api.debug("mount", {
      w: slot.clientWidth,
      h: slot.clientHeight,
      direction: vertical ? "vertical" : "horizontal",
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
    // The knob: a white disc on a soft dark shadow, and two chevrons pointing the
    // two ways it travels. Centred with margins, which leaves `transform` free
    // for the press feedback below.
    var knob = document.createElement("div");
    knob.style.cssText =
      "position:absolute;top:50%;left:50%;box-sizing:border-box;" +
      "width:" + KNOB + "px;height:" + KNOB + "px;" +
      "margin:-" + KNOB / 2 + "px 0 0 -" + KNOB / 2 + "px;border-radius:50%;" +
      "background:#fff;border:1px solid rgba(0,0,0,.08);" +
      "box-shadow:0 6px 18px rgba(0,0,0,.32),0 1px 3px rgba(0,0,0,.28);" +
      "display:flex;align-items:center;justify-content:center;";
    // Pulses outward until the first grab — the one signal a still picture of a
    // line cannot give. A dark hairline keeps it visible over white.
    var ring = document.createElement("div");
    ring.style.cssText =
      "position:absolute;inset:-1px;border-radius:50%;border:2px solid #fff;" +
      "box-shadow:0 0 0 1px rgba(0,0,0,.14);pointer-events:none;opacity:0;";
    knob.appendChild(ring);
    // Left to right whatever the page says: in a player that builds the slot in
    // the host page, the slot inherits that page's direction, and on a
    // right-to-left one this row would run the other way — the two chevrons
    // pointing at each other.
    var grip = document.createElement("div");
    grip.style.cssText =
      "display:flex;align-items:center;justify-content:center;direction:ltr;" +
      (vertical ? "flex-direction:column;" : "");
    var back = chevron(14, 2, "#1d1f23");
    var ahead = chevron(14, 2, "#1d1f23");
    back.style.transform = "rotate(" + (vertical ? -90 : 180) + "deg)";
    ahead.style.transform = vertical ? "rotate(90deg)" : "";
    grip.appendChild(back);
    grip.appendChild(ahead);
    knob.appendChild(grip);
    handle.appendChild(knob);
    slot.appendChild(handle);

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

    // The hint: dark glass under white type. 70% of near-black over the picture
    // keeps white text at 7.3:1 even on a pure white one (62% read as a washed-out
    // grey there, at 5.4:1), before the blur the browser adds behind it where it
    // has backdrop-filter. It never takes a pointer: the whole slot is the drag
    // surface anyway. Left to right like the knob's grip, so the arrow leads
    // on the side it is put on, whatever the host page's direction.
    var hint = document.createElement("div");
    hint.setAttribute("aria-hidden", "true");
    hint.style.cssText =
      "position:absolute;z-index:3;left:0;top:0;display:flex;align-items:center;gap:7px;" +
      "direction:ltr;" +
      "box-sizing:border-box;max-width:calc(100% - " + 2 * EDGE + "px);padding:8px 12px;" +
      "border-radius:999px;background:rgba(14,14,18,.7);" +
      "-webkit-backdrop-filter:blur(10px) saturate(1.4);backdrop-filter:blur(10px) saturate(1.4);" +
      "border:1px solid rgba(255,255,255,.22);box-shadow:0 6px 20px rgba(0,0,0,.35);" +
      "color:#fff;font:700 12px/14px " + FONT + ";letter-spacing:.12em;" +
      "text-transform:uppercase;white-space:nowrap;pointer-events:none;visibility:hidden;";
    var label = document.createElement("span");
    label.textContent = hintText;
    // min-width:0, or a flex item never shrinks below its text and the ellipsis
    // for an over-long hint never shows.
    label.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;";
    // The arrow: a double chevron in a fixed square, turned to face the way to
    // drag. Turning, not redrawing, keeps the pill the same size whichever way it
    // points, so it can be measured once and placed on either side.
    var arrow = document.createElement("span");
    arrow.style.cssText = "position:relative;display:block;flex:none;width:14px;height:14px;";
    var bob = document.createElement("span");
    bob.style.cssText = "position:absolute;inset:0;";
    var heads = [chevron(12, 2.2, "#fff"), chevron(12, 2.2, "#fff")];
    heads[0].style.cssText += "position:absolute;left:-2px;top:1px;";
    heads[1].style.cssText += "position:absolute;left:4px;top:1px;";
    bob.appendChild(heads[0]);
    bob.appendChild(heads[1]);
    arrow.appendChild(bob);
    hint.appendChild(label);
    hint.appendChild(arrow);
    slot.appendChild(hint);

    // The vertical divider still crosses the CTA at mid-height, and a knob that
    // met the button there would sink behind it — a white rim showing past the
    // CTA's edge. The two only meet when a long label reaches toward the centre
    // column; then the knob steps aside to the left of the button, and back once
    // the line has passed. Worked out in pixels, because that is how the CTA is
    // anchored, on every move and on every resize: a player can resize the slot
    // under a divider left parked there. With no room beside the CTA, the knob
    // stays centred behind it.
    function knobLeft() {
      var w = slot.clientWidth;
      var h = slot.clientHeight;
      var y = (pct / 100) * h;
      var reach = KNOB / 2 + KNOB_GAP;
      var ctaLeft = w - CTA_EDGE - btn.offsetWidth;
      var ctaHalf = btn.offsetHeight / 2;
      var meets =
        w / 2 + reach > ctaLeft && y + reach > h / 2 - ctaHalf && y - reach < h / 2 + ctaHalf;
      var aside = ctaLeft - reach;
      return meets && aside >= KNOB / 2 ? aside + "px" : "50%";
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
      if (vertical) knob.style.left = knobLeft();
      else knob.style.top = knobTop();
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
      var rest = 100 - pct + "%";
      var clip = vertical ? "inset(0 0 " + rest + " 0)" : "inset(0 " + rest + " 0 0)";
      after.style.setProperty("-webkit-clip-path", clip);
      after.style.setProperty("clip-path", clip);
      handle.style[vertical ? "top" : "left"] = pct + "%";
      if (vertical) knob.style.left = left;
    }
    // parseFloat, not `Number(x) || 50`, which turned a configured 0 into 50.
    // A start at the edge is a real setting: the whole "before", with the drag
    // revealing every bit of "after".
    var start = parseFloat(params.startPercent);
    setPct(isFinite(start) ? start : 50);
    if (!vertical) placeKnob();

    // --- the hint's place ----------------------------------------------------
    var hintDir = null;
    var hintGone = false;
    function hits(a, b) {
      return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    }
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }
    /**
     * Beside the knob, on the side the viewer should drag toward: the far side of
     * where the divider stands — and at exactly half, the way that reveals
     * "after" (down, or right). The pill is only ever as wide as the room on that
     * side, an over-long hint ending in an ellipsis rather than off the slot. It
     * steps off the CTA and the close control sideways where there is room and
     * along the axis where there is not (below the close control, above a bottom
     * CTA); a side it still cannot fit gives way to the other one. Only the start
     * position matters, since the hint goes at the first grab; it is placed again
     * on a resize, which can change the room.
     */
    function placeHint() {
      if (hintGone) return;
      var w = slot.clientWidth;
      var h = slot.clientHeight;
      if (!w || !h) return;
      var kl = knob.style.left;
      var kt = knob.style.top;
      var kx = vertical ? (/px$/.test(kl) ? parseFloat(kl) : w / 2) : (pct / 100) * w;
      var ky = vertical ? (pct / 100) * h : /px$/.test(kt) ? parseFloat(kt) : h / 2;
      var reach = KNOB / 2 + HINT_GAP;
      var bw = btn.offsetWidth;
      var bh = btn.offsetHeight;
      var cta = vertical
        ? [w - CTA_EDGE - bw, h / 2 - bh / 2, w - CTA_EDGE, h / 2 + bh / 2]
        : [w / 2 - bw / 2, h - CTA_EDGE - bh, w / 2 + bw / 2, h - CTA_EDGE];
      // The base's close control: 26px, 10px in from the top-right corner. It is
      // not mounted until onStart returns, so it cannot be measured here; the
      // base's _mountCloseControl carries a note to keep the two in step.
      var close = [w - 36, 10, w - 10, 36];
      var obstacles = [cta, close];
      function boxFor(dir) {
        var room =
          dir === "right" ? w - EDGE - (kx + reach) : dir === "left" ? kx - reach - EDGE : w - 2 * EDGE;
        hint.style.maxWidth = Math.max(0, Math.floor(room)) + "px";
        var hw = hint.offsetWidth;
        var hh = hint.offsetHeight;
        var x = dir === "right" ? kx + reach : dir === "left" ? kx - reach - hw : kx - hw / 2;
        var y = dir === "down" ? ky + reach : dir === "up" ? ky - reach - hh : ky - hh / 2;
        if (dir === "up" || dir === "down") x = clamp(x, EDGE, w - EDGE - hw);
        else y = clamp(y, EDGE, h - EDGE - hh);
        // Until nothing is in the way — a step off one obstacle can land on the
        // other. Both sit at the right edge, so in vertical mode the pill passes
        // them on their left if it fits there whole; failing that, it steps along
        // the axis past them; and only when neither works is the word cut to the
        // room on their left — a short hint should never lose letters to a wide
        // CTA it could simply have stepped past.
        for (var pass = 0; pass < 3; pass++) {
          var moved = false;
          for (var i = 0; i < obstacles.length; i++) {
            var o = obstacles[i];
            if (!hits([x, y, x + hw, y + hh], o)) continue;
            moved = true;
            if (vertical) {
              var beside = o[0] - KNOB_GAP - EDGE;
              var stepY = dir === "down" ? o[3] + KNOB_GAP : o[1] - KNOB_GAP - hh;
              if (hw <= beside) {
                x = clamp(kx - hw / 2, EDGE, o[0] - KNOB_GAP - hw);
              } else if (stepY >= EDGE && stepY + hh <= h - EDGE) {
                y = stepY;
              } else if (beside >= 56) {
                hint.style.maxWidth = Math.floor(beside) + "px";
                hw = hint.offsetWidth;
                hh = hint.offsetHeight;
                x = clamp(kx - hw / 2, EDGE, o[0] - KNOB_GAP - hw);
              } else {
                y = stepY;
              }
            } else {
              y = o === close ? o[3] + KNOB_GAP : o[1] - KNOB_GAP - hh;
            }
          }
          if (!moved) break;
        }
        return [x, y, x + hw, y + hh];
      }
      function clear(b) {
        return (
          b[2] - b[0] >= 56 &&
          b[0] >= EDGE - 0.5 &&
          b[1] >= EDGE - 0.5 &&
          b[2] <= w - EDGE + 0.5 &&
          b[3] <= h - EDGE + 0.5 &&
          !hits(b, cta) &&
          !hits(b, close)
        );
      }
      var prefer = vertical ? (pct <= 50 ? "down" : "up") : pct <= 50 ? "right" : "left";
      var other = { down: "up", up: "down", right: "left", left: "right" }[prefer];
      var dir = prefer;
      var b = boxFor(prefer);
      if (!clear(b)) {
        var alt = boxFor(other);
        if (clear(alt)) {
          dir = other;
          b = alt;
        } else {
          b = boxFor(prefer);
        }
      }
      var hw = b[2] - b[0];
      var hh = b[3] - b[1];
      hint.style.left = Math.round(b[0]) + "px";
      hint.style.top = Math.round(b[1]) + "px";
      if (dir !== hintDir) {
        hintDir = dir;
        arrow.style.transform =
          "rotate(" + { right: 0, down: 90, left: 180, up: -90 }[dir] + "deg)";
        // The arrow leads: before the word when it points left, after it otherwise.
        arrow.style.order = dir === "left" ? "-1" : "0";
        api.debug("hint", {
          dir: dir,
          x: Math.round(b[0]),
          y: Math.round(b[1]),
          w: Math.round(hw),
          h: Math.round(hh),
        });
      }
    }
    placeHint();

    // --- the hint's motion ---------------------------------------------------
    hint.style.visibility = "visible";
    // A beat after the ad appears, so it reads as a hint rather than decoration.
    animate(
      hint,
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(.92)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: 380, delay: 450, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" },
    );
    // The two heads light in turn, leading the eye the way to drag, and the
    // arrow nudges that way — in its own turned frame, so one motion serves all
    // four directions.
    for (var hi = 0; hi < heads.length; hi++) {
      animate(heads[hi], [{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }], {
        duration: 1200,
        delay: hi * 180,
        iterations: Infinity,
        easing: "ease-in-out",
      });
    }
    if (!still) {
      animate(
        bob,
        [
          { transform: "translateX(-1px)" },
          { transform: "translateX(3px)" },
          { transform: "translateX(-1px)" },
        ],
        { duration: 1200, iterations: Infinity, easing: "ease-in-out" },
      );
    }
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

    /** The hint and the ring go at the first grab, faded, or at once when the ad ends. */
    function hideHint(reason) {
      if (hintGone) return;
      hintGone = true;
      // The fade starts where the entrance has got to. A grab can beat it — for
      // the first half-second the hint is not on screen yet — and cancelled
      // first, the entrance would hand the fade a hint at full strength that the
      // viewer had never seen. An opacity that cannot be read (a slot taken out
      // of the page has no computed style) is nothing to fade.
      var from = 0;
      if (reason) {
        try {
          var seen = parseFloat(win.getComputedStyle(hint).opacity);
          if (seen >= 0) from = seen;
        } catch (e) {
          /* nothing to fade */
        }
      }
      cancelAnims();
      ring.style.display = "none";
      function drop() {
        if (hint.parentNode) hint.parentNode.removeChild(hint);
      }
      var fade =
        from > 0.02
          ? animate(hint, [{ opacity: from }, { opacity: 0 }], {
              duration: 180,
              easing: "ease-out",
              fill: "forwards",
            })
          : null;
      if (fade) fade.onfinish = drop;
      else drop();
      if (reason) api.debug("hint", { hidden: reason });
    }

    // The knob's first place, and the hint's beside it, are committed before the
    // knob is given a transition: with one already set, a start inside the CTA
    // band would slide the knob there from the centre as the ad appears. A call,
    // not a bare property read, so minification cannot drop it (the base's close
    // ring does the same).
    knob.getBoundingClientRect();
    knob.style.transition = "transform .15s ease-out" + (vertical ? ",left .15s ease-out" : "");

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
      placeHint();
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
      // Also after a grab: cancelling a fade still under way would bring the
      // hint back to full opacity on a slot a host leaves up.
      cancelAnims();
      if (hint.parentNode) hint.parentNode.removeChild(hint);
      win.removeEventListener("mouseup", endDrag);
      win.removeEventListener("resize", relayout);
      if (observer) observer.disconnect();
    });
  },
};

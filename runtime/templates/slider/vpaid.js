/**
 * Dress/Undress (Before/After) Slider — VPAID render module.
 * Two same-framed images; a draggable divider reveals the "after" image over the
 * "before". A CTA fires the click-through. Config (AdParameters):
 * imageBeforeUrl, imageAfterUrl, direction, startPercent, ctaText, clickThroughUrl.
 *
 * `direction` is "horizontal" — the divider moves left and right, "after" to its
 * left — or "vertical" — it moves up and down, "after" above it. Anything else is
 * horizontal, absent included: every creative saved before the setting existed
 * has no `direction` at all, and must keep rendering the way it did.
 * `startPercent` is measured along that axis, from the left edge or the top.
 * The CTA sits at the bottom centre; in vertical mode, where the divider sweeps
 * the whole height, it sits at the right edge instead, centred in the height.
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
    var KNOB = 34; // knob diameter, px
    var KNOB_GAP = 8; // clear space the knob keeps from the CTA, px
    var CTA_EDGE = 14; // the CTA's offset from the slot edge it sits against, px

    // The axis is reported with the size, because every later `position`
    // record means something different on each: 80% from the left edge, or
    // 80% from the top.
    api.debug("mount", {
      w: slot.clientWidth,
      h: slot.clientHeight,
      direction: vertical ? "vertical" : "horizontal",
    });

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

    // Divider handle: a line across the slot, centred on the edge it reveals.
    var handle = document.createElement("div");
    handle.style.cssText =
      "position:absolute;z-index:3;background:#fff;" +
      "box-shadow:0 0 6px rgba(0,0,0,.6);touch-action:none;" +
      (vertical
        ? "left:0;right:0;height:3px;transform:translateY(-50%);cursor:ns-resize;"
        : "top:0;bottom:0;width:3px;transform:translateX(-50%);cursor:ew-resize;");
    var knob = document.createElement("div");
    // ⇄ turned a quarter clockwise is ⇅, so the vertical knob rotates the same
    // glyph rather than asking a player's fonts for a second one.
    knob.style.cssText =
      "position:absolute;top:50%;left:50%;" +
      "transform:translate(-50%,-50%)" +
      (vertical ? " rotate(90deg)" : "") +
      ";width:" + KNOB + "px;height:" + KNOB + "px;border-radius:50%;" +
      "background:#fff;color:#111;font:700 16px sans-serif;" +
      "display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.5)";
    knob.textContent = "⇄";
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
    // one the knob already steps around (knobLeft reads its real width).
    btn.style.cssText =
      "position:absolute;z-index:4;box-sizing:border-box;" +
      (vertical
        ? "right:" + CTA_EDGE + "px;top:50%;transform:translateY(-50%);" +
          "max-width:calc(50% - " + CTA_EDGE + "px);min-width:min-content;"
        : "left:50%;bottom:" + CTA_EDGE + "px;transform:translateX(-50%);") +
      "padding:11px 20px;border:0;border-radius:8px;background:#e11d48;color:#fff;" +
      "font:700 15px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)";
    btn.addEventListener("click", function () {
      api.clickThrough();
    });
    slot.appendChild(btn);

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
    function placeKnob() {
      knob.style.left = knobLeft();
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

    var observer = null;
    if (vertical) {
      // The knob's first position is committed before it is given a transition:
      // with one already set, a start inside the CTA band would slide the knob
      // there from the centre as the ad appears. A call, not a bare property
      // read, so minification cannot drop it (the base's close ring does the
      // same).
      knob.getBoundingClientRect();
      knob.style.transition = "left .15s ease-out";
      // From the slot's own window as well: an observer belongs to the document
      // of the realm that made it, not to its target's.
      if (typeof win.ResizeObserver === "function") {
        observer = new win.ResizeObserver(placeKnob);
        observer.observe(slot);
      } else {
        win.addEventListener("resize", placeKnob);
      }
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
      dragging = true;
      move(e);
    }
    // Reported when the drag ends, not from setPct: setPct runs on every
    // mousemove and would turn one gesture into a hundred records.
    function endDrag() {
      if (!dragging) return;
      dragging = false;
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
    // any player that builds the slot there — and an observer outlives its
    // target, so both go when the ad does. A host may leave the slot up after
    // that, and what is left is inert: without the window's mouseup to end it,
    // a drag started there would never let go of the divider.
    api.onStop(function () {
      stopped = true;
      dragging = false;
      win.removeEventListener("mouseup", endDrag);
      win.removeEventListener("resize", placeKnob);
      if (observer) observer.disconnect();
    });
  },
};

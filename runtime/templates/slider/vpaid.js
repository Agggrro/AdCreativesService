/**
 * Dress/Undress (Before/After) Slider — VPAID render module.
 * Two same-framed images; a draggable divider reveals the "after" image over the
 * "before". A CTA fires the click-through. Config (AdParameters):
 * imageBeforeUrl, imageAfterUrl, startPercent, ctaText, clickThroughUrl.
 */
var TEMPLATE = {
  name: "slider",
  duration: 15,
  onStart: function (slot, params, api) {
    if (!slot) return;
    var W = slot.clientWidth || 640;

    function layer(url) {
      var d = document.createElement("div");
      d.style.cssText =
        "position:absolute;inset:0;background:#000 center/cover no-repeat;";
      if (url) d.style.backgroundImage = "url('" + url + "')";
      return d;
    }

    // Bottom = "before" (full); top = "after" clipped to the slider width.
    slot.appendChild(layer(params.imageBeforeUrl));
    var top = document.createElement("div");
    top.style.cssText = "position:absolute;inset:0;overflow:hidden;width:50%;";
    var inner = layer(params.imageAfterUrl);
    inner.style.width = W + "px";
    top.appendChild(inner);
    slot.appendChild(top);

    // Divider handle.
    var handle = document.createElement("div");
    handle.style.cssText =
      "position:absolute;top:0;bottom:0;left:50%;width:3px;background:#fff;" +
      "z-index:3;box-shadow:0 0 6px rgba(0,0,0,.6);cursor:ew-resize;touch-action:none;";
    var knob = document.createElement("div");
    knob.style.cssText =
      "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);" +
      "width:34px;height:34px;border-radius:50%;background:#fff;color:#111;" +
      "font:700 16px sans-serif;display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.5)";
    knob.textContent = "⇄";
    handle.appendChild(knob);
    slot.appendChild(handle);

    function setPct(pct) {
      pct = Math.max(0, Math.min(100, pct));
      top.style.width = pct + "%";
      handle.style.left = pct + "%";
    }
    setPct(Number(params.startPercent) || 50);

    var dragging = false;
    function move(e) {
      if (!dragging) return;
      var r = slot.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      setPct(((t.clientX - r.left) / r.width) * 100);
      if (e.preventDefault) e.preventDefault();
    }
    slot.addEventListener("mousedown", function (e) {
      dragging = true;
      move(e);
    });
    slot.addEventListener("mousemove", move);
    window.addEventListener("mouseup", function () {
      dragging = false;
    });
    slot.addEventListener("touchstart", function (e) {
      dragging = true;
      move(e);
    });
    slot.addEventListener("touchmove", move);
    slot.addEventListener("touchend", function () {
      dragging = false;
    });

    // CTA.
    var btn = document.createElement("button");
    btn.textContent = params.ctaText || "See more";
    btn.style.cssText =
      "position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;" +
      "padding:11px 20px;border:0;border-radius:8px;background:#e11d48;color:#fff;" +
      "font:700 15px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)";
    btn.addEventListener("click", function () {
      api.clickThrough();
    });
    slot.appendChild(btn);
  },
};

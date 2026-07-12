/**
 * Scratch & Reveal — VPAID render module.
 * Covers a reveal image with a scratchable canvas layer; once the user rubs
 * away >= revealThreshold%, the cover fades and a CTA appears -> click-through.
 * Config (via AdParameters): imageUrl, coverText, coverColor, revealThreshold,
 * ctaText, clickThroughUrl.
 */
var TEMPLATE = {
  name: "scratch_reveal",
  duration: 15,
  onStart: function (slot, params, api) {
    if (!slot) return;
    var W = slot.clientWidth || 640,
      H = slot.clientHeight || 360;

    // Reveal image underneath.
    var img = document.createElement("div");
    img.style.cssText =
      "position:absolute;inset:0;background:#000 center/cover no-repeat;";
    if (params.imageUrl)
      img.style.backgroundImage = "url('" + params.imageUrl + "')";
    slot.appendChild(img);

    // Scratchable cover.
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;";
    slot.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = params.coverColor || "#3a3a3a";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = "600 " + Math.round(W / 22) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(params.coverText || "Scratch to reveal", W / 2, H / 2);

    var drawing = false,
      revealed = false,
      radius = Math.max(18, W / 16),
      threshold = (Number(params.revealThreshold) || 40) / 100;

    function point(e) {
      var r = canvas.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      return {
        x: (t.clientX - r.left) * (W / r.width),
        y: (t.clientY - r.top) * (H / r.height),
      };
    }
    function erase(e) {
      if (!drawing) return;
      var p = point(e);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (e.preventDefault) e.preventDefault();
      checkReveal();
    }
    function checkReveal() {
      if (revealed) return;
      var d = ctx.getImageData(0, 0, W, H).data;
      var step = 4 * 16,
        clear = 0,
        total = 0;
      for (var i = 3; i < d.length; i += step) {
        total++;
        if (d[i] === 0) clear++;
      }
      if (total && clear / total >= threshold) reveal();
    }
    function reveal() {
      revealed = true;
      canvas.style.transition = "opacity .4s";
      canvas.style.opacity = "0";
      setTimeout(function () {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }, 400);
      var btn = document.createElement("button");
      btn.textContent = params.ctaText || "Watch full video";
      btn.style.cssText =
        "position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:3;" +
        "padding:12px 20px;border:0;border-radius:8px;background:#e11d48;color:#fff;" +
        "font:700 16px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)";
      btn.addEventListener("click", function () {
        api.clickThrough();
      });
      slot.appendChild(btn);
    }

    canvas.addEventListener("mousedown", function (e) {
      drawing = true;
      erase(e);
    });
    canvas.addEventListener("mousemove", erase);
    window.addEventListener("mouseup", function () {
      drawing = false;
    });
    canvas.addEventListener("touchstart", function (e) {
      drawing = true;
      erase(e);
    });
    canvas.addEventListener("touchmove", erase);
    canvas.addEventListener("touchend", function () {
      drawing = false;
    });
  },
};

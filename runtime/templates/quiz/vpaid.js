/**
 * Quick Setup Quiz — VPAID render module.
 * A question with 2-4 image options; picking one shows an honest "see results"
 * CTA that fires the click-through. No fabricated match data (ADR-0005).
 * Config (AdParameters): questionText, option{1..4}Label, option{1..4}ImageUrl,
 * resultText, clickThroughUrl.
 */
var TEMPLATE = {
  name: "quiz",
  duration: 15,
  onStart: function (slot, params, api) {
    if (!slot) return;

    var wrap = document.createElement("div");
    wrap.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;" +
      "align-items:center;justify-content:center;padding:16px;box-sizing:border-box;" +
      "background:#111;font-family:sans-serif;color:#fff;text-align:center;";
    slot.appendChild(wrap);

    var q = document.createElement("div");
    q.textContent = params.questionText || "What are you into?";
    q.style.cssText = "font:700 20px sans-serif;";
    wrap.appendChild(q);

    var row = document.createElement("div");
    row.style.cssText =
      "display:flex;gap:12px;flex-wrap:wrap;justify-content:center;";
    wrap.appendChild(row);

    var options = [];
    for (var i = 1; i <= 4; i++) {
      var label = params["option" + i + "Label"];
      if (!label) continue;
      options.push({ label: label, img: params["option" + i + "ImageUrl"] });
    }
    if (options.length === 0)
      options = [{ label: "Yes" }, { label: "Show me" }];

    options.forEach(function (opt) {
      var b = document.createElement("button");
      b.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:6px;" +
        "padding:10px;border:2px solid #444;border-radius:12px;background:#1c1c1c;" +
        "color:#fff;cursor:pointer;min-width:120px;";
      if (opt.img) {
        var im = document.createElement("div");
        im.style.cssText =
          "width:110px;height:110px;border-radius:8px;background:#000 center/cover no-repeat;background-image:url('" +
          opt.img +
          "');";
        b.appendChild(im);
      }
      var cap = document.createElement("span");
      cap.textContent = opt.label;
      cap.style.cssText = "font:600 15px sans-serif;";
      b.appendChild(cap);
      b.addEventListener("click", function () {
        showResult();
      });
      row.appendChild(b);
    });

    function showResult() {
      wrap.innerHTML = "";
      var msg = document.createElement("div");
      msg.textContent = params.resultText || "See your matches";
      msg.style.cssText = "font:700 20px sans-serif;margin-bottom:14px;";
      wrap.appendChild(msg);
      var cta = document.createElement("button");
      cta.textContent = params.ctaText || "Continue";
      cta.style.cssText =
        "padding:12px 22px;border:0;border-radius:8px;background:#e11d48;color:#fff;" +
        "font:700 16px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)";
      cta.addEventListener("click", function () {
        api.clickThrough();
      });
      wrap.appendChild(cta);
    }
  },
};

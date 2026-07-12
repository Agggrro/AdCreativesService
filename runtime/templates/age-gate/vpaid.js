/**
 * Age / Content Gate — VPAID render module.
 * A genuine 18+ confirmation over a blurred background. NOT a fake system
 * dialog (ADR-0005). Confirm fires the click-through; deny shows a notice.
 * Config (AdParameters): backgroundImageUrl, headline, subtext, confirmText,
 * denyText, clickThroughUrl.
 */
var TEMPLATE = {
  name: "age_gate",
  duration: 15,
  onStart: function (slot, params, api) {
    if (!slot) return;

    var bg = document.createElement("div");
    bg.style.cssText =
      "position:absolute;inset:0;background:#000 center/cover no-repeat;filter:blur(18px);transform:scale(1.1);";
    if (params.backgroundImageUrl)
      bg.style.backgroundImage = "url('" + params.backgroundImageUrl + "')";
    slot.appendChild(bg);

    var panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;" +
      "align-items:center;justify-content:center;padding:20px;box-sizing:border-box;" +
      "background:rgba(0,0,0,.55);font-family:sans-serif;color:#fff;text-align:center;";
    slot.appendChild(panel);

    var h = document.createElement("div");
    h.textContent = params.headline || "This content is 18+";
    h.style.cssText = "font:700 22px sans-serif;";
    panel.appendChild(h);

    if (params.subtext) {
      var s = document.createElement("div");
      s.textContent = params.subtext;
      s.style.cssText = "font:400 14px sans-serif;opacity:.85;max-width:80%;";
      panel.appendChild(s);
    }

    var buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;gap:12px;margin-top:6px;";
    panel.appendChild(buttons);

    var confirm = document.createElement("button");
    confirm.textContent = params.confirmText || "I am 18 or older";
    confirm.style.cssText =
      "padding:12px 20px;border:0;border-radius:8px;background:#e11d48;color:#fff;" +
      "font:700 15px sans-serif;cursor:pointer";
    confirm.addEventListener("click", function () {
      api.clickThrough();
    });

    var deny = document.createElement("button");
    deny.textContent = params.denyText || "Leave";
    deny.style.cssText =
      "padding:12px 20px;border:1px solid #888;border-radius:8px;background:transparent;" +
      "color:#ddd;font:600 15px sans-serif;cursor:pointer";
    deny.addEventListener("click", function () {
      panel.innerHTML =
        '<div style="font:600 18px sans-serif">You must be 18+ to view this content.</div>';
      api.emit("AdStopped");
    });

    buttons.appendChild(confirm);
    buttons.appendChild(deny);
  },
};

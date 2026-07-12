/**
 * Shoppable Video — VPAID render module (reference for the shared base).
 * Draws a "Shop Now" button over the playing video; click -> click-through.
 */
var TEMPLATE = {
  name: "shoppable",
  duration: 30,
  onStart: function (slot, params, api) {
    if (!slot) return;
    var btn = document.createElement("button");
    btn.textContent = params.productName
      ? "Shop Now — " + params.productName
      : "Shop Now";
    btn.style.cssText =
      "position:absolute;right:12px;bottom:12px;z-index:2;padding:8px 14px;" +
      "border:0;border-radius:6px;background:#000;color:#fff;font:600 14px sans-serif;" +
      "cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)";
    btn.addEventListener("click", function () {
      api.clickThrough();
    });
    slot.appendChild(btn);
  },
};

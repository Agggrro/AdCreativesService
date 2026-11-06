/**
 * HTML5 Banner — VPAID render module (ADR-0039).
 *
 * The advertiser's own HTML5 banner — one HTML document with its CSS and JS
 * inline, images by URL — played inside the video slot. The document runs in a
 * sandboxed iframe of its own (`sandbox="allow-scripts"`, no same-origin): it
 * can draw and animate, load its assets and talk to this unit, and nothing
 * else — not the unit's document, not the publisher's page, not the top frame.
 *
 * A short bootstrap is injected ahead of the banner's own code. It provides
 * the `clickTag` convention and a minimal Studio `Enabler`, and turns every way
 * a banner leaves — `window.open`, a link, an `Enabler.exit`, a navigation of
 * its own frame — into one message to this unit, which raises the VPAID
 * click-through to the player. The destination is always the creative's
 * click-through URL: the tag's `<ClickThrough>` and the click have to agree, and
 * the player, not the banner, opens it. The banner itself is never handed that
 * URL — its `clickTag` is a sentinel that resolves nowhere — so nothing it does
 * on its own can reach the click redirect.
 *
 * Config (AdParameters): bannerHtml, bannerWidth, bannerHeight, fit
 * (contain|actual), backgroundColor, backgroundImageUrl, clickThroughUrl.
 */
var TEMPLATE = {
  name: "html5_banner",
  duration: 15,
  onStart: function (slot, params, api) {
    if (!slot) return;

    api.debug("mount", { w: slot.clientWidth, h: slot.clientHeight });

    var doc = slot.ownerDocument || document;
    // The slot may live in another document than this unit (Fluid Player builds
    // it in the host page): everything bound to a window binds to the slot's.
    var win = doc.defaultView || window;
    var html = typeof params.bannerHtml === "string" ? params.bannerHtml : "";
    var fit = params.fit === "actual" ? "actual" : "contain";

    // The banner's own size: the IAB/Studio `<meta name="ad.size">` when the
    // document carries one, else the fields, else the display default.
    var meta = adBannerMetaSize(html);
    var w = meta ? meta.w : adBannerDimension(params.bannerWidth, 300);
    var h = meta ? meta.h : adBannerDimension(params.bannerHeight, 250);
    api.debug("banner", {
      w: w,
      h: h,
      sizeFrom: meta ? "meta" : "fields",
      fit: fit,
      bytes: html.length,
    });

    slot.style.overflow = "hidden";
    var color = adBannerColor(params.backgroundColor);
    if (color) slot.style.background = color;

    if (params.backgroundImageUrl) {
      var bg = doc.createElement("div");
      bg.style.cssText = "position:absolute;inset:0;overflow:hidden;";
      bg.appendChild(adInteractFitMedia(params.backgroundImageUrl, api, "background").el);
      slot.appendChild(bg);
    }

    var frame = doc.createElement("iframe");
    // `allow-scripts` alone: an opaque origin, so the banner can neither read
    // nor script the document it sits in — which in some players is the
    // publisher's page — nor navigate the top frame, submit a form, or open a
    // window of its own. Every exit it attempts comes through the bootstrap's
    // message instead, and the player opens it.
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("title", "Advertisement");
    // The banner's requests carry no Referer: in a same-document player the
    // embedding page is the publisher's, and its URL is not the advertiser's
    // asset host's to log.
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.style.cssText =
      "position:absolute;left:0;top:0;border:0;margin:0;padding:0;display:block;" +
      "overflow:hidden;background:transparent;transform-origin:0 0;" +
      "width:" + w + "px;height:" + h + "px;";
    var srcdoc = adBannerDocument(html);

    var lastScale = -1;
    var layoutTimer = 0;
    function layout() {
      var sw = slot.clientWidth;
      var sh = slot.clientHeight;
      if (!sw || !sh) return;
      var k = fit === "actual" ? 1 : Math.min(sw / w, sh / h);
      var x = Math.round((sw - w * k) / 2);
      var y = Math.round((sh - h * k) / 2);
      frame.style.transform =
        "translate(" + x + "px," + y + "px)" + (k === 1 ? "" : " scale(" + k + ")");
      if (Math.abs(k - lastScale) < 0.001) return;
      lastScale = k;
      // One record per settled size, not one per frame of a resize drag.
      win.clearTimeout(layoutTimer);
      layoutTimer = win.setTimeout(function () {
        api.debug("layout", {
          slot: sw + "x" + sh,
          scale: Math.round(k * 1000) / 1000,
        });
      }, 250);
    }

    var stopped = false;
    var loads = 0;
    var restored = false;
    var lastExit = 0;
    // When the viewer last acted inside the banner, by the unit's clock: set
    // from every `engage` message, which the bootstrap sends only for a trusted
    // event. -∞ until the first.
    var lastEngageAt = -1e12;
    // Age of the viewer's last gesture when the banner left (ms), as the
    // bootstrap measured it at `beforeunload`; -1 when there was none, or when
    // no such message came (WebKit does not fire the event reliably).
    var unloadGesture = -1;

    /**
     * Whether the viewer has acted recently, as the browser itself knows it.
     * A gesture inside the banner's frame activates every ancestor document,
     * this one included, whatever the origins — so a message claiming a
     * gesture that the browser has not seen is a forgery, and refused. Where
     * the API is missing, the bootstrap's own word stands.
     */
    function activated() {
      var ua = win.navigator && win.navigator.userActivation;
      return ua ? ua.isActive === true : true;
    }

    /**
     * An exit is a click-through only when a gesture of the viewer's made it.
     * The bootstrap reports the age of the last trusted pointer or key event
     * with every exit; a banner that opens its destination on a timer, or on
     * load, is reporting a click nobody made, and the player must not hear
     * one. The ADBANNER_GESTURE_MS window is the time a banner's own handler
     * may take between the tap and its window.open.
     */
    function exit(kind, gesture) {
      var now = Date.now();
      if (!(gesture >= 0 && gesture <= ADBANNER_GESTURE_MS)) {
        api.debug("exit-ignored", { kind: kind, gesture: gesture });
        return;
      }
      // A link inside a button, or Enabler.exit followed by window.open: one
      // gesture, one click-through.
      if (now - lastExit < 500) return;
      lastExit = now;
      api.debug("exit", { kind: kind, gesture: gesture });
      api.clickThrough();
    }

    var hiddenTimer = 0;
    function show() {
      win.clearTimeout(hiddenTimer);
      hiddenTimer = 0;
      frame.style.visibility = "";
    }

    frame.addEventListener("load", function () {
      if (stopped) return;
      loads++;
      if (loads === 1) {
        // The banner's own document, first time or reloaded: shown. The
        // sentinel's blank page, which is what any other load is, stays hidden.
        show();
        api.debug("loaded", { ms: Date.now() - startedAt });
        return;
      }
      // A second load is the banner navigating its own frame — `location.href =
      // clickTag` in a banner that expected to be the page; the sentinel it was
      // given is a blank page, so nothing was fetched. On a gesture that is an
      // exit: the player opens the click-through, and the banner comes back for
      // the next one. Without a gesture it comes back once: a banner that
      // navigates on load would otherwise reload itself for the whole ad.
      var gesture = unloadGesture;
      unloadGesture = -1;
      // No word from the banner at `beforeunload` (WebKit): the last trusted
      // gesture it reported, allowing for the navigation itself.
      if (gesture < 0) {
        var since = Date.now() - lastEngageAt;
        if (since <= ADBANNER_GESTURE_MS + ADBANNER_NAVIGATE_MS) gesture = 0;
      }
      var byViewer = gesture >= 0 && gesture <= ADBANNER_GESTURE_MS;
      exit("navigate", gesture);
      if (!byViewer && restored) {
        // Given up on: the frame holds the sentinel's blank page, and stays
        // hidden for good.
        win.clearTimeout(hiddenTimer);
        return;
      }
      if (!byViewer) restored = true;
      loads = 0;
      frame.srcdoc = srcdoc;
    });

    var onMessage = function (e) {
      if (stopped || e.source !== frame.contentWindow) return;
      var m = e.data;
      if (!m || typeof m !== "object" || m.creosmithBanner !== 1) return;
      var gesture = typeof m.gesture === "number" && activated() ? m.gesture : -1;
      if (m.type === "exit") exit(typeof m.kind === "string" ? m.kind : "open", gesture);
      else if (m.type === "unload") {
        unloadGesture = gesture;
        // Nothing foreign shows in the slot while the frame is away: hidden
        // until the banner's next load — or shown again if no load follows,
        // as after a navigation the browser cancelled (a `mailto:` link, a
        // download the sandbox refuses), where the banner is still there.
        frame.style.visibility = "hidden";
        win.clearTimeout(hiddenTimer);
        hiddenTimer = win.setTimeout(function () {
          if (!stopped) show();
        }, ADBANNER_GESTURE_MS + ADBANNER_NAVIGATE_MS);
      } else if (m.type === "engage") {
        if (!activated()) return;
        lastEngageAt = Date.now();
        api.engage();
      } else if (m.type === "error") {
        api.debug("banner-error", {
          message: typeof m.message === "string" ? m.message.slice(0, 300) : "",
        });
      }
    };
    win.addEventListener("message", onMessage);

    var startedAt = Date.now();
    // The document before the insertion, so the frame's first navigation is
    // the banner: inserted empty, the frame loads `about:blank` first and
    // fires a `load` for it, which the counter above would read as the banner
    // having navigated away — a click-through nobody made, at start.
    frame.srcdoc = srcdoc;
    slot.appendChild(frame);
    layout();

    var ro = null;
    var onResize = null;
    if (typeof win.ResizeObserver === "function") {
      ro = new win.ResizeObserver(layout);
      ro.observe(slot);
    } else {
      onResize = layout;
      win.addEventListener("resize", onResize);
    }

    api.onStop(function () {
      stopped = true;
      win.removeEventListener("message", onMessage);
      win.clearTimeout(layoutTimer);
      win.clearTimeout(hiddenTimer);
      if (ro) ro.disconnect();
      if (onResize) win.removeEventListener("resize", onResize);
      // Unloading the document is what stops the banner's timers, animations
      // and any sound it makes; a host may leave the slot up after the ad.
      try {
        frame.srcdoc = "";
      } catch (e) {
        /* nothing to unload */
      }
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    });
  },
};

/**
 * How long after the viewer's last gesture inside the banner an exit still
 * counts as theirs, ms. A click handler runs at once; a banner that animates a
 * button press before it opens takes a few hundred ms.
 */
var ADBANNER_GESTURE_MS = 1500;
/**
 * How long a banner's navigation to the sentinel may take to come back as the
 * frame's next `load`, ms — the allowance added to the gesture window when the
 * banner itself sent no word at `beforeunload`.
 */
var ADBANNER_NAVIGATE_MS = 2500;
/**
 * What the banner is given as `clickTag`. A link to it is still a link and
 * `window.open` of it still an open, both caught by the bootstrap; a banner
 * that navigates to it, fetches it or paints it reaches nothing — in
 * particular not the click redirect, which only the player is handed. A blank
 * page rather than a host that resolves nowhere: a navigation to it completes
 * at once and touches no network, where an unresolvable name waited on DNS for
 * seconds with the banner hidden meanwhile.
 */
var ADBANNER_CLICK_SENTINEL = "about:blank#clickTag";

/** A banner dimension from a field: a whole number of pixels within reason, else the default. */
function adBannerDimension(value, fallback) {
  var n = Math.round(Number(value));
  return isFinite(n) && n >= 50 && n <= 4096 ? n : fallback;
}

/** A hex colour from a field, or null: it lands in a style, so nothing else may. */
function adBannerColor(value) {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : null;
}

/**
 * The size a banner declares about itself: `<meta name="ad.size"
 * content="width=300,height=250">`, the convention Google Web Designer, Studio
 * and the IAB HTML5 guidelines share. Attribute order varies between tools, so
 * the tag is found by its name and then read.
 */
function adBannerMetaSize(html) {
  var tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (var i = 0; i < tags.length; i++) {
    if (!/\bname\s*=\s*["']?ad\.size["']?/i.test(tags[i])) continue;
    var content = tags[i].match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    var value = content ? content[1] || content[2] || content[3] || "" : "";
    var mw = value.match(/width\s*=\s*(\d+)/i);
    var mh = value.match(/height\s*=\s*(\d+)/i);
    if (!mw || !mh) return null;
    var w = adBannerDimension(mw[1], 0);
    var h = adBannerDimension(mh[1], 0);
    return w && h ? { w: w, h: h } : null;
  }
  return null;
}

/**
 * The banner document with the bootstrap ahead of its own code: inside
 * `<head>` when it has one, else right after `<html>`, where the parser opens
 * the head for it, else after the doctype — never in front of one, which
 * would put the document into quirks mode — else before everything. The
 * bootstrap must run before the banner's first script, which may read
 * `clickTag` or `Enabler` at top level.
 */
function adBannerDocument(html) {
  var script = "<script>" + adBannerBootstrap() + "</script>";
  var open = html.match(/<head\b[^>]*>/i) || html.match(/<html\b[^>]*>/i) || html.match(/<!doctype\b[^>]*>/i);
  if (open) {
    var at = open.index + open[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  return script + html;
}

/**
 * What runs first inside the banner's document. Plain ES5, one function, no
 * `</` sequence of its own — it is inlined into a `<script>` element. Nothing
 * from outside goes in: the click tag the banner sees is the sentinel.
 */
function adBannerBootstrap() {
  return (
    "(function(){" +
    "var tag=" + JSON.stringify(ADBANNER_CLICK_SENTINEL) + ";" +
    "var w=window;" +
    // The clickTag convention, in the spellings tools emit.
    "w.clickTag=tag;w.clickTAG=tag;w.clickTag1=tag;w.clickTag2=tag;" +
    "function post(m){try{w.parent.postMessage(m,'*')}catch(e){}}" +
    // The viewer's last gesture: a trusted pointer or key event, never one a
    // script dispatched. Its age goes with every exit, and the unit counts an
    // exit as a click only when a gesture just made it — and only when the
    // browser agrees that the viewer acted.
    "var gesture=0;function age(){return gesture?Date.now()-gesture:-1}" +
    "function engage(e){if(!e.isTrusted)return;gesture=Date.now();post({creosmithBanner:1,type:'engage'})}" +
    // Registered first, so a click that is also a link's exit has its gesture
    // before the exit is measured.
    "document.addEventListener('pointerup',engage,true);" +
    "document.addEventListener('click',engage,true);" +
    "document.addEventListener('keydown',engage,true);" +
    "function exit(kind){post({creosmithBanner:1,type:'exit',kind:kind,gesture:age()})}" +
    // Every window.open is an exit; the player opens the destination. A window
    // object comes back, not null, so a banner does not take the "popup
    // blocked" road and navigate itself instead.
    "function noop(){}" +
    "w.open=function(){exit('open');return{closed:false,focus:noop,blur:noop,close:noop,location:{}}};" +
    // A link to a page — or to the click tag — is an exit too. Not a `#` anchor
    // nor a `javascript:` one: those are the banner's own controls.
    "function link(t){while(t&&t.nodeType===1){if(t.tagName==='A'&&t.getAttribute('href'))return t;t=t.parentNode}return null}" +
    "document.addEventListener('click',function(e){var a=link(e.target);if(!a)return;" +
    "var href=a.href||'';if(href!==tag&&!/^https?:/i.test(href))return;e.preventDefault();exit('link')},true);" +
    // The document leaving — a banner that sets location.href. The unit sees
    // the next load and asks whether a gesture was behind it. `beforeunload`,
    // because a message posted from `pagehide` or `unload` is dropped with the
    // document (observed in Chrome); this one is sent before the navigation
    // starts and arrives — where the event fires at all.
    "w.addEventListener('beforeunload',function(){post({creosmithBanner:1,type:'unload',gesture:age()})});" +
    // A script error is the one thing a banner cannot report about itself.
    "w.addEventListener('error',function(e){post({creosmithBanner:1,type:'error',message:String((e&&e.message)||'')})});" +
    // A minimal Studio Enabler, for a banner exported by Google Web Designer
    // that never loads the real one: initialised at once, visible at once,
    // exits through the message like everything else. A banner that loads
    // Enabler.js itself replaces this; its exits still end in window.open.
    "if(!w.Enabler){" +
    "function now(fn){if(typeof fn==='function')setTimeout(fn,0)}" +
    "w.Enabler={isInitialized:function(){return true},isPageLoaded:function(){return true}," +
    "isVisible:function(){return true},isServingInLiveEnvironment:function(){return true}," +
    "addEventListener:function(n,fn){if(/^(init|pageloaded|visible)$/i.test(String(n)))now(fn)}," +
    "removeEventListener:noop,exit:function(){exit('enabler')}," +
    "exitOverride:function(){exit('enabler')},dynamicExit:function(){exit('enabler')}," +
    "exitQueryString:function(){exit('enabler')},setProfileId:noop,loadModule:function(m,fn){now(fn)}," +
    "loadScript:function(u,fn){now(fn)},getParameter:function(){return null},counter:noop," +
    "startTimer:noop,stopTimer:noop,reportManualClose:noop,requestExpand:noop,requestCollapse:noop," +
    "requestFullscreenExpand:noop,requestFullscreenCollapse:noop,setDevDynamicContent:noop," +
    "getDynamicContent:function(){return null},close:noop,invokeExternalJsFunction:noop};" +
    "w.studio=w.studio||{};w.studio.events=w.studio.events||{};" +
    "w.studio.events.StudioEvent={INIT:'init',PAGE_LOADED:'pageloaded',VISIBLE:'visible',HIDDEN:'hidden'," +
    "EXIT:'exit',EXPAND_START:'expandstart',EXPAND_FINISH:'expandfinish',COLLAPSE_START:'collapsestart'," +
    "COLLAPSE_FINISH:'collapsefinish',FULLSCREEN_SUPPORTED:'fullscreensupported'," +
    "FULLSCREEN_DIMENSIONS:'fullscreendimensions',FULLSCREEN_EXPAND_START:'fullscreenexpandstart'," +
    "FULLSCREEN_EXPAND_FINISH:'fullscreenexpandfinish',FULLSCREEN_COLLAPSE_START:'fullscreencollapsestart'," +
    "FULLSCREEN_COLLAPSE_FINISH:'fullscreencollapsefinish',INTERACTION:'interaction',ORIENTATION:'orientation'," +
    "DYNAMIC_CONTENT_LOADED:'dynamiccontentloaded',DYNAMIC_CONTENT_LOAD_FAILED:'dynamiccontentloadfailed'};" +
    "}" +
    "})();"
  );
}

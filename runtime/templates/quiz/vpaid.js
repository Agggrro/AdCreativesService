/**
 * Quick Setup Quiz — VPAID render module.
 * One to three A/B questions. Each pick appends a letter to the answer path,
 * and the completed path resolves an honest "see results" CTA that fires the
 * click-through. No fabricated match data (ADR-0005).
 *
 * Config (AdParameters):
 *   stepCount     "1" | "2" | "3"                    (absent => 1)
 *   resultMode    "universal" | "branching"          (absent => universal)
 *   questionText, option1Label, option1ImageUrl, option2Label, option2ImageUrl
 *                 step 1, on the ORIGINAL un-prefixed key names
 *   step2*, step3* the same five keys, prefixed and capitalised
 *   resultText, ctaText                              the universal result screen
 *   clickThroughUrl                                  the tag-level destination
 *   result<PATH>Heading / result<PATH>CtaText / result<PATH>Url
 *                 the per-path result screen, PATH being the letters picked
 *                 ("A", "BA", "ABB"). Each falls back to its universal
 *                 counterpart so a hand-built config cannot render blank.
 *
 * A creative saved before this template gained steps carries neither stepCount
 * nor resultMode, and its step-1 keys are untouched — so both defaults
 * reproduce the old single-question, single-result behaviour exactly. That is
 * why step 1 has no "step1" prefix: no data migration, by design (ADR-0011).
 *
 * Duration is 30 to match DEFAULT_DURATION_SECONDS in lib/vast/builder.ts. In
 * production the injected durationSeconds always wins, but the catalog demo
 * injects none, and a multi-step quiz paced against a 15s quartile timer fires
 * complete while the viewer is still on question two.
 */
var TEMPLATE = {
  name: "quiz",
  duration: 30,
  onStart: function (slot, params, api) {
    if (!slot) return;

    var MAX_STEPS = 3;
    var stepCount = Math.min(
      Math.max(parseInt(params.stepCount, 10) || 1, 1),
      MAX_STEPS,
    );
    var branching = params.resultMode === "branching";
    var path = "";
    var liveStep = 0;

    // The two config values that decide the entire flow, resolved rather than
    // raw: a quiz that renders the wrong number of questions or the wrong
    // result screen is almost always one of these two landing differently than
    // the configurator implied.
    api.debug("mount", {
      w: slot.clientWidth,
      h: slot.clientHeight,
      stepCount: stepCount,
      resultMode: branching ? "branching" : "universal",
    });

    var wrap = document.createElement("div");
    wrap.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;" +
      "align-items:center;justify-content:center;padding:16px;box-sizing:border-box;" +
      "background:#111;font-family:sans-serif;color:#fff;text-align:center;";
    slot.appendChild(wrap);

    /** Step 1 keeps the legacy un-prefixed key; later steps are "stepNXxx". */
    function param(step, name) {
      var key =
        step === 1
          ? name
          : "step" + step + name.charAt(0).toUpperCase() + name.slice(1);
      var v = params[key];
      return typeof v === "string" && v ? v : "";
    }

    /** A per-path value, falling back to the universal one. */
    function outcome(suffix, fallback) {
      if (branching) {
        var v = params["result" + path + suffix];
        if (typeof v === "string" && v) return v;
      }
      return fallback;
    }

    /**
     * Release any <video> option thumbnails before a screen is torn down.
     * `innerHTML = ""` only detaches them — some mobile and CTV browsers keep
     * the decoder alive until GC, and a three-step quiz can strand six.
     */
    function clearScreen() {
      var vids = wrap.getElementsByTagName("video");
      for (var i = vids.length - 1; i >= 0; i--) {
        try {
          vids[i].pause();
          vids[i].removeAttribute("src");
          vids[i].load();
        } catch (e) {
          /* a browser that refuses this still gets the detach below */
        }
      }
      wrap.innerHTML = "";
    }

    function addOption(row, step, index, letter) {
      var label = param(step, "option" + index + "Label");
      var img = param(step, "option" + index + "ImageUrl");
      // Matches the schema defaults; only reachable via a hand-built config.
      if (!label) label = index === 1 ? "Option A" : "Option B";

      var b = document.createElement("button");
      b.type = "button";
      b.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:6px;" +
        "padding:10px;border:2px solid #444;border-radius:12px;background:#1c1c1c;" +
        "color:#fff;cursor:pointer;min-width:120px;";
      if (img) {
        var im = document.createElement("div");
        im.style.cssText =
          "width:110px;height:110px;border-radius:8px;overflow:hidden;";
        im.appendChild(adInteractMediaLayer(img));
        b.appendChild(im);
      }
      var cap = document.createElement("span");
      cap.textContent = label;
      cap.style.cssText = "font:600 15px sans-serif;";
      b.appendChild(cap);
      b.addEventListener("click", function () {
        // A double-click can deliver its second event to a button this handler
        // has already replaced, which would append a second letter and resolve
        // a path the viewer never chose. Only the live step may advance.
        if (step !== liveStep) return;
        path += letter;
        api.debug("answer", { step: step, picked: letter, path: path });
        if (step < stepCount) renderStep(step + 1);
        else showResult();
      });
      row.appendChild(b);
    }

    function renderStep(step) {
      liveStep = step;
      api.debug("step", { step: step, of: stepCount });
      clearScreen();

      var q = document.createElement("div");
      q.textContent = param(step, "questionText") || "What are you into?";
      q.style.cssText = "font:700 20px sans-serif;";
      wrap.appendChild(q);

      var row = document.createElement("div");
      row.style.cssText =
        "display:flex;gap:12px;flex-wrap:wrap;justify-content:center;";
      wrap.appendChild(row);

      addOption(row, step, 1, "A");
      addOption(row, step, 2, "B");
    }

    function showResult() {
      liveStep = 0;
      // `resolved` distinguishes "this path has its own result screen" from
      // "it fell back to the universal one" — invisible on screen, and the
      // usual explanation for a branching quiz that looks like it ignored the
      // answers.
      api.debug("result", {
        path: path,
        mode: branching ? "branching" : "universal",
        resolved: branching ? !!params["result" + path + "Heading"] : true,
      });
      clearScreen();

      var msg = document.createElement("div");
      msg.textContent = outcome("Heading", params.resultText || "See your matches");
      msg.style.cssText = "font:700 20px sans-serif;margin-bottom:14px;";
      wrap.appendChild(msg);

      var cta = document.createElement("button");
      cta.type = "button";
      cta.textContent = outcome("CtaText", params.ctaText || "Continue");
      cta.style.cssText =
        "padding:12px 22px;border:0;border-radius:8px;background:#e11d48;color:#fff;" +
        "font:700 16px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)";
      // The result screen is terminal — the ad does not end on click, so it
      // stays mounted and tappable. Without this, every tap emits a fresh
      // AdClickThru and a player handling navigation opens the destination
      // again (or has the second window blocked) and counts a second click.
      var fired = false;
      cta.addEventListener("click", function () {
        if (fired) return;
        fired = true;
        cta.disabled = true;
        // "" makes the base fall back to params.clickThroughUrl, which is also
        // the VAST <ClickThrough> — so a player that ignores the URL we hand to
        // AdClickThru still lands somewhere the advertiser configured, rather
        // than nowhere. See ADR-0011.
        api.clickThrough(outcome("Url", ""));
      });
      wrap.appendChild(cta);
    }

    renderStep(1);
  },
};

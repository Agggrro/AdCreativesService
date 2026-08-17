---
name: creative-check
description: Run a creative through the local harness before and after any template work. Invoke BEFORE changing or adding a template render module, the shared VPAID base, or a template's config_schema — and again when the work is done. Verifies the mandatory lifecycle, the close control, the template's own reported state, and the layout at four slot sizes.
---

# creative-check

A creative is the product. It is also the one part of it that no type checker, linter or
unit test can judge: the mechanic either works in a real player at a real slot size, or it
does not. `/dev/harness` is how that gets checked without a human in devtools
([ADR-0019](../../../docs/decisions/0019-creative-telemetry-channel.md)).

**This check is mandatory for template work — run it, do not reason about it.** A
template that "should" render is not a template that renders.

## When this matters

| Work | Why it triggers |
| --- | --- |
| A new template's render module (`runtime/templates/<name>/vpaid.js`) | Nothing else exercises it |
| Any edit to an existing render module | Layout and lifecycle both regress silently |
| `runtime/lib/vpaid-base.js` | One change hits every template at once |
| A template's `config_schema` in `supabase/seed.sql` | The harness builds its config from the schema; a bad field reaches the creative |
| `runtime/build.mjs`, or terser options | Minification has broken a unit before |
| Adding a template to `PREVIEW_UNIT_PATHS` / `runtime_keys` | A key mismatch serves nothing, silently |

Pure server-side work with no creative surface does not need it — say so explicitly
rather than skipping silently.

## Procedure

### Before building

1. **Run the harness on the current code first**, so you know which faults you inherited
   and which you introduced. A verdict is only meaningful against a baseline.
2. **Read the template you are about to change**, plus `runtime/lib/vpaid-base.js` — the
   base already provides quartiles, the click helper, the media-layer helper and the
   mandatory close control. A template that reimplements any of them is the defect.

### Running it

3. **Rebuild.** The harness serves `runtime/dist/` off disk, so an unbuilt edit is
   invisible:

   ```bash
   npm run build:runtime
   ```

4. **Start the dev server** with `preview_start {name: "dev"}` — never `npm run dev` in a
   shell. It binds `127.0.0.1`.
   If it exits with *"Another next dev server is already running"*, another session owns
   the port: do **not** kill it. Open its URL directly with
   `preview_start {url: "http://localhost:3000/dev/harness"}` — it is the same working
   tree, so it serves your build.
5. **Open** `/dev/harness` in a **fresh tab** (`tabs_create`, then `navigate`). The console
   buffer is not cleared by navigation, so a reused tab carries every error from earlier in
   the session into step 11 and makes a clean run look broken.
   Deep-link when you want a specific case: `?t=<unit-key>&size=300x250`.
6. **Press `Run all`** and wait for the sweep (about 20s for five templates; a template
   with a base video paces itself off the video and takes longer).

### Reading the result

7. **Every row must be `PASS`, with `MISSING` at `0` and `CLOSE` at `YES`.** Read the
   verdict table as data rather than by eye:

   ```js
   JSON.stringify([...document.querySelectorAll('table')[0].querySelectorAll('tbody tr')]
     .map(tr => [...tr.cells].map(c => c.innerText.trim().replace(/\s+/g, ' '))))
   ```
   - `NEVER RAN` — the unit did not load, or threw before `AdStarted`. Check the timeline
     for an `error` record; the base reports `onStart` throws by name now.
   - `INCOMPLETE` — it started but did not finish the lifecycle, or the ADR-0009 close
     control is missing, or the render module never reported `tpl:mount`.
8. **Read the run timeline** for the template you touched. It must contain
   `tpl:mount` — its absence means the render module never ran, whatever the screen shows.
9. **Drive the mechanic**, do not just watch it. Click through the quiz, confirm the age
   gate, drag the slider, scratch the cover. Buttons take a plain `computer` click on the
   `ref` from `read_page` — the creative's own controls appear in the accessibility tree
   like any others.

   **Drags need a fallback.** `computer{action:"left_click_drag"}` refuses to run without a
   prior screenshot, and a screenshot fails whenever the Browser pane is not displayed.
   Dispatch the gesture instead — the templates bind `mousedown`/`mousemove` on the slot
   and `mouseup` on `window`:

   ```js
   (() => { const slot = document.querySelector('.bg-well > div');
     const box = slot.getBoundingClientRect();
     const at = f => ({ clientX: box.left + box.width * f, clientY: box.top + box.height / 2, bubbles: true });
     slot.dispatchEvent(new MouseEvent('mousedown', at(0.8)));
     slot.dispatchEvent(new MouseEvent('mousemove', at(0.22)));
     window.dispatchEvent(new MouseEvent('mouseup', at(0.22)));
     return 'dragged to 22%'; })()
   ```

   Then read the state back:

   ```js
   JSON.stringify(window.__creosmith.filter(r => r.name.startsWith("tpl:")))
   ```

   Every state transition the template owns should appear, and its value should match what
   you did — a drag to 22% that reports 80% is the bug you came for. If a gesture changed
   the screen but produced no record at all, the template is under-instrumented; fix that
   as part of the work (see "Rules").
10. **Check all four slot sizes**, not just 640×360. `300x250` is the one that breaks
    layouts, because it is the only non-16:9 size and most templates derive their geometry
    from a measured width.
11. **Read the console** (`read_console_messages`). A running creative must produce
    nothing. The runtime never logs by design — anything there is a real fault.

### After building

12. Re-run the full sweep and confirm every row is still `PASS` — including the templates
    you did **not** touch, which is the point of sweeping rather than checking one.
13. Run the **`vast-spec-reviewer`** subagent if the change touched anything that emits
    VAST or a creative payload, per `CLAUDE.md`.
14. Run **`doc-sync`**; a new template or a changed mechanic is a documentation change.

## Rules

- **Rebuild before looking.** The single most common way to debug a bug that is already
  fixed. `/api/preview-unit/*` and the configurator's own preview serve the **published**
  unit from the runtime manifest, not your build — only `/dev/harness` shows the working
  copy. Verifying the configurator's player tabs against an edit requires
  `npm run runtime:push` first.
- **A new template ships instrumented.** At minimum `api.debug("mount", { w, h })`, plus a
  record for every state transition that has no VPAID event of its own — the quiz's answer
  path, the scratch coverage, the slider position. This is not optional polish: it is what
  makes the next bug in that template diagnosable without a human reading it out.
- **Never `console.log` from a render module.** The unit's records go over the telemetry
  channel; the receiver does the logging. A publisher's console stays clean (ADR-0019).
- **The verdict is the check, not the screenshot.** A creative can look right and have
  never fired an impression. Read the timeline.
- **Report honestly.** State which templates you ran, at which sizes, what the verdicts
  were, and anything you could not verify and why.

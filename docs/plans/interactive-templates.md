# Implementation Plan — Interactive Creative Templates

> Status: in progress. Delivers 4 new interactive creative templates, served via
> our existing **VPAID/SIMID over VAST** pipeline (in-stream / out-stream video
> inventory — NOT display/MRAID). See [ADR-0005](../decisions/0005-interactive-image-creatives.md).

## What we're adding

Four "interactive-image" creatives — the ad content is a static image (or two)
with an interactive layer, delivered as a VPAID JS unit / SIMID iframe through the
VAST endpoint we already built:

1. **Scratch & Reveal** — cover layer the user rubs away to reveal an image; at a
   reveal threshold → CTA / click-through.
2. **Dress/Undress Slider** — two images + a drag slider (before/after).
3. **Quick Setup Quiz** — a question + 2–4 image options → honest "see results" CTA
   (no fabricated match data).
4. **Age/Content Gate** — a real 18+ confirmation over a blurred background (a
   genuine gate, not a fake system dialog).

Deferred / reframed (see ADR-0005): "Fake Video Call" and fake-system-dialog
variants are **out** for now — impersonation of a real call/OS and fabricated data
are policy-banned and deceptive. May revisit a clearly-branded "chat preview" later.

## Delivery mechanics (important)

- **VPAID** is the natural vehicle: a VPAID unit is a JS ad that draws whatever it
  wants in the player's slot — no real video needed. Primary format for these,
  especially out-stream.
- **SIMID** layers interactivity over a *playing linear video*, so an image-only
  creative needs a **base video loop**. Decision: ship image templates **VPAID-first**;
  offer SIMID per-creative only when a base `videoUrl`/loop is supplied.
- Per-creative config is injected via VAST `<AdParameters>` (already built). Clicks →
  VPAID `AdClickThru` / SIMID `clickThru`; quartile events are **timer-driven** when
  there is no video (billing still gets start/quartiles/complete).

## Architecture

### Runtime (shared core + per-template render)
```
runtime/
  lib/vpaid-base.js     shared VPAID interface + quartiles (video- or timer-driven) + clicks
  lib/simid-base.js     shared SIMID session/handshake + render hook
  templates/<name>/vpaid.js   per-template render module (defines `var TEMPLATE`)
  templates/<name>/simid.js   per-template render (optional; needs base loop)
  build.mjs             concatenates base + render -> dist/<name>/{vpaid.js,simid html}
  dist/                 built units to upload to the `creatives` Storage bucket (gitignored)
```
`npm run build:runtime` produces `dist/`; upload those to the bucket at the paths in
each template's `runtime_keys`.

### Config-schema-driven configurator
`templates.config_schema` already exists but the "New creative" form is hardcoded to
shoppable fields. Make the form **render from `config_schema.fields`** and make
`createCreative` store fields generically. Field types: `text | url | number | image
| select | range`. This unlocks every template with no per-template form code.

### Tiles
The showcase (landing + dashboard) already renders template cards from the
`templates` table. New templates appear automatically once seeded — "making tiles"
= seeding rows (+ preview images), not new UI.

## Phases

- **A. Foundation:** ADR-0005 + update `adtech-standards.md`; shared `vpaid-base.js`
  + `build.mjs` + `npm run build:runtime`; shared `simid-base.js` (+ base-loop rule).
- **B. Configurator:** `config_schema` field format; schema-driven form; generic
  `createCreative`.
- **C. Templates (each end-to-end):** render module(s) → build → seed row +
  `config_schema` + preview → tile appears → validate output (`vast-spec-reviewer`).
  Order: Scratch & Reveal → Slider → Quiz → Age Gate.
- **D. Wrap:** `vast-spec-reviewer` pass, `doc-sync`, upload assets to Storage,
  commit + push.

## Definition of done

- [x] 4 templates implemented + seeded in `seed.sql` (appear as tiles once applied).
- [x] Configurator renders each template's fields from `config_schema`.
- [x] Each VPAID unit builds (`npm run build:runtime`) and passes `node --check`;
      `/api/vast` serves image-only VPAID (verified) and fails closed otherwise.
- [~] SIMID: serving-layer gating done (requires a base loop); the SIMID runtime
      base for image templates is deferred — VPAID-first per ADR-0005.
- [x] Docs updated (ADR-0005, adtech-standards, this plan).

## Publish step (do when ready to go live with these templates)

These are built but NOT yet on the live site (publishing adult templates to the
public showcase is a deliberate call). To publish:
1. `npm run build:runtime` → upload everything in `runtime/dist/**` to the private
   `creatives` Storage bucket at the matching `runtime_keys` paths.
2. Apply `supabase/seed.sql` (SQL Editor) — this publishes all 5 template rows.
3. The tiles appear automatically (landing + dashboard); configure a creative and
   the VAST tag serves the unit.

## Follow-ups (post-batch)

- Validate each unit in a real player (Google IMA / out-stream) — reference impls.
- SIMID variants for image templates (needs a base-loop provisioning approach).
- Escape/sanitize URL values injected into unit CSS (advertiser-scoped, low risk).
- Preview thumbnails per template for richer tiles.

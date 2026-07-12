# 0005. Interactive-image creatives via VPAID/SIMID (not display)

- Status: Accepted
- Date: 2026-07-08

## Context

The next batch of templates (Scratch & Reveal, Dress/Undress Slider, Quick Setup
Quiz, Age/Content Gate) present **static images with an interactive layer** rather
than a classic linear video. An early instinct was to treat these as HTML5
display/MRAID rich-media and therefore out of scope (per
[adtech-standards.md](../adtech-standards.md)).

That was a category error: **the rendering technique (canvas/DOM over an image) is
independent of the delivery channel.** These creatives are meant to run on **video
inventory** (in-stream / out-stream) via **VPAID/SIMID over VAST** — the exact
pipeline this product is built around. Running interactive, non-classical-video
units on video placements is the core value proposition. MRAID display banners
remain out of scope; this is not that.

## Decision

Deliver interactive-image creatives through the **existing VPAID/SIMID + VAST**
pipeline, as new runtime units + template rows — no new display line.

- **VPAID** is the primary vehicle: a VPAID unit is JS that draws arbitrary content
  in the player's ad slot; no real video is required. Best fit, esp. out-stream.
- **SIMID** layers interactivity over a *playing* linear video, so an image-only
  creative needs a **base video loop**. We therefore ship image templates
  **VPAID-first**, and offer SIMID per-creative only when a base video/loop is
  supplied.
- With no video, **quartile events are timer-driven** (start/quartiles/complete)
  so billing/tracking still works.
- Config reaches units via VAST `<AdParameters>` (already implemented).

## Consequences

- Reuses the whole serving/adapter/entitlement stack; new templates = runtime units
  + seed rows + `config_schema`, nothing structural.
- A shared VPAID/SIMID runtime base avoids duplicating the interface across
  templates; a small `build.mjs` concatenates base + per-template render.
- SIMID for image templates is gated on providing a base loop — documented, not a
  blocker.
- **Deception boundary (carried from ADR-0003):** we build the honest interactive
  mechanics. Impersonation of a real call/OS (fake video call, fake system dialog)
  and fabricated data (fake "N profiles found") are **out** — policy-banned by ad
  networks/DSPs and deceptive. Age gate is a *real* 18+ confirm, not a fake dialog.

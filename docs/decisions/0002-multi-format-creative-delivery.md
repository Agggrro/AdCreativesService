# 0002. Multi-format creative delivery via adapter layer

- Status: Accepted
- Date: 2026-06-29

## Context

Interactive video standards are fragmented and moving:

- **VPAID 2.0** is deprecated by the IAB and dropped/limited by many DSPs/SSPs, but
  still required for reach with some legacy buyers.
- **SIMID 1.1** is the modern, safer successor, but real-world player/DSP support is
  still uneven.
- More standards (and OMID measurement) will matter over time.

Betting the product on a single standard is a strategic risk in both directions:
SIMID-only risks reach today; VPAID-first builds on a sunsetting standard. The
product decision is that **the user selects the delivery format in the UI** to match
their own DSP's capabilities.

## Decision

Make creative delivery **format-agnostic** behind a **format adapter** layer.

- A **template** declares `supported_standards` and is optimized into a variant per
  standard (`runtime_keys`).
- A **creative** stores the user's `selected_format`.
- The VAST endpoint emits the right fragment by looking up a `FormatAdapter` from a
  registry:

  ```
  FormatAdapter { format; buildMediaNodes(creative, ctx); runtimeUrl(creative, ctx) }
  ```

- Adding a standard = new adapter + new template variant. No endpoint or schema
  surgery.

## Consequences

- The user gets to pick the format that works in their DSP; we maximize reach without
  abandoning the modern path.
- The endpoint stays simple and stable; complexity is localized in adapters.
- Each adapter must produce spec-conformant VAST — enforced via the
  `vast-spec-reviewer` subagent.
- Slightly more upfront work authoring multiple variants per template; accepted as the
  core differentiator. Supersedes the original single-standard (VPAID-centric) framing
  in the initial project brief.

# 0012. Viewability measurement — OMID pass-through for SIMID, a custom module for VPAID

- Status: Accepted
- Date: 2026-08-15

## Context

Neither delivery format carried any viewability or verification signal.
`docs/adtech-standards.md` and `docs/mvp-scope.md` both flagged OMID as a
deliberately deferred "Post-MVP hook" — the VAST builder was explicitly left
room to add a `<Verification>` node later, but nothing implemented one. Media
buyers increasingly expect this before trusting spend on a creative, so this
change pulls it into scope, split by format because the two standards don't
solve the same problem the same way:

- **SIMID** runs an HTML/JS creative in a sandboxed iframe over a playing
  video. IAB's Open Measurement SDK (OMID) already defines how viewability
  gets measured for exactly this shape, via the VAST 4.1+
  `<AdVerifications>` element.
- **VPAID** is a JS unit that draws directly into the ad slot's DOM. It has
  no native viewable-impression event, and OMID's model doesn't map onto it
  the same way (OMID's verification script executes in a context the
  *player* manages, not inside the unit's own DOM — see below).

Becoming our own OMID *vendor* — registering a partner name with IAB Tech
Lab, shipping an OM SDK build, running our own measurement service — is a
materially larger undertaking than emitting a spec-correct VAST node, and
buys accreditation we cannot claim without an MRC audit. That is explicitly
out of scope here.

## Decision

**SIMID gets OMID as a pass-through, never a service we run.** The
advertiser supplies a third-party OMID verification vendor's script URL and
parameters (DoubleVerify, IAS, MOAT, ...) as creative config; we validate
the URL is well-formed `https://` and emit
`<AdVerifications><Verification vendor="..."><JavaScriptResource
apiFramework="omid" browserOptional="true">...</JavaScriptResource>
<VerificationParameters><![CDATA[...]]></VerificationParameters>
</Verification></AdVerifications>` between `<Impression>` and `<Creatives>`
(`lib/vast/verification.ts`, wired through `FormatAdapter`'s new optional
`adVerificationsInner` in `lib/vast/adapters/simid.ts` and
`lib/vast/builder.ts`). AdInteract is not itself an OMID vendor and never
claims to be.

**No CSP change, and no change to the SIMID document itself.** Per IAB's OMID
Web Implementation Guide, a verification script does not load into the ad
creative's own document — it loads into a sandboxed context the *video
player* manages (its own OMID JS Service / "Access Mode" sandbox), driven
purely by the `<Verification>` VAST node. `app/api/creative/simid/[token]/route.ts`
serves `runtime/shoppable/simid/index.html` with a locked CSP
(`default-src 'none'; script-src 'unsafe-inline'; ...`) specifically because
that document was never meant to run third-party code
(`docs/security.md`'s "this document is never advertiser-controlled today").
That stays true after this change: the vendor's script never reaches this
document, so the CSP is untouched. `lib/vast/interactive-token.ts`'s
`SAFE_PATH_RE` also only ever lets this route proxy our own static
`.../simid/index.html`, reinforcing that there is no path by which a vendor
URL could land there. If this conclusion is ever revisited, it needs a fresh
read of whichever player integration prompted it — this is not a permanent
guarantee about every possible OMID access mode, only the one the pass-through
design relies on.

**VPAID gets a self-built, non-accredited viewability module**, added once
to the shared base (`runtime/lib/vpaid-base.js`, the same "shared base, not
per-template" precedent ADR-0009 set for the mandatory close control) rather
than per template:

- An `IntersectionObserver` on `this._slot` (the ad-container DOM element
  every template already draws into) with `threshold: [0, 0.5]`.
- MRC's video threshold: fires once the slot has been **≥50% on-screen for a
  continuous 2 seconds**. A `document.visibilitychange` listener treats a
  backgrounded tab as not-visible, since IntersectionObserver's own
  throttling on hidden tabs isn't guaranteed identical across the players
  this runs in (Google IMA, Fluid Player, the in-house Sandbox harness).
- Fires a beacon via `new Image().src = this._params.viewableTrackingUrl` —
  a pixel, not `fetch`, to avoid CORS/opaque-response ambiguity across the
  sandboxed/cross-origin contexts a VPAID unit runs in. The URL is pre-signed
  server-side (`trackingUrl(ctx.siteUrl, cid, "viewable")` in
  `lib/vast/builder.ts`, same HMAC scheme as every other tracking beacon)
  and threaded through `<AdParameters>`, because the unit cannot sign its
  own beacon URL.
- Disconnects cleanly on every teardown path (`_teardown()`, called by
  `stopAd`/`skipAd`/`_closeCreative`) so a torn-down ad never leaks a
  pending timer or a dangling observer on a detached slot.

This number is **explicitly self-reported and not OMID-accredited** — it is
our own IntersectionObserver reading, not a certified measurement. The UI
never claims otherwise (see below).

**`viewable` is a new `creative_event_type` and is VPAID-only — by
construction, not just by convention.** `lib/vast/builder.ts` only mints
`adParams.viewableTrackingUrl` when `ctx.serving.selected_format === "vpaid"`;
a SIMID creative's `<AdParameters>` never carries a working signed URL for
this event at all. That matters because `<AdParameters>` is fully
inspectable (ADR-0003) — handing every creative a valid signed "viewable"
beacon URL regardless of format, on the assumption that only the VPAID
runtime would ever call it, would have made "SIMID never produces this
event" a claim enforced by nothing. `app/api/track/route.ts`'s `EVENT_MAP`
accepts it (the first event name this endpoint accepts that is fired by the
creative's own JS rather than by the host player hitting a VAST
`<TrackingEvents>` URL). `get_creative_overview()` returns a `viewable`
count alongside the existing funnel counts.

**Growing the `creative_event_type` enum needed care.**
`supabase/schema.sql` is applied as one atomic transaction (deliberately —
see the file's own header: a partial apply mid-way is a security event, since
functions are briefly PUBLIC-executable before their explicit revoke) via
`node-postgres`'s simple query protocol. Two things had to be reconciled:

1. The existing `create type ... exception when duplicate_object then null`
   idiom only takes effect on a fresh database; editing its literal list is a
   no-op against a live install. Growing an existing enum needs a separate,
   independently-idempotent `alter type creative_event_type add value if not
   exists 'viewable'`.
2. Postgres constant-folds a literal enum comparison at parse time (calling
   the type's input function), and a value added by `ALTER TYPE ... ADD
   VALUE` is not "safe" to read until the adding transaction commits —
   `get_creative_overview()`, created later in the same transaction,
   references `'viewable'` as a literal and would otherwise fail with
   *"unsafe use of new value of enum type"* at `CREATE FUNCTION` time.
   Splitting the file into two transactions was rejected (it would reopen
   the exact partial-apply window the file's atomicity exists to close), so
   `set local check_function_bodies = off;` brackets just the one `create or
   replace function public.get_creative_overview()` statement — restored to
   `on` immediately after — rather than the whole transaction. This defers
   only that one function body's pre-validation to first call (well after
   commit) without touching the file's required atomicity, and keeps every
   other function in the file validated at apply time as before: an earlier
   version of this change set it once near the top of the transaction and
   left it off through the rest of the file, which would have silently
   skipped apply-time validation for five unrelated functions — caught in
   review before this shipped.

**Config surfaces the vendor fields only for SIMID.** `showWhen` (ADR-0011)
previously only gated a field on another *schema* field's value. It now also
accepts the synthetic controller `"selected_format"` — the delivery-format
radio, which lives in `ConfiguratorForm`'s own component state, not in
`config_schema`/`config_json` — so a template-wide schema can gate a field
by the format the user has currently selected
(`lib/config-schema.ts`'s `parseConfigSchema`'s "fail visible" guard now
treats `"selected_format"` as always-valid, and `visibleFieldNames` seeds it
into the resolved-values map up front rather than walking it in schema
order like a real field). `ConfiguratorForm.tsx` and
`app/api/vast/preview/route.ts` both merge their own `format`
state/parameter into the read closure passed to the schema helpers so the
gate actually resolves. `buildConfigFromValues`'s server-side callers
(`createCreative`/`updateCreative`) needed no change — the hidden
`selected_format` radio already lands in `FormData` under that name, which
the generic `(name) => formData.get(name)` closure already reads. Shoppable
Video's `config_schema` gained three fields — `verificationVendor`,
`verificationScriptUrl`, `verificationParameters` — grouped under
`"viewability"`, each gated to `selected_format = "simid"`.

**Dashboard: `viewable` gets its own strip, not a 7th funnel tile.** It
isn't part of the sequential, always-applicable delivery funnel
(`docs/design-system.md` §6: impression → start → q25 → q50 → q75 →
complete) — appending it there would have broken that section's closed
definition, and 7 has no clean column divisor at the grid's intermediate
breakpoint, producing a ragged row of exposed hairline background. It also
needed a state the funnel's existing vocabulary didn't have: §6 defines the
em dash strictly as "not measurable" (a transient, page-wide condition —
`statsAvailable === false`), and reusing that exact glyph for "structurally
absent for this format, permanently" would have been visually
indistinguishable from an outage. The viewability panel
(`app/dashboard/creatives/[id]/page.tsx`) therefore renders three states:

- **VPAID, stats available:** a real count, `data-instr text-fg`, caption
  "Self-reported, not OMID-accredited."
- **SIMID (any stats state), or VPAID with stats unavailable and format ==
  simid is false:** em dash in `text-fg-disabled` (not the funnel's `text-fg`
  dash), caption "Measured by your verification vendor, not by us."
- **Stats genuinely unavailable:** em dash in `text-fg-disabled`, no
  caption — the page-level `statsUnavailable` banner already explains this
  once; repeating a long-form explanation under one tile would be noise.

`docs/design-system.md` §6 is amended alongside this ADR to document the new
metric and this second dash state as the system's vocabulary, not an inline
exception.

## Consequences

- **A SIMID creative's viewability is entirely opaque to AdInteract.** We
  never see the vendor's measurement, cannot alert on it, and cannot show it
  in-product. This is the honest shape of a pass-through and matches
  ADR-0003's posture: we do not claim capability we don't have.
- **VPAID's `viewable` count is a number we can improve later without a
  schema change** — the event, the beacon, and the dashboard caption all
  already say "self-reported." Pursuing MRC accreditation later would change
  only the caption and the methodology behind the observer, not the plumbing.
- **`config_schema`'s new `selected_format` controller is a reusable
  primitive.** Any future format-specific field (not just OMID) can gate on
  it the same way. The cost is now two controllers a schema author must
  reason about instead of one: real fields, and this one synthetic one.
- **Growing `creative_event_type` again will hit the same enum-safety issue.**
  The `set local check_function_bodies = off; ... set local
  check_function_bodies = on;` bracket around `get_creative_overview()` in
  `schema.sql` is the pattern to repeat: scope it to only the function whose
  body references the new literal, not the whole transaction, so every
  other function keeps normal apply-time validation.
- **The OMID pass-through's correctness depends on the player, not on us.**
  We can validate that the VAST XML we emit is well-formed and spec-shaped;
  we cannot validate that a given DSP's player actually honors
  `<AdVerifications>` or implements OMID's Access Modes correctly. That is
  true of every VAST element a player might ignore, but worth stating
  plainly here since this is the first verification-layer node this product
  emits.

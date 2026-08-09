# 0011. Conditional, grouped config schemas — and per-path click-through

- Status: Accepted
- Date: 2026-08-09

## Context

Quick Setup Quiz was a single screen: one question, up to four options, one exit.
Every option led to the same result, and which option the viewer picked was
discarded. To model a real qualification flow it needed three things at once:

1. **exactly two options (A/B) per step** — two is what makes a branching table
   tractable; four would mean up to 64 outcomes at three steps;
2. **1, 2 or 3 steps**, chosen by the advertiser;
3. **a configurable exit** — one shared result, or a distinct
   {heading, button text, click-through URL} per answer path (2 / 4 / 8 outcomes).

None of that fits the schema vocabulary ADR-0005 established. `config_schema` could
describe a flat list of always-visible fields and nothing else, so a quiz with three
steps and eight exits would have rendered **all 62 fields at once** — including the
step-3 questions of a one-step quiz, and all eight exits of a quiz configured to
share one. Worse, `required` was unconditional: `step2Option1Label` cannot be
required for a two-step quiz and optional for a one-step quiz if the only lever is a
boolean on the field.

The obvious escape — a bespoke quiz editor component — is the thing ADR-0005 exists
to prevent. The cost is not the one component; it is that every subsequent template
gets its own, and `config_schema` stops being the contract.

## Decision

**Extend the schema vocabulary instead, and keep the form generic.** Three optional
properties, all defensively parsed, all inert for a schema that does not use them:

| Property | Meaning |
| --- | --- |
| `showWhen: [{ field, equals[] }]` | The field is *active* only when every clause holds. AND, not OR. |
| `group: string` | Section id. Consecutive fields sharing a group render as one hairline-separated section; the heading comes from `dict.configurator.groups`. |
| `block: string` | Sub-block inside a `kind: "matrix"` group — for the quiz, the answer path an exit belongs to. |

plus a `groups: [{ id, kind }]` root key describing how each group renders.

Four consequences of that shape are load-bearing:

- **An inactive field is unmounted, never merely hidden.** An unmounted input
  contributes nothing to `FormData`, so pruning and the DOM agree by construction. A
  *rendered* `required` input that is only visually hidden blocks native submit in
  Chrome (`An invalid form control is not focusable`) and the submit silently does
  nothing — conditional `required` is impossible any other way.
- **`showWhen` gives conditional required-ness for free.** A hidden field is never
  validated and never written, so `required: true` simply does not apply while the
  field is off.
- **Visibility resolves in schema order**, each field judged against the values of
  the fields already found visible. That yields transitive hiding — hide a
  controller and everything downstream goes with it, rather than staying gated on a
  stale value the user can no longer see. It also makes field order significant:
  `parseConfigSchema` warns in development when a clause names a field declared
  later, and drops a clause naming a field that does not exist at all. **Fail
  visible, not hidden** — an unreachable required field is unsavable and invisible
  to whoever has to debug it; a stray visible field is wrong but obvious.
- **Inactive fields are not persisted.** `config_json` is inlined into
  `<AdParameters>` on every ad request, so a switched-off branch must not ride along
  on the serving path (CLAUDE.md, AdTech rule 3). The trade is explicit: switching a
  three-step quiz to one step and saving discards the step 2–3 copy. Within an
  editing session nothing is lost — the form keeps the draft and only the projection
  changes.

One shared implementation enforces all of it: `buildConfigFromValues` in
`lib/config-schema.ts`, used by `createCreative`, `updateCreative` **and** the
preview mint. Those three had carried three copies of the same loop, with a comment
in `app/api/vast/preview/route.ts` asking that they not diverge. Pruning is the
reason it now has to be one function rather than a convention: the preview panel
POSTs the entire form state, including values for fields the user has since switched
off, so only a server-side prune keeps preview honest about what Save would write.

### Quiz field naming: step 1 keeps its legacy keys

Step 1 stays on `questionText` / `option1Label` / `option1ImageUrl` /
`option2Label` / `option2ImageUrl`; steps 2–3 use the prefixed form
(`step2QuestionText`, …). The asymmetry is deliberate and buys a **zero-migration**
change: a creative saved before this template could branch carries neither
`stepCount` nor `resultMode`, and both defaults (`1`, `universal`) reproduce its old
behaviour exactly. `option3*` / `option4*` leave the schema; values already stored
for them are simply dropped the next time the creative is saved, because the rebuild
is schema-driven. No cleanup job.

This did surface one blocking defect, fixed here: the edit page seeded every field
absent from `config_json` to `""`, which is fine for text and **fatal for a required
`select`** — a controlled `<select>` whose value matches no `<option>` renders blank
and then blocks submit, so no pre-existing quiz creative could have been edited
again. Absent `select` fields now start at the schema default.

### Per-path click-through: VPAID carries it, VAST keeps the fallback

A branching exit needs a different destination per answer path, and VAST has exactly
one `<VideoClicks><ClickThrough>` per creative. The runtime therefore passes the
resolved URL to `api.clickThrough(url)` → `AdClickThru(url, "", true)`, while the
VAST document keeps a single universal `clickThroughUrl`, which stays **required in
both modes**.

That is not redundancy, and it is the honest reading of the standards rather than
the optimistic one. VPAID 2.0 says a player receiving `AdClickThru` with
`playerHandles = true` should navigate to the supplied URL; VAST says a player may
prefer the document-level `<ClickThrough>`. **Players genuinely disagree, and Google
IMA is known to favour the VAST-level URL when one is present.** So:

- **Per-path click-through is best-effort and player-dependent.** We do not claim
  otherwise in the UI or the docs — ADR-0003's posture is that we state what the
  standards actually guarantee.
- A player that ignores the VPAID-supplied URL lands on the advertiser's universal
  destination: **degraded, never dead.** Omitting `<VideoClicks>` in branching mode
  would force honouring players to use the per-path URL, but leaves every other
  player with no destination at all, and some players will not render a clickable
  region without it. That trade is rejected.
  - **One caveat, stated because "never dead" is otherwise an overclaim:** the
    requirement lives in the template's `config_schema`, not in the serving path.
    `lib/vast/builder.ts` omits `<VideoClicks>` when `clickThroughUrl` is absent and
    `generateVast` still serves, so a row that predates the requirement — or a
    hand-built config — would serve a click-to-nowhere ad. Every seeded template
    marks the field required, so no configurator-built creative can reach that
    state; enforcing it in `generateVast` (or an adapter's `isServable`) is the
    outstanding fix, and it belongs with a `/security-review` of the public path
    rather than inside this change.
- **The Sandbox tab reads `AdClickThru`'s argument directly, so branching always
  looks correct there** — including on inventory where it would collapse. Verify
  branching in Google IMA and Fluid, not only in Sandbox.

The result *screen* (heading and button text) has no such caveat: it is drawn by our
own code inside the ad slot, so per-path headings and button labels are exact.

### Preview token ceiling

A fully-filled three-step branching quiz is ~3.3KB of config — six Storage media
URLs at ~158 chars each, plus 24 exit fields — which exceeded the old 3072-byte
preview cap. Raised to **5120** (config) and **6144** (token payload), preserving the
existing relationship where the config guard trips first: exceeding the payload cap
*throws*, and a throw on the mint path is a 500 where a 413 was intended.

The token travels as a base64url URL **path segment**, so this bounds the request
line: ~6KB of payload is ~8.2KB of URL. The binding limit is the 8KB request line
most CDN front-ends allow (nginx's default `large_client_header_buffers 4 8k`), not
Vercel's larger URL+headers budget — which puts the architectural ceiling for this
mechanism at roughly **5.6KB of config**. Past that the answer is a short opaque id
backed by a row — ADR-0006's rejected alternative — not a bigger token. Moving the
token to a query string buys nothing; it is the same request-line bytes.

Production serving is unaffected: `/api/vast` reads `config_json` from the database
and has no such cap.

## Consequences

- **Every future template inherits this vocabulary.** That is the point, and it is
  also the cost: `showWhen` semantics are now something schema authors must know,
  and field *order* carries meaning it did not before.
- **The quiz `config_schema` is ~11KB of jsonb**, and its 62 parsed fields reach a
  client component, so they land in the RSC payload of both configurator pages. This
  is the largest single contributor to those pages' payload and the honest price of
  keeping the form generic. A flat enumeration of 14 answer paths is verbose, but
  the counts are fixed and small; an array/repeater field type would have meant
  arrays in `coerceFieldValue`, a new FormData encoding, and a new `<AdParameters>`
  shape for no user-visible gain.
- **`kind: "matrix"` is a real UI commitment, not just data.** Eight exits × three
  fields rendered flat is a wall; the matrix renders them as 44px path rows with a
  semantic state rail and one block open at a time (`docs/design-system.md` §6).
  Because closed rows submit through hidden inputs — which browsers bar from
  constraint validation — native `required` cannot reach them, so the form carries a
  client-side completeness guard. Without it a half-filled exit would only be caught
  by the server action, whose `fail()` redirects and discards everything else typed.
- **`config_json` key sets now legitimately differ between two creatives built from
  the same template.** Anything reading it must not assume a fixed shape.
- **A multi-step quiz can outlive its own `<Duration>`, and that is the one risk worth
  testing on real inventory.** `lib/vast/builder.ts` injects 30s unconditionally, so on a
  three-step quiz `AdVideoComplete` fires — and `getAdRemainingTime()` returns 0 — while
  the viewer is plausibly still on question two. A player that treats either as its cue
  to call `stopAd()` would tear the creative down *before the result screen renders*,
  which is precisely where the per-path click-through lives. ADR-0009 accepted this
  reclaim risk as unvalidated; branching is what makes it expensive. Exercise 2- and
  3-step quizzes past the 30s mark in Google IMA and Fluid, and scale the injected
  `durationSeconds` with `stepCount` if a player truncates.
- **Every per-path heading, button label and URL ships in the clear in
  `<AdParameters>` on every ad request** — the whole `config_json` is spread there. Same
  exposure as `<ClickThrough>` has always had, and consistent with ADR-0003, but nobody
  should describe branch destinations as hidden.
- Two creatives can share a template and a `stepCount` yet differ in whether the
  universal result strings exist at all. The runtime keeps defensive fallbacks for
  every per-path lookup, because `<AdParameters>` can also be hand-built.
- The catalog demo (`lib/template-demo.ts`) resolves the same visibility walk, so a
  demo is always a configuration a user could really have saved — otherwise the
  landing page would carry all 42 branching-exit fields populated with their own
  labels. It also fixes a pre-existing bug where the demo rendered the literal
  string `"Option 3 label"` as a quiz answer.

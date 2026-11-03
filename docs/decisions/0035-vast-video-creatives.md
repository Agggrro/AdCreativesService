# 0035. VAST video creatives: a system template, a version-aware builder, and quartiles counted

- Status: Accepted
- Date: 2026-11-03
- Amends: [0002](0002-multi-format-creative-delivery.md) (a document kind beside the adapters), [0012](0012-viewability-measurement.md) (player-reported viewability for this kind), [0013](0013-public-free-tools-section.md) (the generator stops being a placeholder; see [0036](0036-public-tool-that-saves.md)), [0014](0014-vast-inspection-engine.md)/[0020](0020-validator-reports-faults-not-opinions.md) (the ordering rule reads the declared version), [0016](0016-three-events-hourly-counters.md) (start, quartiles and complete counted for this kind)

## Context

Every creative so far is an instance of an interactive template: a VPAID unit or a SIMID
document, configured through `config_schema`, served through a format adapter. The owner
wants the placeholder at `/tools/vast-generator` to become a product with the same shape
— configure, save to Мои креативы, get a dynamic VAST tag — for the most common creative
in the trade, which none of the templates is: a **plain linear video**, our upload or the
buyer's own link, with a set of trackers.

Two requirements set it apart. The buyer chooses the **VAST version** (2.0 to 4.3),
because DSPs and SSPs still ingest only what they ingest, and the version decides which
parameters exist at all — there is no skip in 2.0, and the InLine-level
`<AdVerifications>` arrives in 4.1 (before it, OMID rides in `<Extensions>`, which the
generator does not offer). And the
buyer wants **our own statistics to include video progress** — start, the three
quartiles and complete — which [ADR-0016](0016-three-events-hourly-counters.md) cut from
every creative.

A wrapper around a third-party tag and fallback tags were discussed and deferred by the
owner. VAST 4.4 has an XSD in IAB's repository since July 2026 but reads as a draft, and
the inspector does not know it.

## Decision

**One system template, not a second kind of creative row.** `vast_video` is a published
`templates` row with `supported_standards {video}`, no runtime keys, and a new column,
`in_catalog = false`. Everything the hot path relies on is unchanged: the foreign key,
`validate_creative_format`, the inner join in `private.creative_serving`, the serving
snapshot (`SNAPSHOT_SCHEMA_VERSION` stays 1), `private.is_entitled` and its TypeScript
port. An `all_access` grant covers the row like any template, so the tag serves exactly
while its owner is entitled — the kill-switch is the one every creative has. The
alternative, a `creatives.kind` with a nullable `template_id`, would have changed both
copies of the entitlement predicate, the view, the trigger and the snapshot shape for a
creative that needs none of it.

The row has to be *published*: the trigger is not `security definer` and reads the
template under the inserting user's RLS, which shows published rows only. Hence
`in_catalog`, which every catalog surface filters on — `/catalog`, its pages, the landing
gallery, the sitemap, the configurator's entry and the harness — and which the
schema-driven `createCreative`/`updateCreative` refuse, since that form would rebuild a
video creative's config from a schema that names two fields.

**Its `config_schema` declares only the click destinations** — `clickThroughUrl` and
`companionClickThroughUrl`, url-typed — because `click_fields` is derived from them. That
is what routes both through `/r` with a click id, so postbacks work for a video creative
with no new serving code. The AdChoices icon's click-through is deliberately not one: a
disclosure click is not an ad click.

**`video` is a document kind beside the adapter registry, not an adapter.** An adapter
fills `<MediaFiles>` of the interactive InLine; a plain video needs a different document
per version. `handleVast` dispatches on `selected_format === "video"` after the
`should_serve` gate and before the interactive unit is resolved, to `lib/vast-gen`:

- `validate.ts` parses `config_json` into a typed `VideoConfig`, twice: at save (with
  ownership and an R2 HEAD for uploaded media) and **again at serve time**, because an
  owner can PATCH their own `config_json` through PostgREST and the server action is
  therefore not the control. A config that fails is a settled fact: an empty VAST at the
  creative's declared version, cached like any other no-ad.
- `build.ts` emits the document for its version, in the order that version's XSD
  declares — InLine, Linear, VideoClicks, Creative, Companion and Icon alike.
- The beacon and click URLs are injected. The server signs them (`trackingUrl`,
  `clickUrl`); the generator's live preview, which runs in a signed-out visitor's browser,
  gets inert placeholders that `/t` drops. No secret reaches the browser and the public
  page signs nothing.

**One version matrix, shared with the inspector.** The facts each version defines —
when a feature arrived, the InLine and Wrapper child sequences, the Tracking event
enumerations, the macros a player substitutes — moved into `lib/vast-inspect/spec.ts`,
read out of IAB's XSDs (2.0.1, 3.0, 4.0, 4.1, 4.2; 4.3 has none and reads as 4.2). The
inspector's rules and the generator both read it, so the generator cannot offer a
feature at a version the validator calls unavailable. Generated documents are held to
zero errors and zero warnings by our own validator for every version.

That surfaced a validator defect, fixed here: the ordering rule measured every document
by the 4.2 sequence, and a conformant 2.0 or 3.0 InLine — which opens `AdSystem →
AdTitle` — drew a warning. It now reads the declared version. The consequence, signed
off with this ADR: a 3.0 tag authored in the 4.x order is now warned about, which is
what the 3.0 XSD says.

**What a video creative carries, by version** (the form offers exactly this):

| | 2.0 | 3.0 | 4.0 | 4.1 / 4.2 / 4.3 |
|---|---|---|---|---|
| Our Impression, Error, ClickTracking, start…complete | ✓ | ✓ | ✓ | ✓ |
| `[ERRORCODE]` in Error | — | ✓ | ✓ | ✓ |
| The buyer's own Error pixels | — | — | ✓ | ✓ |
| Skip (`skipoffset`, `skip` event) | — | ✓ | ✓ | ✓ |
| Advertiser | — | ✓ | ✓ | ✓ |
| Icons / AdChoices | — | ✓ | ✓ | ✓ |
| Companion banners | ✓ | ✓ | ✓ + CompanionClickTracking | ✓ |
| UniversalAdId | — | — | `idRegistry` + `idValue` | `idRegistry` + text |
| ViewableImpression (our `viewable`) | — | — | ✓ | ✓ |
| AdServingId | — | — | — | ✓ |
| OMID (`AdVerifications`) | — | — | — | ✓ |

Third-party trackers are offered per event from the version's own XSD enumeration, so a
tag never carries an event its schema does not name.

**The XSDs are the proof, not the inspector.** `npm run check:vast-xsd` validates every
golden — video and, since the same release, SIMID and VPAID — against IAB's schema for
its version (fetched at a pinned commit into `node_modules/.cache`,
never committed: IAB's repository grants no right to redistribute them). It is what
pins the orders the inspector deliberately does not check — Linear, Creative,
VideoClicks, Companion, Icon — and on its first run it found a real defect our own
validator could not: 2.0 and 3.0 declare InLine's `<Error>` `maxOccurs="1"`, so before
4.0 the one slot is ours and a buyer's error pixel is a 4.0+ feature. The check
percent-encodes `[MACROS]` in the copy it validates — libxml2 reads `xs:anyURI` strictly,
and VAST's bracket macros are spec syntax, not a defect — and adds the namespace a 4.x
schema declares, which our tags omit as players expect.

**Start, the three quartiles and complete are counted — for this kind only.** `/t`
accepts `start`, `q25`, `q50`, `q75` and `complete` again, into the same hourly
counters. The signature binds the creative and the event, and those URLs are minted only
into video documents, so the signature is the per-kind gate: interactive creatives still
emit no `<TrackingEvents>`, and their goldens prove it. The owner reads them through
`get_creative_video_funnel`, all-time like the overview, as a strip ending in VTR —
completes over impressions, with the denominator named.

**`viewable` means "reported by the player"** for a video creative on 4.0+, through
`<ViewableImpression><Viewable>`; for VPAID it is still the unit's own report
([ADR-0012](0012-viewability-measurement.md)). The detail page says which.

**Media are hosted as uploaded**, no transcoding: an mp4 or webm up to the existing
25 MB cap, or the buyer's own https URL, which we neither host nor size. Duration and
dimensions come from the browser's own reading of the file and are bounded on the
server; bitrate is computed on the server from the R2 object's size.

## Rollout

`.env.local` is the production database, so the order is the design:

1. The schema (`in_catalog`, `get_creative_video_funnel`, the column grants on
   `creatives`) — invisible to deployed code, which writes only granted columns.
2. A preparatory release: the catalog filters, the refusals in the generic actions, the
   shared spec and the version-aware ordering rule.
3. The seed: the `vast_video` row, published, out of the catalog. Until step 4 nothing
   can create a video creative except a hand-written PostgREST insert, which the old
   `/v` answers with an empty VAST.
4. The generator release.

## Consequences

- **Write amplification.** A completed video impression costs six
  `increment_creative_event` upserts — impression, start, three quartiles, complete — and
  seven with viewable: about three times a VPAID impression, each a Worker-to-PostgREST
  request and a row lock on a hot hourly bucket. Batching (a Durable Object, a Queue or
  Analytics Engine) is the remedy when traffic asks for it, not before.
- **Copied XML outlives a revoke.** Our document stops on revoke; a copy of it pasted
  elsewhere keeps pointing at our media URL. That is [ADR-0003](0003-access-control-over-code-hiding.md)
  stated honestly, and it is equally true of template media today.
- **Media can be orphaned** — replaced on edit, or uploaded and never saved — as before;
  there is still no collector.
- **External video can disappear** without notice. The creative's page links its tag to
  the validator for exactly that reason.
- **The interactive builder followed.** This work made three departures from the 4.2
  XSD visible in the SIMID/VPAID document — `Duration` before `AdParameters`,
  `ClickThrough` before `ClickTracking`, `UniversalAdId` before `Linear`. They were
  fixed in the same release, on the owner's call (2026-11-03), and `check:vast-xsd` now
  validates those goldens too. Every interactive tag's bytes changed with it. Fluid
  Player 3.59.0 reads these nodes by name, and the MediaFile order it decides VPAID by
  did not move; Google IMA, closed-source, plays Google Ad Manager's own tags, which
  break the XSD's order in all three places, and is checked live before the release.
- **One rendition, no Mezzanine.** The 4.x prose asks for several ready-to-serve files
  and makes a Mezzanine required in ad-stitched executions; the generator emits the one
  file the buyer gave it. A tag meant for server-side insertion or CTV may be refused
  there (error 406) until renditions exist.
- **`AdServingId` is the creative id**, not a per-serving value: the tag is cached per
  creative, so a buyer's `[ADSERVINGID]` cannot tell two servings apart.
- **A buyer's pixel is held to IAB's macro data by kind** — `[ERRORCODE]` only in an
  Error pixel, `[CLICKPOS]` only in click tracking — and no macro may stand in a host,
  where the player's substitution would name an address nobody checked
  (docs/security.md, "VAST video creatives").
- **Deferred, not designed here:** the wrapper around a third-party tag and fallback
  tags (the owner's call, 2026-11-03), VAST 4.4 (when IAB finalises it and the inspector
  learns it), Pricing, Mezzanine and transcoded renditions.

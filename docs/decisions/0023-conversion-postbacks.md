# 0023. Conversion postbacks: a click redirect, per-click rows, and an S2S endpoint

- Status: Accepted
- Date: 2026-09-27

## Context

A media buyer runs a CreoSmith creative by pasting one VAST URL into a DSP, and sends
the viewer who clicks it to an offer at a CPA network. The conversion — a lead, a
deposit — happens at the network, not with us. To judge a creative, and a quiz's
individual answer paths, the buyer needs those conversions counted per creative.

Trackers (Keitaro, Binom, Voluum, RedTrack) all solve this the same way:

1. The click goes through the tracker's own redirect, which mints a **click id**.
2. The id rides into the offer URL through a macro (`?sub1={click_id}`), and the
   network stores it against the visitor.
3. When the visitor converts, the network calls the tracker's **postback URL** server to
   server, with that id, and the tracker credits the conversion to the click.

We had none of the three. `<ClickThrough>` and the quiz's per-exit URLs pointed straight
at the offer, so our server never saw the navigation. The only click we recorded was the
aggregate `<ClickTracking>` beacon ([ADR-0016](0016-three-events-hourly-counters.md)) —
a counter, with no id a network could ever post back. A conversion had nothing to attach
to.

## Decision

**Every click destination in a served tag goes through `/r`, which mints a click id; a
partner network posts conversions back to `/pb` with it.**

### The redirect — `GET /r` (ad domain)

- **Rewritten on the server, in the VAST builder.** `lib/vast/builder.ts` replaces each
  http(s) destination with a signed `/r?cid=&f=&exp=&sig=` link, in `<ClickThrough>` and
  in the same keys inside `<AdParameters>`. The units already open whatever URL they are
  handed, so the tag-level link, the quiz's fourteen exits and a player that opens
  `<ClickThrough>` itself are all covered **without touching a template**.
- **Which fields are destinations** is computed once, in SQL: `click_fields` in
  `private.creative_serving` lists the `config_schema` fields of type `url`, except
  `verificationScriptUrl` — an OMID script the player *loads*
  ([ADR-0012](0012-viewability-measurement.md)), not a link anyone clicks. It rides in the
  creative snapshot as an **optional** field, so no `SNAPSHOT_SCHEMA_VERSION` bump: an
  older reader ignores it, and a snapshot without it routes nothing through `/r` — the
  pre-ADR behaviour. `lib/config-schema.ts`'s `isClickField()` mirrors the definition,
  name check included, for everything the dashboard says about those fields: where the
  configurator explains the macros, and which exits the report lists and warns about.
- **The request can point it nowhere.** The link carries the *field name*; `/r` reads the
  destination from the creative's own config (snapshot first, Postgres on a miss) and only
  for a field in `click_fields`.
- **And only a genuine signature gets a redirect.** A field name alone would still let any
  account — signing up is free — turn our ad domain into a redirect to whatever it
  configured, and a phishing page behind our domain is how every customer's tag gets
  blocklisted with it. A signature only `/v` can mint, and only for a creative that may
  serve, is the evidence that the link came from a served ad. It covers the creative's
  **owner** as well as its id and the field — read from the creative at click time, not
  carried in the link — because a deleted creative's id can be taken by another account,
  and links collected while the old creative was live must not follow it there. So:
  - **fresh** (within 24 hours of the tag being built) — redirect, and record the click;
  - **stale** (up to 7 days past that) — redirect, record nothing: a viewer on a stale
    cached tag still reaches the advertiser;
  - **forged, missing or older** — `404`.
  A day rather than a beacon's hour, because the signature protects nothing `/v` does not
  hand out afresh on every fetch, and an expired link costs a real conversion its
  attribution.
- **What a recorded click is.** A fresh link, fetched with GET, by something that does not
  identify as a crawler (`isLikelyBot()`): ad-quality scanners and landing-page audits
  fetch every `<ClickThrough>` they see. Everyone gets the identical 302 — an answer that
  varied by user agent would look like cloaking — but only a click gets an id. HEAD records
  nothing. The id is 12 random bytes of lower-case hex (some networks case-fold or reject
  `-`/`_` in a sub-id); `{click_id}`, `{creative_id}` and `{outcome}` are filled in, and the
  result is normalized through `URL` so a Cyrillic path or a `.рф` host survives a header
  that only carries Latin-1. Every response is `no-store`: a cached 302 would hand the
  next viewer the previous one's id. A database that cannot be read is a `503`, not a
  `404`.
- **Previews are never tracked.** The preview context sets `click_fields: []`.
- **Script-capable destinations are removed from the tag.** A `javascript:` or `data:`
  click-through (which `<input type="url">` happily accepts) would run in the publisher's
  page on a player that `window.open`s it there. The builder drops them and the save path
  refuses them. Other schemes — an app-store deep link — pass through as before, untracked.

### The click store — `creative_clicks`

The one per-event table in the schema. ADR-0016 removed per-beacon rows because
impressions arrive at ad-serving rates; a click through `/r` is a person leaving the ad,
orders of magnitude rarer, and attribution needs the id itself, which a counter cannot
hold. We keep the exit field and a two-letter country from the platform's geo header —
**not the IP address**. Clicks are purged after **90 days**.

Rows are written only by `record_click()`, which declines past **600 clicks per creative
per minute**. `/v` is public, so anyone can fetch a tag and replay its links, and unlike
the beacons' counters every replay would be a new row. The redirect is never affected; a
declined or failed write is logged, because the id is already on its way to the network.

### The postback — `GET|POST /pb` (app domain)

- **Authenticated by a per-account key** in the URL: 32 hex characters, made on first
  visit to the settings page, rotatable there. A network's server holds no session, so the
  key is the whole of the authentication. It is stored in the clear because the owner must
  be able to copy the URL again; rotation is the remedy for a leak.
- **Parameters:** `click_id` (required), `status`, `payout`, `currency`, `txid`.
  `lib/postback.ts` parses them and is the entire policy:
  - statuses normalize to `approved | pending | rejected`. `lead` is pending, as in
    Keitaro — counting it as revenue would overstate every report until the rejections
    arrived. No status at all is approved; an unknown word is an error, not a guess;
  - a decimal comma is accepted, except `1,234` — a thousands separator to one network
    and a decimal comma to another, a factor of a thousand either way — which is refused;
  - an **unexpanded macro** (`{status}`, `[payout]`) is an error, `unexpanded_macro` —
    never read as "not sent", which would record a lead as approved or revenue as zero —
    and in `click_id` it is `bad_click_id`, the most common setup mistake there is;
  - NUL bytes are removed (Postgres text cannot hold them), logged values are truncated to
    128 characters, and a form body is read to 8 KB and no further.
- **Idempotent, in SQL.** `record_postback()` finds the key's owner's conversion for
  `(click_id, txid)` and updates it — never held to the click window, since networks settle
  weeks later and the click row may be gone — or else inserts, if the click is the owner's
  and **under 30 days old**. `txid` defaults to `''`, so a click carries one conversion
  unless the network distinguishes several. **A late `pending` never overwrites a settled
  status** (a retried hold landing after its own approval would un-approve it); a chargeback
  and a reversal still go through. A report that changes nothing — a retry, that late
  `pending` — answers `unchanged`, so the owner's log does not claim an update that did not
  happen. `on conflict` absorbs a network that fires the same postback twice at once.
- **Every hit with a valid key is logged** for the owner (7 days), including the failures
  — a network's own log says only "HTTP 400". A wrong key writes nothing. The log is capped
  at 3,600 rows per account per hour and written best-effort, so a row it cannot take
  never rolls back the conversion. The response is `200 OK` (created, updated, unchanged),
  `400 <code>`, `403 unknown_key`, or `503` when we could not record it — most networks
  retry a 5xx.

### Reporting

`get_creative_conversions()` returns rows per (UTC day, exit) for one creative the caller
owns. The creative page shows tracked clicks, conversions (approved + pending, with the
split and the rejected count said not to count), approved revenue **per currency** — no
FX, and a sum across currencies is a number in none — and two ratios that name their
denominators: **CR** of clicks and **EPC** per click. A conversion is filed under the day
its **first** postback arrived and stays there. A later status change moves it between
approved, pending and rejected on that same day — so a day already read can still change,
but a conversion never jumps to another one.

The creative page warns when a configured exit has no `{click_id}` — naming the exits, with
a link to edit — but only once the account has a postback key (`has_postback_key()`);
otherwise every creative made before this ADR would carry a warning its owner never asked
for.

### Not done, on purpose

- **Relay to the traffic source.** Forwarding a conversion to the DSP so its bidder can
  optimise is the other half of most trackers — but the video DSPs our buyers use take
  conversions through their own pixels, not S2S postbacks.
- A pixel (browser) postback, custom status mappings, per-client rate limiting, and a real
  bot filter on `/r` (a maintained spiders-and-bots list rather than a user-agent regex).
- A top-level nav entry and a conversions column in the creatives list. The top bar
  already overflows by a few pixels at 768px and the entry added ~90; the list's column
  crushed the creative name to 111px at 1280. The settings page lives under
  `/dashboard/creatives/postback`, reached from the list header and from the report.

## Consequences

- A click now costs a hop — one function invocation and a snapshot read — before the
  offer loads.
- **The signature bounds replay, it does not stop it.** Anyone who fetches a tag holds
  day-long signed links and can replay them; a scanner posing as a browser is counted.
  Click counts and CR can be diluted this way, up to the per-creative cap. And the cap cuts
  both ways: a flood above 600 a minute on one creative leaves that minute's real clicks
  without a recorded id, so their conversions come back `unknown_click`. The layer that
  actually answers a flood is a per-IP rate limit at the edge (Vercel Firewall on `/r` and
  `/pb`), which is configuration rather than code and not yet set. Conversions themselves
  cannot be forged without the account's postback key.
- **Rotating the signing key now breaks click links in flight.** A beacon under a rotated
  key was merely dropped; a click link under one is a `404` for the viewer, for as long as
  that link would have lived. Setting `TRACK_TOKEN_SECRET` for the first time is such a
  rotation. Do it off-peak; see docs/security.md.
- Two click numbers now exist and differ on purpose: the delivery strip's (the
  `AdClickThru` beacon, all time) and the conversion report's (tracked clicks through `/r`,
  30 days). The report labels its own "Tracked clicks".
- A player that honours `<ClickThrough>` over the unit's per-exit URL records every quiz
  click under `clickThroughUrl` — the per-path caveat in docs/adtech-standards.md carries
  over to attribution by exit.
- VAST macros written into a destination (`[TIMESTAMP]`, `[DOMAIN]`) are no longer seen
  by the player, which now only sees the `/r` link; they reach the advertiser literally.
  IAB does not list `<ClickThrough>` as a macro context, but some players expanded them.
- Tags already pasted into a DSP start routing through `/r` once their snapshot carries
  `click_fields` — `npm run snapshot:backfill`, and every save thereafter — with no change
  to the tag URL, because the VAST is dynamic. Until then their quiz exits are also not
  scrubbed of script URLs.
- Deleting a creative deletes its clicks and conversions with it; the confirmation copy
  says so.
- The destructive-confirmation dialog became `components/ui/ConfirmAction.tsx`, shared by
  delete-creative and rotate-key, and gained what both lacked: focus returns to its
  trigger, Tab stays inside, Escape works wherever focus is, and the consequence line is
  announced.

# 0016. Three ingested events, counted into hourly buckets

- Status: Accepted
- Date: 2026-08-16

## Context

Analytics was the first thing in the product that could not survive its own success.

`creative_events` stored **one row per beacon**, and a single impression fired up to
seven: `<Impression>`, `start`, three quartiles, `complete`, plus the VPAID-only
viewability pixel. At a modest hundred thousand impressions a day that is 700,000 inserts
— into the same Postgres that serves login, the configurator and the Stripe webhook. The
first thing to break would not have been the dashboard; it would have been a missed
subscription event.

The read side was worse than the write side. `get_creative_overview()` did

```sql
left join public.creative_events e on e.creative_id = c.id
```

and counted with `filter`, so it scanned **every event a creative had ever produced**,
every time the dashboard loaded. The one index on the table, `(creative_id,
occurred_at desc)`, did not serve that query at all. Dashboard cost therefore grew with
lifetime traffic rather than with a window — it would never have got faster, only slower.

Separately, `<ClickTracking>` did not exist. [ADR-0008](0008-catalog-first-information-architecture.md)
had decided "no clicks, no CTR", so the one metric that is genuinely ours to report —
did the interaction lead anywhere — was the one we did not have.

## Decision

**Ingest exactly three events**: `impression`, `viewable`, `click`.

- `start`, the three quartiles and `complete` are removed from the VAST document entirely. The
  `<TrackingEvents>` element is not emitted at all rather than emitted empty. These
  counted video progress, which the buyer's own DSP already reports; we were paying a
  network round trip each to duplicate someone else's number.
- `viewable` is unchanged: VPAID-only, self-reported, fired by the unit's own
  IntersectionObserver ([ADR-0012](0012-viewability-measurement.md)).
- `click` is new, and its definition is the point of it. `<ClickTracking>` is added to
  `<VideoClicks>`, and it fires when the player handles the unit's VPAID `AdClickThru`.
  The runtime raises that **only from the final call-to-action that opens the
  advertiser's URL** — `api.clickThrough()` in `runtime/lib/vpaid-base.js`, whose only
  callers are each template's CTA handler. A quiz answer, a slider drag, a scratch
  gesture never reach it. So the number means "interactions that led somewhere", not
  "clicks on the ad", and it will read *lower* than a DSP's click count. The dashboard
  says so in a qualifier under the tile, because unexplained it looks like undercounting.

**Store counts, not events.** `public.creative_event_counters` is keyed
`(creative_id, event_type, bucket)` where bucket is `date_trunc('hour', now())`, and
ingest is one `insert … on conflict do update set count = count + 1` through
`increment_creative_event()`. Hourly rather than daily because intraday pacing is
something media buyers actually read; `rollup_creative_events()`, called by the daily
cron, collapses buckets older than 30 days into one per day so the table does not grow
24x faster than it has to.

The upsert lives in SQL rather than app code because PostgREST cannot express it, and a
read-then-write from the beacon route would lose updates under exactly the concurrency
this path is built for.

## Consequences

- Writes per impression drop from up to seven rows to at most three upserts, and the
  table's size becomes a function of time and creative count rather than of traffic.
- `get_creative_overview()` reads through the primary key instead of scanning history.
- **It still returns `is_entitled` and `should_serve`.** That is not analytics: the
  serving badge and the state rail in the creatives list are driven by them, and
  rewriting this function without them would have silently switched off the "is my tag
  live?" indicator while looking like a metrics change.
- **Two documented decisions are reversed, deliberately.** ADR-0008's "Only ingested
  metrics are displayed… No clicks, no CTR" is now "impression, viewable, click", and
  `docs/design-system.md` §6's delivery funnel — a closed sequential set of six — is now
  a two-member strip, impression → click. The *rule* in §6 survives unchanged; only its
  membership moved. CTR became derivable and is therefore permitted, but is not added
  here: choosing impressions or viewable impressions as the denominator is a product
  decision, and a buyer will assume whichever is worse for us.
- Viewability stays out of both the delivery strip and the list table. It is
  format-conditional, and §6 is explicit that a conditional metric inside a closed set
  reads as a broken tile rather than a deliberate absence. The list mixes SIMID and VPAID
  rows and has nowhere to put the qualifier that a "not applicable" reading requires.
- **History is partly lost.** The migration rolls existing `impression`/`viewable`/`click`
  rows into counters and drops the rest with the table. Per-event timestamps and the
  `meta` column are gone; `meta` was never written, so nothing was in it.
- Per-event granularity is gone for good. Anything wanting per-impression detail —
  frequency, unique reach, session paths — now needs a different store, not a different
  query. That is the trade: this design is for counting, not for analysis.
- `on delete cascade` is preserved, so deleting a creative still destroys its delivery
  history, which is what the delete confirmation promises.

# 0032. VAST errors, counted per code

- Status: Accepted
- Date: 2026-10-20

## Context

Every tag we emit has carried an `<Error>` element for a long time. The VAST builder
(`lib/vast/builder.ts`) signs it like any other beacon and appends `&code=[ERRORCODE]`
for the player to fill in. But `/t` ([ADR-0016](0016-three-events-hourly-counters.md))
accepted only `impression`, `viewable` and `click`. A player's error report got the same
204 and was thrown away. When a creative fails in someone's player, that report is the one
signal we receive, and a media buyer cannot get it from their DSP in a form tied to our
creative. Until now, nobody could see it.

## Decision

**Count `<Error>` beacons per VAST error code, into their own hourly counter.**

- **A separate table, `creative_error_counters (creative_id, code, bucket, count)`,** not
  an `error` value of `creative_event_type`. An error is only worth reading with its
  code, and adding a code column to `creative_event_counters` would widen that table's
  key for every impression and click. It uses the same hourly buckets, the same 30-day
  rollup (inside `rollup_creative_events()`, so the cron is unchanged), the same single
  `security definer` writer (`increment_creative_error`, service role only), and the
  same "RLS on, no policies, privileges revoked" read posture.
- **`/t` accepts `e=error`** when the signature is valid for event `error`. Nothing changes
  for the other three events.
- **`code` is unsigned, and that is unavoidable.** The player substitutes `[ERRORCODE]`
  after we sign. So `lib/vast/error-codes.ts` is its entire validation: exactly three
  digits in 100–999, or `0`. A holder of a live error beacon can choose which code a hit
  counts under, never which creative, and only until `exp`. Keys stay bounded at 901 per
  creative. A check constraint repeats the range in the table.
- **`0` means "the player sent no usable code".** That covers a literal `[ERRORCODE]`, an
  empty value, or junk. Many players do not substitute the macro at all, and dropping
  those hits would undercount exactly the players worth knowing about. **A code in range
  but not defined by VAST 4.2 is kept as itself.** It is labelled "outside the spec"
  instead of being folded into `0`, because a vendor's private code is still
  information.
- **Read model.** `get_creative_errors(creative_id)` returns all-time counts per code, with
  the `owned` check that `get_creative_conversions()` uses. The creative page shows a total
  and a table of code, description (RU + EN, for every VAST 4.2 code), count, and share
  of errors.

## Consequences

- **No error rate, anywhere.** An error often fires before any impression, for example
  302 (wrapper limit), 303 (no ad) or 401 (file not found). Ad requests are not counted,
  so there is no honest denominator. The share column is a share **of errors**, and its
  header says so (design-system §6). The total's caption explains why nothing is divided
  by impressions.
- **Not in the creatives list.** A fifth number column pushed the Russian row actions
  behind the table's horizontal scroll at the 1200px container (1147px of content in
  1102px). Errors are a diagnostic read on one creative, not a number scanned down
  thirty rows. `get_creative_overview()` is unchanged.
- **No rail and no alarm colour.** A code is not a state of the creative. Every creative
  served at scale collects some errors, and a red row on each would be the decorative
  rail that §6 forbids.
- Deleting a creative cascades to its error counters, like every other statistic.
- **Deploy order:** apply the schema before deploying the Worker. In the other order,
  `increment_creative_error` does not exist yet. The write fails, `/t` swallows the
  failure as it swallows every write failure, and errors go uncounted until the schema
  lands.

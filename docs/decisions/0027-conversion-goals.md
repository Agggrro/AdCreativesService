# 0027. Conversion goals: a goal on the postback, one conversion per goal per click

- Status: Accepted
- Date: 2026-09-28
- Amends: the conversion identity of [ADR-0023](0023-conversion-postbacks.md) (the rest of
  0023 stands)

## Context

A CPA offer is rarely one action. A finance or gambling offer pays for a registration and
then, separately, for a first deposit; a nutra offer pays for a lead and later for a sale.
The network reports each as its own conversion, under its own goal, and against the same
click — the viewer clicked once.

ADR-0023 identified a conversion by `(click_id, txid)`. Without a txid, the second goal's
postback found the first goal's row and overwrote it: one conversion where the network had
two, carrying the payout of whichever arrived last, and a registration approved late could
change the deposit's status. A transaction id kept them apart, but then the report added a
registration and a deposit into one "Conversions" number, and CR became a blend of two
funnel stages that nobody can act on. A buyer judging a creative — or a quiz's answer
paths — wants to know whether it produces deposits, not how many things of any kind
happened after the click.

Networks already carry the goal: a postback macro for the goal's id or name sits beside the
status and payout macros in the networks our buyers use.

## Decision

**A postback may carry a `goal`; a conversion is `(click_id, goal, txid)`; the report
splits conversions by goal.**

- **On the wire.** `/pb` reads an optional `goal` — whatever the network's goal macro
  gives, its id or its name. Trimmed and otherwise kept as sent, case included, because the
  owner matches it by eye against the network's own report. At most 64 characters, and a
  longer one is refused as `bad_goal` rather than truncated: truncation would merge two
  goals that differ past the limit into one row. Absent or empty is `''`, "no goal". An
  unexpanded macro is `unexpanded_macro`, as for every optional parameter — which a goal
  genuinely named `[FTD]` also trips, since it cannot be told from an unexpanded
  `[goal]`; such a network sends the goal's id instead. It is logged with the rest.
- **Identity.** `unique (click_id, goal, txid)` replaces `unique (click_id, txid)`. A
  click converts once per goal; a status change finds its own goal's row; txid still tells
  several conversions of one goal apart (repeat deposits). A postback with no goal is
  exactly what it was before — `goal = ''`, the value every older row has — so the wider
  key cannot collide where the narrower one did not.
- **Compatibility.** `record_postback()` takes `p_goal` as a ninth, defaulted parameter,
  and the eight-argument signature is dropped in the same transaction. A deployment still
  calling with eight named arguments resolves to the new function and records what it
  always did. So the schema lands first and the code that sends a goal follows — and the
  old key is dropped only after the function stops upserting on it, so even a
  statement-by-statement apply never leaves the function naming a key that is gone.
- **Reporting.** `get_creative_conversion_goals()` returns approved, pending and rejected
  counts and approved revenue per currency, per goal, over the same 30 days, bucketed the
  same way (the day of the first postback) and owner-checked the same way as
  `get_creative_conversions()`. The creative page shows a **By goal** table under the
  summary strip once any conversion in the window carries a goal: conversions, approved,
  rejected, CR of all clicks, revenue. It has no clicks column: a click has no goal until
  it converts, so every goal's CR shares the creative's tracked clicks as its denominator
  — hence "of all clicks", where the by-exit table's "of clicks" means the row's own —
  and a clicks column would repeat one number down every row. It does count rejections,
  because a goal the advertiser declined outright would otherwise be a row of zeros with
  no reason to be there. The strip stays the sum over all goals, and the table's caption
  says so.
- **One reading, one availability.** If either reader fails, the whole report shows the
  unavailable state — not totals that a missing table cannot explain.

### Not done, on purpose

- **A goal filter across the whole report** — exits and days per goal, "which answer path
  produces deposits". It is the natural next step (`?goal=` on the page, a `p_goal` on
  `get_creative_conversions()`), left out to keep this change to the goal's arrival and
  its totals.
- **Choosing which goals count** toward the strip's conversions and CR. Every goal counts
  today; a buyer who wants the strip to mean deposits alone can limit the network's
  postback to that goal.
- **Aliases between goal names** (`dep`, `deposit`, `FTD` as one goal). The report shows
  what the network sent.

## Consequences

- **The strip's conversions and CR add all goals together.** With registrations and
  deposits both posted back, "Conversions" is their sum and CR a blend; each goal is read
  in the by-goal table. Revenue and EPC keep their meaning — money adds up across goals.
- **A goal must arrive on every postback of a conversion, the same each time.** A
  conversion recorded under `goal=reg` and updated later under `goal=1` — the network's
  id instead of its name — is two rows; so is one whose status change arrives with the
  goal missing, which inserts a second conversion under "no goal" rather than updating
  the first. The same was already true of txid. One postback URL per network, sent for
  every event, is the setup that cannot drift; the settings page's parameter table and
  the log show what arrived.
- **Existing setups are untouched.** A network that sends no goal behaves as before, and a
  buyer who separated goals through txid keeps working; the by-goal table appears only
  when a goal arrives.
- The postback log has a `goal` column, and its jsonb carries six parameters; the 4 KB
  CHECK still clears the worst case, about 3.2 KB.
- `npm run test:postback` pins the parser — statuses, payout, unexpanded macros, and the
  txid and goal bounds — which had no test before. Reviewing this change turned up a
  fault older than goals: the log's 128-character cut could end on half an emoji, a lone surrogate
  that PostgREST refuses as invalid JSON, failing the whole call into a 503 the network
  retries forever. The cut now stops short of a split pair, for every parameter.

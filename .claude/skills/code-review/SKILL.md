---
name: code-review
description: Review the working diff for real bugs at high recall. Invoke at the end of a unit of work, before pushing — CLAUDE.md names it as a quality gate alongside doc-sync. Runs ten independent finder angles over the diff (correctness, removed behavior, cross-file effects, language pitfalls, wrapper routing, reuse, simplification, efficiency, altitude, CLAUDE.md conventions), verifies each candidate, then sweeps for gaps.
---

# code-review

Reviews the diff for **recall**: catching a real bug matters more than avoiding a
false positive, because a missed bug ships. Err towards surfacing.

This is the generic gate CLAUDE.md refers to. The domain reviewers —
`vast-spec-reviewer`, `supabase-rls-auditor`, `billing-integrity-reviewer`,
`design-system-reviewer` — go deeper on their own subject; this one covers
everything none of them owns.

## Phase 0 — Gather the diff

Run `git diff @{upstream}...HEAD`, falling back to `git diff main...HEAD` or
`git diff HEAD~1`. If there are uncommitted changes, or the range diff is empty,
also run `git diff HEAD` and include the working tree — the review usually runs
before the commit. A PR number, branch, or path passed as an argument replaces
the target.

## Phase 1 — Find candidates

Run these angles independently, up to 8 candidates each. Do not let one angle
suppress another: if two flag the same line for different reasons, keep both.

Use the Agent tool to parallelise when the diff is large. When it is not
available — or when spawning agents is disproportionate to the diff — work
through the angles yourself, sequentially, in context. Both are fine; skipping
angles is not.

**Correctness angles**

1. **Line-by-line.** Read every hunk, then read the enclosing function — a bug
   in an untouched line of a touched function is in scope, because the change
   re-exposes it. For each line: what input, state, timing, or platform makes
   this wrong? Inverted conditions, off-by-one, null deref, missing `await`,
   falsy-zero checks, copy-paste of the wrong variable, a swallowed catch,
   unescaped regex metacharacters.
2. **Removed behaviour.** For every deleted or replaced line, name the invariant
   it enforced, then find where the new code re-establishes it. If you cannot,
   that is the finding: a dropped guard, a narrowed validation, a deleted test
   that covered a real case.
3. **Cross-file.** For each changed function, Grep its callers and check the
   change against every call site: new precondition, changed return shape, new
   exception, new ordering dependency. Then check its callees.
4. **Language pitfalls.** The classics for this stack: falsy-zero, `==`
   coercion, closure-captured loop variables, `Promise` not awaited in a loop,
   `Object.hasOwn` vs `in`, timezone drift, float equality.
5. **Wrapper routing.** When the diff adds a type that wraps another — cache,
   proxy, adapter, decorator — check every method routes to the wrapped
   instance rather than back through a registry or global, and that it forwards
   everything callers actually use.

**Cleanup angles**

6. **Reuse.** New code that re-implements something the repo already has. Grep
   `lib/` and the files next to the change; name the existing helper.
7. **Simplification.** Redundant or derivable state, copy-paste with a small
   variation, deep nesting, dead code left behind. Name the simpler form.
8. **Efficiency.** Redundant computation, repeated I/O, sequential work that
   could be concurrent, blocking work added to a hot path. Watch for long-lived
   objects built from closures — they pin the whole enclosing scope.

**Judgement angles**

9. **Altitude.** Is the change at the right depth, or a bandaid? Special cases
   layered onto shared infrastructure usually mean the fix belongs one level
   down.
10. **Conventions.** Read the repo-root `CLAUDE.md`, `~/.claude/CLAUDE.md`, and
    any `CLAUDE.md` in a directory above a changed file. Flag a violation only
    when you can quote both the rule and the line that breaks it. Cite the path.
    This project's rules bite hardest on: no `any` across trust boundaries,
    secrets never in the client bundle, both locales for every user-visible
    string, tokens instead of literal colours, and no Stripe call or locale
    logic on the public VAST path.

## Phase 2 — Verify

Dedup candidates pointing at the same mechanism, keeping the one with the most
concrete failure. Then judge each remaining candidate as exactly one of:

- **CONFIRMED** — you can name the inputs and the wrong output. Quote the line.
- **PLAUSIBLE** — the mechanism is real, the trigger is uncertain. Say what
  would settle it.
- **REFUTED** — the code does not say that, or it is guarded elsewhere. Quote
  the line that proves it.

Keep CONFIRMED and PLAUSIBLE. This is recall mode: do not drop on uncertainty.

**Verify against sources, not memory.** A finding about a standard, a schema, or
a third-party API is worth only as much as the citation behind it. Fetch the
spec or read the schema. This matters here more than in most repos — a VAST rule
built on a plausible-sounding secondary source produces a validator that invents
violations, which is worse than one that misses them.

## Phase 3 — Sweep

Re-read the diff once more as a fresh reviewer holding the verified list, looking
**only** for what is not on it. Do not re-confirm anything. The usual misses:
extracted code that dropped a guard, setup/teardown asymmetry in tests, a config
default quietly flipped, a predicate with a side effect.

## Output

Report through the `ReportFindings` tool in one call: at most 15 findings, most
severe first, each with `file`, `line`, `summary`, `short_summary` (≤60 chars,
the claim alone), `failure_scenario`, `category`, and `verdict`. Correctness
outranks cleanup when the cap forces a cut. Do not also print the findings as
prose, and do not build an artifact — the tool call is the report.

If findings are fixed later in the same session, call `ReportFindings` again
with the same list, each carrying an `outcome` of `fixed`, `no_change_needed`,
or `skipped`. Do this before any prose summary, or the findings stay marked
unresolved.

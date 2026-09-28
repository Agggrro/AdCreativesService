import test from "node:test";
import assert from "node:assert/strict";
import { GOAL_MAX_LENGTH, parsePostback, POSTBACK_PARAMS } from "./postback.ts";

/**
 * Run with `npm run test:postback`.
 *
 * Pins the postback parser (ADR-0023, goals ADR-0027): the trust boundary for
 * what a partner network's server sends `/pb`, and the whole of its policy. A
 * regression here is silent — the network sees a 200 or a 400, and the owner
 * sees a report that is off by a status, a factor of a thousand, or a goal.
 */

const CLICK = "0123456789abcdef01234567";

function parse(query: Record<string, string>) {
  return parsePostback((name) => (name in query ? query[name] : null));
}

test("a bare click id is an approved conversion with nothing else set", () => {
  const input = parse({ click_id: CLICK });
  assert.equal(input.error, null);
  assert.equal(input.clickId, CLICK);
  assert.equal(input.status, "approved");
  assert.equal(input.payout, null);
  assert.equal(input.currency, null);
  assert.equal(input.txid, "");
  assert.equal(input.goal, "");
});

test("the click id is required, and must look like one /r minted", () => {
  assert.equal(parse({}).error, "missing_click_id");
  assert.equal(parse({ click_id: "   " }).error, "missing_click_id");
  assert.equal(parse({ click_id: "{sub1}" }).error, "bad_click_id");
  assert.equal(parse({ click_id: "abc" }).error, "bad_click_id");
  // A network that upper-cases a sub-id still finds its click.
  assert.equal(parse({ click_id: CLICK.toUpperCase() }).clickId, CLICK);
});

test("statuses normalize through the alias table; an unknown word is refused", () => {
  const status = (value: string) => parse({ click_id: CLICK, status: value });
  assert.equal(status("Approved").status, "approved");
  assert.equal(status("1").status, "approved");
  assert.equal(status("lead").status, "pending");
  assert.equal(status("hold").status, "pending");
  assert.equal(status("trash").status, "rejected");
  assert.equal(status("-1").status, "rejected");
  assert.equal(status("maybe").error, "bad_status");
  assert.equal(status("constructor").error, "bad_status");
});

test("a macro the network did not expand is an error, never 'not sent'", () => {
  for (const name of ["status", "payout", "currency", "txid", "goal"]) {
    for (const value of [`{${name}}`, `%7B${name}%7D`, `[${name}]`]) {
      assert.equal(
        parse({ click_id: CLICK, [name]: value }).error,
        "unexpanded_macro",
        `${name}=${value}`,
      );
    }
  }
});

test("payout takes a decimal point or comma, and refuses the ambiguous 1,234", () => {
  const payout = (value: string) => parse({ click_id: CLICK, payout: value });
  assert.equal(payout("12.5").payout, 12.5);
  assert.equal(payout("12,5").payout, 12.5);
  assert.equal(payout("0").payout, 0);
  assert.equal(payout("1,234").error, "bad_payout");
  assert.equal(payout("ten").error, "bad_payout");
  assert.equal(payout("1e10").error, "bad_payout");
});

test("currency is three letters, upper-cased", () => {
  assert.equal(parse({ click_id: CLICK, currency: "usd" }).currency, "USD");
  assert.equal(parse({ click_id: CLICK, currency: "US" }).error, "bad_currency");
});

test("txid is bounded at 128", () => {
  assert.equal(parse({ click_id: CLICK, txid: "t".repeat(128) }).txid, "t".repeat(128));
  assert.equal(parse({ click_id: CLICK, txid: "t".repeat(129) }).error, "bad_txid");
});

test("a goal is kept as the network sent it, trimmed, case and script intact", () => {
  assert.equal(parse({ click_id: CLICK, goal: "dep" }).goal, "dep");
  assert.equal(parse({ click_id: CLICK, goal: "  Deposit " }).goal, "Deposit");
  assert.equal(parse({ click_id: CLICK, goal: "Регистрация" }).goal, "Регистрация");
  assert.equal(parse({ click_id: CLICK, goal: "2" }).goal, "2");
  // Sent empty is the same as not sent: a conversion with no goal.
  assert.equal(parse({ click_id: CLICK, goal: "" }).goal, "");
  assert.equal(parse({ click_id: CLICK, goal: "   " }).goal, "");
});

test("a goal longer than the column holds is refused, not truncated", () => {
  const longest = "g".repeat(GOAL_MAX_LENGTH);
  assert.equal(parse({ click_id: CLICK, goal: longest }).goal, longest);
  // Truncating would merge two goals that differ only past the limit into one
  // row, so the postback is refused and the owner reads why.
  const over = parse({ click_id: CLICK, goal: `${longest}x` });
  assert.equal(over.error, "bad_goal");
  assert.equal(over.goal, "");
});

test("NUL is removed before anything reads a value", () => {
  const input = parse({ click_id: CLICK, goal: "de\u0000p", txid: "a\u0000b" });
  assert.equal(input.error, null);
  assert.equal(input.goal, "dep");
  assert.equal(input.txid, "ab");
});

test("a failure carries no values, but the log still gets what was sent", () => {
  const input = parse({ click_id: CLICK, status: "maybe", goal: "dep" });
  assert.equal(input.error, "bad_status");
  assert.equal(input.clickId, null);
  assert.equal(input.goal, "");
  assert.deepEqual(input.params, { click_id: CLICK, status: "maybe", goal: "dep" });
});

test("the log's cut never splits an emoji into a lone surrogate", () => {
  // The 128th unit is the first half of the emoji. A lone half makes PostgREST
  // refuse the whole call as invalid JSON — a 503 the network retries forever.
  const input = parse({ click_id: CLICK, goal: `${"g".repeat(127)}😀` });
  assert.equal(input.error, "bad_goal");
  assert.equal(input.params.goal, "g".repeat(127));
  assert.ok(input.params.goal.isWellFormed());
  // A whole pair that fits is kept.
  const fits = parse({ click_id: CLICK, txid: `${"t".repeat(126)}😀` });
  assert.equal(fits.params.txid, `${"t".repeat(126)}😀`);
});

test("the log keeps exactly the parameters /pb reads, each cut to 128", () => {
  const input = parse({
    click_id: CLICK,
    goal: "x".repeat(300),
    key: "0123456789abcdef0123456789abcdef",
    sub2: "ignored",
  });
  assert.deepEqual(Object.keys(input.params).sort(), ["click_id", "goal"]);
  assert.equal(input.params.goal.length, 128);
  assert.ok(POSTBACK_PARAMS.includes("goal"));
});

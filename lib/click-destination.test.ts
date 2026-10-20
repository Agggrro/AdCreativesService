import test from "node:test";
import assert from "node:assert/strict";
import { appendForwardedParams, MAX_FORWARDED_PARAMS } from "./click-destination.ts";

/**
 * Run with `npm run test:click`.
 *
 * Pins what `/r` forwards from a click link to the owner's destination
 * (ADR-0031): the viewer's in-ad picks, appended, and nothing that could change
 * where the viewer goes or who a conversion is credited to.
 */

const LINK = "cid=00000000-0000-4000-8000-000000000001&f=clickThroughUrl&exp=1&sig=x";

function forward(destination: string, extra: string): string {
  return appendForwardedParams(destination, new URLSearchParams(`${LINK}&${extra}`));
}

test("picks are appended to the destination's own query", () => {
  assert.equal(
    forward("https://example.com/create/features?gender=female", "style=anime&ethnicity=elf"),
    "https://example.com/create/features?gender=female&style=anime&ethnicity=elf",
  );
});

test("a destination without a query gets one, before its fragment", () => {
  assert.equal(forward("https://example.com/a#top", "style=anime"), "https://example.com/a?style=anime#top");
  assert.equal(forward("https://example.com/a?", "style=anime"), "https://example.com/a?style=anime");
});

test("the link's own parameters are never forwarded, in any case", () => {
  assert.equal(appendForwardedParams("https://example.com/", new URLSearchParams(LINK)), "https://example.com/");
  assert.equal(forward("https://example.com/", "SIG=x&Cid=y&style=anime"), "https://example.com/?style=anime");
});

test("a parameter the destination has is never added again or overridden", () => {
  assert.equal(
    forward("https://example.com/?aff=123&clickid=abc", "aff=999&clickid=evil&style=anime"),
    "https://example.com/?aff=123&clickid=abc&style=anime",
  );
});

test("an owner's parameter is not reached through another case or an encoding", () => {
  assert.equal(
    forward("https://example.com/?aff=123&a%62=1", "AFF=999&Ab=2&style=anime"),
    "https://example.com/?aff=123&a%62=1&style=anime",
  );
});

test("a repeated key is forwarded once, the first", () => {
  assert.equal(forward("https://example.com/", "style=anime&style=real"), "https://example.com/?style=anime");
});

test("names and values outside the narrow pattern are dropped", () => {
  assert.equal(
    forward(
      "https://example.com/",
      [
        "1bad=x",
        "ok=has%20space",
        "url=https%3A%2F%2Fevil.example",
        "brace=%7Bclick_id%7D",
        "empty=",
        `long=${"a".repeat(65)}`,
        `${"k".repeat(33)}=v`,
        "host=evil.example",
        "kept=v-1_3",
      ].join("&"),
    ),
    "https://example.com/?kept=v-1_3",
  );
});

test("at most MAX_FORWARDED_PARAMS are forwarded", () => {
  const extra = Array.from({ length: MAX_FORWARDED_PARAMS + 3 }, (_, i) => `k${i}=v`).join("&");
  const out = new URL(forward("https://example.com/", extra));
  assert.equal([...out.searchParams.keys()].length, MAX_FORWARDED_PARAMS);
});

test("the owner's query is not re-serialized", () => {
  assert.equal(
    forward("https://example.com/?q=a%20b&t=x+y", "style=anime"),
    "https://example.com/?q=a%20b&t=x+y&style=anime",
  );
});

test("nothing to forward leaves the destination byte for byte", () => {
  assert.equal(forward("https://example.com/p?x=1#h", "sig=again"), "https://example.com/p?x=1#h");
});

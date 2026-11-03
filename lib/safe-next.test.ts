import test from "node:test";
import assert from "node:assert/strict";
import { safeNext, withNext } from "./safe-next.ts";

/**
 * `npm run test:auth`. The `next` guard on the sign-in and sign-up pages
 * (ADR-0036): a same-site path under an allow-listed prefix, or nothing — the
 * sign-in page must never become an open redirect.
 */

test("allow-listed paths pass, with their query and without a fragment", () => {
  assert.equal(safeNext("/tools/vast-generator?resume=1"), "/tools/vast-generator?resume=1");
  assert.equal(safeNext("/tools/vast-generator"), "/tools/vast-generator");
  assert.equal(safeNext("/dashboard"), "/dashboard");
  assert.equal(safeNext("/dashboard/creatives/11111111-2222-4333-8444-555555555555"), "/dashboard/creatives/11111111-2222-4333-8444-555555555555");
  assert.equal(safeNext("/tools/vast-generator#frag"), "/tools/vast-generator");
});

test("anything that leaves the site, or could be read as leaving it, is refused", () => {
  for (const raw of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/tools/vast-generator\n//evil.example",
    "/tools/vast-generator\t",
    " /dashboard",
    "/%2F%2Fevil.example",
  ]) {
    assert.equal(safeNext(raw), null, JSON.stringify(raw));
  }
});

test("paths outside the allow-list are refused, including look-alikes and traversal", () => {
  for (const raw of ["/login", "/", "/dashboardx", "/tools/vast-validator", "/tools/vast-generator/../../admin", "/api/dev/session"]) {
    assert.equal(safeNext(raw), null, raw);
  }
});

test("non-strings, empties and oversized values are refused", () => {
  assert.equal(safeNext(undefined), null);
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(""), null);
  assert.equal(safeNext(42), null);
  assert.equal(safeNext(`/dashboard?x=${"a".repeat(600)}`), null);
});

test("safeNext is idempotent: what it returns passes it again, even after percent-encoding grows it", () => {
  const typed = `/dashboard/${"я".repeat(100)}`;
  const once = safeNext(typed);
  // Each Cyrillic letter becomes six characters; past the cap, the result is refused rather than returned.
  assert.equal(once, null);
  const fine = safeNext("/tools/vast-generator?resume=1");
  assert.equal(safeNext(fine), fine);
});

test("withNext appends only a checked next, encoded", () => {
  assert.equal(withNext("/login", "/tools/vast-generator?resume=1"), "/login?next=%2Ftools%2Fvast-generator%3Fresume%3D1");
  assert.equal(withNext("/login?message=x", "/dashboard"), "/login?message=x&next=%2Fdashboard");
  assert.equal(withNext("/login", "https://evil.example/"), "/login");
  assert.equal(withNext("/login", null), "/login");
});

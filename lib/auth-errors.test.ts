import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_ERROR_CODES, authErrorCode, parseAuthErrorCode } from "./auth-errors.ts";
import { dictionaries } from "./i18n/dictionaries.ts";

/**
 * `npm run test:auth`. What the sign-in and sign-up pages say went wrong: a
 * code of ours, never Supabase's message and never the text of a link.
 */

test("Supabase's codes map to ours; anything else is the form's generic failure", () => {
  assert.equal(authErrorCode({ code: "invalid_credentials", status: 400 }, "signin"), "invalid_credentials");
  assert.equal(authErrorCode({ code: "email_not_confirmed" }, "signin"), "email_not_confirmed");
  assert.equal(authErrorCode({ code: "user_already_exists" }, "signup"), "user_exists");
  assert.equal(authErrorCode({ code: "email_exists" }, "signup"), "user_exists");
  assert.equal(authErrorCode({ code: "weak_password" }, "signup"), "weak_password");
  assert.equal(authErrorCode({ code: "over_email_send_rate_limit" }, "signup"), "rate_limited");
  assert.equal(authErrorCode({ code: undefined, status: 429 }, "signin"), "rate_limited");
  assert.equal(authErrorCode({ code: "unexpected_failure", status: 500 }, "signin"), "signin_failed");
  assert.equal(authErrorCode({ code: "toString" }, "signup"), "signup_failed", "no prototype key resolves");
  assert.equal(authErrorCode(null, "signup"), "signup_failed");
  // A code means something only on the form it can come from.
  assert.equal(authErrorCode({ code: "email_provider_disabled" }, "signup"), "signup_disabled");
  assert.equal(authErrorCode({ code: "email_provider_disabled" }, "signin"), "signin_failed");
  assert.equal(authErrorCode({ code: "user_already_exists" }, "signin"), "signin_failed");
});

test("each page accepts only its own form's codes, so a link cannot make sign-up look closed", () => {
  assert.equal(parseAuthErrorCode("signup_disabled", "signin"), "signin_failed");
  assert.equal(parseAuthErrorCode("invalid_credentials", "signup"), "signup_failed");
  assert.equal(parseAuthErrorCode("rate_limited", "signin"), "rate_limited");
  assert.equal(parseAuthErrorCode("rate_limited", "signup"), "rate_limited");
});

test("a page reads back only our codes, and prints no text a link carried", () => {
  assert.equal(parseAuthErrorCode("invalid_credentials", "signin"), "invalid_credentials");
  assert.equal(parseAuthErrorCode("Your account is blocked, call +1 555 0100", "signin"), "signin_failed");
  assert.equal(parseAuthErrorCode(["invalid_credentials"], "signup"), "signup_failed");
  assert.equal(parseAuthErrorCode(undefined, "signin"), null);
  assert.equal(parseAuthErrorCode("", "signin"), null);
});

test("every code has a sentence in both locales", () => {
  for (const locale of ["ru", "en"] as const) {
    for (const code of AUTH_ERROR_CODES) {
      assert.ok(dictionaries[locale].auth.errors[code]?.trim(), `${locale}: ${code}`);
    }
  }
});

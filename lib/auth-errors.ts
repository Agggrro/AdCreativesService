/**
 * What the sign-in and sign-up pages may say went wrong — as a code of ours,
 * which is all the `?error=` parameter carries.
 *
 * It used to carry Supabase's own `error.message`, and the page printed it:
 * English to a Russian visitor (design-system.md §10), and, since anyone can
 * write a link, any sentence anyone liked inside our sign-in page's alarm
 * notice ("Your account is blocked, call …"). Now the action translates
 * Supabase's machine `code` into one of these, the page reads it back through
 * `parseAuthErrorCode`, and the sentence comes from the dictionary. Each form
 * accepts only the codes it can produce, so a link cannot make sign-up look
 * closed; anything else reads as that form's generic failure, and the text of
 * the query string is never shown.
 *
 * Pure: the actions and both pages share it, and `npm run test:auth` pins it.
 */
export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "rate_limited",
  "user_exists",
  "weak_password",
  "email_invalid",
  "email_not_authorized",
  "signup_disabled",
  "signin_failed",
  "signup_failed",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
export type AuthForm = "signin" | "signup";

/** The codes each form can produce; its last entry is its generic failure. */
const FORM_CODES: Record<AuthForm, readonly AuthErrorCode[]> = {
  signin: ["invalid_credentials", "email_not_confirmed", "rate_limited", "signin_failed"],
  signup: [
    "user_exists",
    "weak_password",
    "email_invalid",
    "email_not_authorized",
    "signup_disabled",
    "rate_limited",
    "signup_failed",
  ],
};

const GENERIC: Record<AuthForm, AuthErrorCode> = { signin: "signin_failed", signup: "signup_failed" };

/**
 * Supabase's codes (`@supabase/auth-js` `ErrorCode`) that each of ours stands
 * for. A code means something only on the form it can come from:
 * `email_provider_disabled` on a password sign-in is "email logins are off",
 * not "sign-up is closed", so it falls to the sign-in form's generic failure.
 */
const FROM_SUPABASE: Record<string, AuthErrorCode> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  user_already_exists: "user_exists",
  email_exists: "user_exists",
  weak_password: "weak_password",
  email_address_invalid: "email_invalid",
  email_address_not_authorized: "email_not_authorized",
  signup_disabled: "signup_disabled",
  email_provider_disabled: "signup_disabled",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  over_sms_send_rate_limit: "rate_limited",
};

/** The code for a Supabase auth error on `form`; anything else is that form's generic failure. */
export function authErrorCode(error: { code?: string; status?: number } | null | undefined, form: AuthForm): AuthErrorCode {
  const mapped =
    error?.code && Object.hasOwn(FROM_SUPABASE, error.code)
      ? FROM_SUPABASE[error.code]
      : error?.status === 429
        ? "rate_limited"
        : undefined;
  return mapped && FORM_CODES[form].includes(mapped) ? mapped : GENERIC[form];
}

/**
 * The `?error=` value a page was given, read back as one of its own form's
 * codes — that form's generic failure for anything else, and null when there
 * was none.
 */
export function parseAuthErrorCode(raw: unknown, form: AuthForm): AuthErrorCode | null {
  if (raw === undefined || raw === null || raw === "") return null;
  return typeof raw === "string" && (FORM_CODES[form] as readonly string[]).includes(raw)
    ? (raw as AuthErrorCode)
    : GENERIC[form];
}

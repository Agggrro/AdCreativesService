# Security

> Status: design phase. Run `/security-review` before pushing anything touching
> payments, auth, or the public VAST endpoint.

## Trust boundaries

| Boundary | Who's on the other side | Posture |
| --- | --- | --- |
| Dashboard | Authenticated users | Supabase Auth + RLS; users touch only their own data |
| `GET /api/vast` | The open internet / ad players | Public, unauthenticated, **fail closed** |
| `POST /api/vast/preview` | Signed-in dashboard users | Authenticated (no subscription check); never touches Stripe or the entitlement gate |
| `GET /api/vast/preview/[token]` | Third-party player SDKs (Google IMA, Fluid Player), fetched with no session | Public by necessity; self-authorizing via HMAC signature + 120s expiry, **fail closed** like `/api/vast` |
| `POST /api/stripe/webhook` | Stripe | Signature-verified; treat unsigned/invalid as hostile |
| Creative runtime assets | Player iframes on third-party pages | Signed, short-TTL, domain/referer allow-listed |
| `GET /api/track` | Player beacons, fired from a VAST doc anyone who has the tag could have fetched | Public by necessity; each beacon URL is HMAC-signed with a 1-hour expiry at VAST-build time — an unsigned or stale hit is silently dropped, same as an unentitled `creative_id` |
| UI language cookie (`adinteract_locale`) | Anyone with a browser — it is user-writable and carries no authority | Treated as untrusted input: validated against the `ru`/`en` allow-list on read and falls back to the default; it only selects a copy dictionary, never gates data, and never reaches the serving path |

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, full DB power, bypasses RLS. Must
  never reach the client bundle or any `NEXT_PUBLIC_*` var. Used only on the serving
  read and webhook write paths.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — server-only.
- `PREVIEW_TOKEN_SECRET` — server-only. Signs the short-TTL live-preview tokens
  (`lib/vast/preview-token.ts`). Independent of the Supabase/Stripe secrets above —
  never derive one from another.
- `TRACK_TOKEN_SECRET` — server-only, optional. Signs tracking-beacon URLs
  (`lib/track-token.ts`). Until it's set, beacon signing derives a key from
  `PREVIEW_TOKEN_SECRET` via HMAC domain separation (a label-keyed KDF, not
  secret reuse) so this shipped without a required new Vercel variable — set a
  dedicated value (`openssl rand -base64 32`) to fully separate the two trust
  domains.
- Public/anon Supabase key is fine client-side **because RLS is enforced** — RLS is
  therefore load-bearing for the dashboard and must be correct (audit with the
  `supabase-rls-auditor` subagent).

## Public VAST endpoint hardening

- **Fail closed:** any error, missing data, or ambiguity → empty/fallback VAST, never
  the payload.
- **Input validation:** validate `creative_id` shape before any DB call; reject junk
  early. Treat all query params/macros as untrusted.
- **No RLS reliance:** there is no session here. Use a service-role client scoped to a
  single narrow read of the denormalized serving record — nothing else.
- **No Stripe calls / no heavy joins** on this path (perf + blast radius).
- **Rate limiting / abuse:** plan for per-IP / per-creative limits and cache to absorb
  spikes (post-MVP hardening, but design for it). Applies to `POST /api/vast/preview`
  too: it requires a session (a materially higher bar than the fully public
  `/api/vast`) but has no subscription check and no rate limit today, so a scripted
  client could re-mint indefinitely against any published template.

## Tracking beacon hardening (`/api/track`)

- **Signed, not just shape-validated.** A `creative_id` is visible in plain sight
  in the VAST tag URL a customer pastes into their DSP, so validating its UUID
  shape alone does not stop a third party from hitting `/api/track?cid=<their
  tag's id>&e=impression` directly, inflating a competitor's or a customer's own
  funnel numbers — numbers that now feed a customer-facing dashboard
  (`public.get_creative_overview`). Every beacon URL the VAST builder emits
  carries an HMAC signature over `(creative_id, event, exp)`
  (`lib/track-token.ts`); the route drops any hit whose signature doesn't
  verify or whose `exp` has passed.
- **Expiry is generous on purpose (1 hour, not the preview token's 120s):** a
  beacon must stay valid for the full lifetime of one ad play — buffering, a
  configurable `durationSeconds`, a slow connection — not just until the VAST
  document is fetched.
- **Still fail silent, not fail loud:** an invalid signature drops the beacon
  with the same 204 as a valid one processed successfully. This endpoint has
  always been fire-and-forget for the player; a signature failure must not
  become a visible error a player surfaces to a viewer.
- **Known residual gap:** signing stops *forgery* (minting a beacon without
  ever having seen a real one), not *replay* of a beacon someone actually
  captured from a live VAST response. Rate limiting per `(creative_id, event)`
  is the next layer if replay abuse is observed; not implemented yet.

## Preview endpoint hardening (`/api/vast/preview*`)

- **Fail closed identically to `/api/vast`:** any bad/expired/tampered/malformed
  token → `emptyVast()`, HTTP 200, never a differentiated error (an attacker
  shouldn't be able to distinguish "bad signature" from "expired" from "unknown
  template").
- **Constant-time signature check:** `crypto.timingSafeEqual`, not `===`.
- **No cross-user config leakage by construction:** the mint endpoint takes the
  config directly in the request body (the caller's own in-memory form state) and
  never accepts or looks up a `creative_id` — it cannot become a side-channel onto
  another user's saved creative.
- **Input validation even though the caller is authenticated:** POSTed field
  values are run through `parseConfigSchema` + `coerceFieldValue` (the same
  functions `createCreative` uses) before being embedded in the token, and the
  serialized token payload is size-capped.
- **No new escaping obligation:** `<AdParameters>` is still wrapped in `cdata()`
  over the whole JSON string, same as the real endpoint.
- **Data minimization:** the token carries only what `resolveInteractiveUrl`/
  `buildInlineVast` need (template id, format, config, runtime key, a random
  preview id, expiry) — nothing tying it to the minting user.

## Creative payload protection (see ADR-0003)

We provide **access control, not secrecy of client code**. Layers: dynamic VAST
kill-switch, short-TTL signed URLs, domain/referer allow-lists, server-side config
injection, obfuscation. We never claim creative JS is unrecoverable.

## RLS scope

RLS protects the authenticated dashboard path only. The serving path deliberately
bypasses it via a scoped service-role read. Both facts must stay true together: if RLS
weakens, the dashboard leaks; if the service-role read widens beyond the serving
record, the blast radius of the public path grows. Keep both tight.

## Pre-push checklist (security-sensitive changes)

- [ ] No secret in client bundle / `NEXT_PUBLIC_*`.
- [ ] Webhook verifies signature against raw body.
- [ ] VAST path validates input and fails closed.
- [ ] RLS policies cover new tables/columns (or explicit, documented exception).
- [ ] `/security-review` run and findings addressed.

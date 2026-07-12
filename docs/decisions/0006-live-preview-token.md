# 0006. Stateless signed tokens for the live "Launch Ad" preview

- Status: Accepted
- Date: 2026-07-13

## Context

The dashboard configurator needed a "player + Launch Ad" panel that runs a
template with whatever is **currently typed into the form** — before the
creative is saved — and, per the user's request, in more than just our own
sandbox harness: Google IMA SDK and Video.js + `videojs-ima` as well, so a
buyer can validate the same VAST tag in the players the market actually uses.

Both third-party SDKs want a fetchable ad tag URL (`adTagUrl`). That URL has to
resolve to a real VAST document built from config that was never saved to the
`creatives` table — the whole point is to preview before saving. Something has
to hold that config between the mint request and the moment a player fetches
the tag.

Two alternatives were rejected:

- **A server-side cache (in-memory `Map` or Redis) keyed by a random id.** The
  stack has no Redis/KV — it's built entirely on free tiers
  ([ADR-0004](0004-mvp-on-free-tiers.md)) — and Vercel serverless functions
  don't share memory across invocations, so an in-memory map would work in
  `next dev` and then flake intermittently in production the moment two
  requests land on different instances.
- **Routing the Sandbox tab through the same VAST-XML round trip as the
  third-party players.** Our own harness has never needed VAST XML — it just
  wants a unit script URL and an `AdParameters`-shaped object, both of which the
  mint endpoint already resolves once, server-side. Making Sandbox fetch VAST
  XML and parse it back out with `DOMParser` would be pure overhead with a new
  failure mode, for a tab that isn't standing in for a VAST-compliant player
  (IMA already covers that job).

## Decision

- `POST /api/vast/preview` (authenticated, no subscription check) mints a
  **stateless, HMAC-SHA256-signed, 120-second-TTL token** encoding everything
  `resolveInteractiveUrl()`/`buildInlineVast()` need — template id, format,
  validated config, the template's `runtime_keys`, a random preview id, and an
  expiry — and returns both a `previewTagUrl` (for IMA/Video.js's `adTagUrl`)
  and a pre-resolved `{ scriptUrl, adParameters }` pair (for the Sandbox tab,
  no XML involved). No DB row is read or written beyond the template lookup.
- `GET /api/vast/preview/[token]` is public by necessity (the player SDKs fetch
  it directly, with no session) but self-authorizing: it verifies the token's
  signature and expiry instead of checking subscription entitlement, then
  calls `buildInlineVast()` directly — not `generateVast()`, which gates on
  `should_serve`. Any invalid/expired/tampered token fails closed to
  `emptyVast()`, exactly like `/api/vast` does for an unentitled `creative_id`.
- The TTL (120s) matches the existing signed-Storage-URL convention
  (`lib/storage.ts`'s `SIGNED_URL_TTL_SECONDS`, [ADR-0003](0003-access-control-over-code-hiding.md))
  rather than introducing a new expiry philosophy.

## Consequences

- No new infrastructure: no Redis, no new table, no RLS change.
- The preview surface is architecturally separate from `/api/vast` — different
  auth model (session-minted vs. fully public), different cache policy
  (`no-store` vs. 60s CDN cache), different gate (HMAC vs. subscription
  entitlement) — so it cannot weaken the real endpoint's fail-closed guarantee
  or its "no Stripe on this path" rule.
- `buildInlineVast()` gained a `rawConfig` field on `VastBuildContext` so the
  full `config_json` (not just the narrow `CreativeConfig` subset) reaches
  `<AdParameters>`. This is shared by both `/api/vast` and the preview path —
  it also fixed a pre-existing bug where custom per-template fields were
  silently dropped from real production `<AdParameters>`.
- A preview token is a bearer credential for a specific, low-value, 120-second
  window (the config a signed-in user typed into their own form) — if one
  leaks, the blast radius is one ephemeral, non-persisted ad render, not
  another user's data.

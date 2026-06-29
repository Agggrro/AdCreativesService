# 0003. Access control over creative-code secrecy

- Status: Accepted
- Date: 2026-06-29

## Context

The original brief stated that "the raw JavaScript/HTML of the creatives is never
directly accessible to the user." This is technically false and dangerous to promise:
a SIMID/VPAID creative **executes JavaScript on the client** (browser/player), so the
payload is delivered to the client and is inspectable via dev tools. Marketing or
architecting around true secrecy would set a promise we cannot keep.

## Decision

Reframe the protection guarantee as **access control + raising the cost of copying**,
not secrecy of client code. Concretely:

1. **Dynamic VAST kill-switch** — the primary lever. No active subscription →
   empty/fallback VAST; payload is never served.
2. **Short-TTL signed URLs** for the SIMID iframe / VPAID unit.
3. **Domain / referer allow-listing** so the unit only runs where authorized.
4. **Server-side config injection** — product data/links injected at serve time, not
   baked into static assets.
5. **Minification / obfuscation** of the runtime.

We **never** claim the creative code is impossible to recover.

## Consequences

- Honest, defensible positioning; the subscription gate is the real, working
  protection and the basis of monetization.
- Engineering effort focuses on the serving gate and URL signing rather than futile
  attempts at client-side secrecy.
- Product/marketing copy must reflect this; "code never accessible" language is
  prohibited. Recorded as a rule in [CLAUDE.md](../../CLAUDE.md) and
  [adtech-standards.md](../adtech-standards.md).

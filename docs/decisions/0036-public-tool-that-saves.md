# 0036. A public tool that saves: sign in at the end, the draft kept in the browser

- Status: Accepted
- Date: 2026-11-03
- Amends: [0013](0013-public-free-tools-section.md) (the generator reads a session, and saves)

## Context

[ADR-0013](0013-public-free-tools-section.md) made `/tools` public, unauthenticated and
stateless: no session read, nothing stored, a report that lives in the page's state. It
was written for the validator, and it planned the generator as the same kind of page.

The generator that shipped ([ADR-0035](0035-vast-video-creatives.md)) is not that page.
Its result is a creative in Мои креативы and a dynamic tag, which needs an account — and
an upload needs one before that. The owner chose to keep the page public anyway: a
visitor who lands from a search configures everything, sees the XML and plays it, and is
asked for an account only to create it. That is the acquisition case ADR-0013 was about,
with an ending a placeholder could not have.

## Decision

**The page stays public and indexed; saving needs a session.** The server component reads
the user only to choose the form's ending — *Create creative*, or *Sign in and create* —
and the save actions re-derive the user from the session themselves. A signed-out
visitor can link a video but not upload one: the upload's ticket is a server action that
checks the session, so the upload control becomes the way to sign in.

**The preview stores nothing and signs nothing.** The XML is built in the browser by the
same validator and builder the ad path runs, with inert beacon placeholders; checking and
playing it goes through the validator's existing public route and isolated well. No new
public endpoint, and no beacon key anywhere near a browser.

**The draft survives the sign-in in the visitor's own browser.** *Sign in and create* — and
the upload control's sign-in — write the draft to `localStorage` and go to
`/login?next=/tools/vast-generator?resume=1`. The draft comes back when the visitor returns
through `?resume=1` — the sign-in's own return, or the dashboard's link to the generator —
and a plain visit to the public page starts clean. It is read through
`useSyncExternalStore` so the server's render and the hydrating one agree, every field is
checked on the way back in (storage is written by older forms too), and after 24 hours, or
once it no longer reads as a draft, it is removed. It is a per-viewer convenience in the sense the rest of the app
uses the word: wrapped in `try/catch`, and the form works without it. Only URLs are kept,
never files.

**`next` is carried through sign-in, sign-up and the confirmation email, and checked at
every step.** `lib/safe-next.ts` admits only a same-site path under an allow-listed prefix
(`/tools/vast-generator`, `/dashboard`): nothing absolute, nothing protocol-relative, no
backslash, no whitespace or control character. The login and signup pages carry it in a
hidden field and in their cross-links; the actions re-check it; the email-confirmation
callback re-checks it again. Without that, a link to `/login?next=…` would make our own
sign-in page an open redirect.

## Consequences

- **ADR-0013's "reads no database and holds no session" is no longer true of `/tools` as
  a whole.** It still holds for the validator. The generator reads the session, and its
  save actions write `creatives` like the configurator's do.
- **The Supabase redirect allow-list needs `https://creosmith.com/auth/callback**`.** The
  confirmation link now carries `?next=…`, and Supabase follows only a redirect its list
  matches. This is the owner's step in the Supabase dashboard. Until it is done — unless
  the project's Site URL is on creosmith.com, whose any path Supabase accepts — the
  confirmation goes to the Site URL instead: the address is confirmed, but the visitor
  arrives signed out and signs in by hand. The draft is still in the browser, and the
  dashboard's *Create VAST video* picks it up.
- **A draft left behind expires rather than lingering.** A visitor who never returns
  leaves a draft in their own browser for at most a day.
- `next` is a second allow-list to maintain: a new place to return to must be added to
  `lib/safe-next.ts`, and `npm run test:auth` pins what is refused.

# Guest rooms (R8 · S3a)

Journey: a friend who did the first run opens the app. They see their own
name, Today with WORKOUT and their language, Body, Languages, Calendar,
Projects, Goals, Backlog, Notes, Review — and nothing that is Artem's.
His picks, 27 Oct: "guest = did the first run, Today LANGS + WORKOUT, Body
without your photo, delete only for guests", then "go on the guest mockup"
(`design/firstrun-mockup/guest.html`).

## What a guest does not get

- Finances in the sidebar and in the phone's More (`forGuest` in
  `src/lib/nav.ts`).
- LEVEL on Today (his age, `src/lib/year.ts`) and its separator.
- THIS WEEK chips and presses for shake, post, commits; THIS MONTH tiles
  shake, post, commits, worth. With NONE, no LANGS and no PT stand-in.
- His photo on Body (`BodyHero`).
- Spent and worth on Review (`FinancesTile`).

## Who is a guest

`profiles.mine.guest`: a profile row exists and is not `asOwner`. Artem has
no profile. The browser tests' user gets an `asOwner` profile from
`e2e.reset`, so every older test still sees Artem's app.

## Scenarios

- G1 guest with English → no Finances link, no LEVEL, chips WORKOUT and
  ENG, tiles LANGS and WORKOUT, Body without the photo, Review without
  spent and worth.
- G2 guest with NONE → WORKOUT only.
- G3 Artem (the stand-in) → Finances, LEVEL and all six.
- `profiles.test`: guest after the first run; the stand-in is not a guest.

## Out of scope

Delete account (S3b). /finances by URL still opens for a guest and shows
their own empty Finances — every read is owner-scoped.

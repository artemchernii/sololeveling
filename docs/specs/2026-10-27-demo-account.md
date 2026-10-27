# Demo account (after R8)

Journey: Artem is with a friend and wants to show the app. He opens
workers.dev on his phone, signs out, signs in with his other Gmail, and
hands the phone over. The friend swipes through Today, Body, Languages,
Calendar, Review and Finances — every room full, charts moving — and sees
none of his real accounts or money. Pressing things does nothing harmful.
How often: a few times a month, a few minutes each. His words, 27 Oct:
picked "a demo account on the real app" over a guest sign-up (empty, no
Finances) and a laptop-only demo; asked whether the test user would do or
his other Gmail.

Mockup: `design/firstrun-mockup/demo.html` (serve the repo root, launch
"firstrun" :3951).

## Which account — his other Gmail, not the e2e test user

- The test user's password sits in `.env.e2e` in a public repo's
  neighbourhood, and every e2e run signs in as it.
- The tests reset its data (`e2e.reset`), and it carries `asOwner: true`
  on the test backend — it is Artem's stand-in there, the opposite of a
  demo.
- His other Gmail is a normal Clerk sign-up on workers.dev (same Clerk dev
  instance), so nothing new to set up.

## A third kind of person: demo

Today (`convex/profiles.ts`): owner = has principles or an `asOwner`
profile; everyone else is a guest. Add:

- `profiles.demo: v.optional(v.boolean())`, written **only** by
  `demo:make {ownerId}`, an internal mutation run with the deploy key
  (`npx convex run --prod demo:make`). No client path sets it.
- `isOwner()` returns false for a demo profile before it looks at
  principles. `demo.refill` never writes principles (that would make it
  the owner).
- `profiles.mine` returns `kind: 'owner' | 'guest' | 'demo'` (keeps
  `guest` for old callers).

What demo sees, beside the other two:

| | owner | guest | demo |
|---|---|---|---|
| Finances, LEVEL, all six tiles, Body photo slot, Review spent/worth | ✓ | — | ✓ (fake) |
| Writes (log, tick, capture, upload, connect bank, 212 key, push) | ✓ | ✓ | refused |
| Money AI (read, ASK, statements) | ✓ $2 | — | refused |
| Other AI (week read, Vault sheets) | ✓ | $0.50 pot | refused |
| Market data, news, earnings (fetched on open, no model) | ✓ | — | ✓ real |
| Badge `DEMO · FAKE DATA` on every screen | — | — | ✓ |
| Delete account | — | ✓ | — |

## Read-only, enforced on the server

- `convex/write.ts` exports `mutation` and `action` built with
  convex-helpers' `customMutation` / `customAction`: after
  `requireUser`, a demo profile throws `DEMO_READ_ONLY`. Every public
  write file imports from it instead of `_generated/server` (45 files,
  one line each); a lint rule (`no-restricted-imports`) keeps it so.
- Internal functions (crons, `demo.refill`) are unaffected.
- Open to demo (built on `openMutation` or left on the raw builder,
  each with its reason): `demo.freshen`, `areas.ensure` (idempotent),
  and the on-open refreshes of stored outside readings — `prices.refresh`,
  `bars.ask`, `fundamentals.refresh`, `sector.ask/askAll`. Actions that
  only fetch (market, news, Insights MINE/MARKET/CLOSE, ticker search,
  `priceYears.read`) stay open; bank, Trading 212 and the two Ask actions
  are refused.
- Client: every write path already shows "saving…"; on
  `DEMO_READ_ONLY` it shows the badge `DEMO · NOT SAVED` (amber, pulse)
  and closes. One handler in the shared write hook, not per screen.
- AI buttons (READ, ASK, WEEK READ, sheet) show `DEMO · NO AI` instead of
  pressing.

## Filling it

`demo.make {ownerId}` marks the profile and schedules `demo.refill`,
which wipes the account in batches (`wipeSome`, shared with delete
account) and then writes the story and writes a fixed
story, every date as an offset from `now`:

- Areas: Portuguese, English, Body; ~90 days of logs (workouts, language
  sessions, shakes, posts, spends, weights) with gaps, so tiles and
  month compares show ▲ and ▼.
- 3 goals, 2 projects with tasks (three picked for today, one ticked),
  a week of calendar events, 5 notes.
- Finances: 3 accounts (bank, card, broker) with made-up balances; ~120
  spends over 90 days with recurring bills; 6 positions in real tickers
  (e.g. VWCE, AAPL, MSFT, ASML, GLD, BTC) with fake buy history.
  No made-up prices: the fill asks `market.readAll` for the account's
  tickers, so every price is a real close — real prices, made-up shares.
  A position's older years arrive when its page is opened, as for Artem.
- No principles, no bank links, no GitHub link, no push subscription,
  no files.

The story is one file, `convex/fake/story.ts`, written in the shapes the
e2e seeds use. The e2e seeds were not lifted into it: each sets up one
test's corner case, and none is a whole life; moving them would have
touched every e2e spec for no screen.

**Stays fresh**: `profiles.demoFilledOn` (Lisbon day). On open the app
calls `demo.freshen`; if the day is older than today it schedules
`demo.refill` with `now`. So "last month" always means last month, and any
day nobody opens it costs nothing.

## Rule changes — his words needed

1. **"Nothing is seeded"** gets an exception: fake data may live on the
   real app in one account only, marked `demo` by the deploy key. What it
   changes for him: his own account is untouched; a second login shows a
   full app.
2. **"Reality over gamification"**: the demo's numbers are made up, so
   every screen of that account carries `DEMO · FAKE DATA` in the top bar
   (and the Today greeting reads `DEMO`). What he sees: that badge, on
   that account only; his own screens never show it.

## Cost

A refill writes ~3k rows once per day it is opened; a friend walking
every room reads an estimated 2–5 MB — about a tenth of the 33 MB/day
free-plan share. Measured on the e2e backend before it ships. The nightly
price job reads 6 more tickers (external, free).

## Scenarios

- D1 demo opens Today → `DEMO · FAKE DATA` badge, greeting DEMO, six
  month tiles with values, three quests one ticked.
- D2 demo opens Finances → three accounts, six positions, worth chart;
  no bank-connect or 212-key button pressable.
- D3 demo ticks a quest → "saving…" → `DEMO · NOT SAVED` → closes; the
  quest stays unticked.
- D4 demo presses ASK / READ → `DEMO · NO AI`, no action called.
- D5 `demo.refill` twice → same row counts (wipe then fill), no principles
  row; `isOwner` false.
- D6 demo filled yesterday → open → `demo.freshen` refills; dates move.
- D7 every public mutation refuses demo (convex-test loops over the
  write list), `demo.freshen` aside.
- D8 owner and guest unchanged (old e2e suite green).
- Phone width and dark theme on D1, D2.

## Out of scope

A public "try the demo" button; several demo accounts; editing the story
from the app.

## Questions

1. Read-only, or presses work and are wiped next day? **Read-only** —
   writes include bank connect, 212 key and push, which must be blocked
   anyway; fewer surprises.
2. Greeting: `DEMO` or a made-up name? **DEMO**.
3. LEVEL is his age (`src/lib/year.ts`) — show it on demo? **Yes**, it
   is a level, not money.

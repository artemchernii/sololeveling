# R6c — one table per broker account: files merge, never pile up

Artem, 27 Sep: "its very common that I gonna add more statements to same
account. And I dont want to overlap, I want to update data … networth pdf,
statements csv, and 2 screenshots … combine all sources and make clear
table." Mock approved: `design/treasury-mockup/holdings.html`.

## The rule

Every file is **evidence** about one account, trusted for what it knows:

- **Trades** (statement PDF, CSV) — dated buys and sells with a price. The
  ledger. A trade already stored (same ticker, side, shares, ±2 days) is
  skipped, so overlapping statements add nothing (as today).
- **Holdings** (screenshot, net-worth PDF) — shares seen on one day, and
  what was paid when the screen prints a % since buy. An **observation**,
  stored as it was seen. It never becomes a buy.
- **Cash** in any of them — a balance reading; the newest date wins (as
  today: `stateSnapshots` by time, trades after it move it).

What he holds is **worked out from both**, the same whatever order the
files came in (`src/lib/holdings.ts`, pure, tested):

- Latest observation S of a ticker in an account (on day D). Shares now =
  S's shares + trades after D. No observation: the trades' sum.
- Trades up to D against S's shares, within 1.5% (screenshot shares are
  often value ÷ price): **✓ match**; fewer → **⚠ gap** (the missing buys'
  statement has not come); more → **⚠ over** (a sell is missing).
- **What he paid**: the trades' cost when they explain every share; else
  what the screen printed (TR's %) plus trades after it; else **unknown**.
  Profit is shown only where paid is known — never worth − 0.
- A ticker left out of an account's newer screenshot is flagged **not
  seen since D**, not zeroed — two half-screenshots must not sell anything.

## What gets built

- `schema.ts` — `holdings` table (account, instrument, shares, paidEur?,
  sharesCalculated?, asOf, importId), owner-scoped indexes.
- `src/lib/holdings.ts` — `reconcile()` + tests: overlap, any order, gap,
  over, filled by a later statement, screen-printed cost, not seen.
- `convex/aggregate.ts` `readPositions` — built on `reconcile()`; each row
  gets `paid` (null = unknown), `status`, `seenAt`. `invest.heldShares`
  the same, so a typed sell checks against it.
- `convex/intake.ts` — `confirmHoldings` writes observations (a second one
  of the same ticker on the same day replaces the first) and the cash; no
  more "opening" buys, no 15 prices asked. `confirmTrades` stops refusing
  a statement's sell of shares only a screenshot knew.
- `convex/migrations.ts` — each old `opening` trade becomes an observation.
- `Intake.tsx` HoldingsReview — the mock: total / invested / free cash,
  "what you paid", one line per position, fix behind a tap, one save.
- `Portfolio.tsx` — paid "unknown", profit only when known, ✓ / ⚠ per row.
- `Logo.tsx` — a blank white logo falls back to letters.
- Tests in `convex/finances.test.ts` for each write and refusal.

## Done when

He drops the TR screenshot and saves it with nothing typed; drops a TR
statement and the same positions get what he paid, shares unchanged; drops
the statement again and nothing changes.

## Open (my default in brackets)

1. Which date is a screenshot's? [the day he drops it, unless the reader
   read a date on it]
2. A gap row: show it, or ask him to drop the missing statement? [show ⚠
   with one line of why; no nagging]

# Finances — truth first, then the mock (plan for 29 Sep)

Artem, 27 Sep night: "This page is still full of shit … the chart is piece
of shit. I said make it as in 3950 … How to make it not slop?" Walked
through Overview, Flow and Portfolio on his real data; this is what was
seen and the order to fix it in.

## Why it keeps coming out as slop

- Screens were checked for "it renders", not for "every number is true".
  A wrong number looks exactly like a right one.
- Built from words, not laid next to the approved mock (:3950) before
  calling it done.
- Too many rooms at once; each one half-finished.

**The rule from now on:** a screen is done when (1) every number on it is
traced to its rows on HIS data and written down, and (2) a screenshot of
it sits next to the mock's and he says it matches. One screen at a time.

## What is wrong on Overview (seen 27 Sep, his data)

Numbers that are not true:

1. **The chart's +€5,417 "in 3M" is not a gain.** Cash (€5,000) and TR
   cash (€1,042) were typed or read today; with no history before, the
   line jumps on the last day. An account joining looks like money made.
2. **"This month +€1,070 / in +€1,660" is inflated.** €1,640 of "in" is
   unsorted and includes his own money: "TRF. P/O ARTEM CHERNII +€400"
   (a transfer from himself) and "Withdraw +€20" (ATM cash into Cash).
3. **Invested is short.** Revolut's 22 positions are not imported, so
   Investments shows €4,087 (TR only) and an empty Revolut bar.

Things that read wrong:

4. The chart shows **free cash only**. The mock has TOTAL / FREE CASH /
   INVESTED and opens on 1Y. Investments are missing because no daily
   worth of positions is stored.
5. Two hero pills say the same thing ("this month" and "in · out").
6. Investments row "€4,087.23 · €1,042.46": the gold second number is
   TR's free cash, unlabeled — it reads like a profit.
7. TR's card sparkline is red and falling: cash spent on shares drawn
   as a loss.
8. Revolut "USD $0 ≈ €0" line is noise.

Flow (short look): moves between his accounts are shown nowhere (19
moves + 3 transfers stored); Bills is empty though 8 subscription rows
exist; each calendar row carries a native dropdown; gold everywhere,
badges misaligned. Insights room from the mock does not exist.

What is right: **Portfolio** — 15 TR positions, each "✓ statement and
Sep 27 screen agree", paid €3,796.40, +€290.83 (+7.7%).

## The plan — three sessions, in this order

**A. Truth pass (next session).** No new screens.

1. His own money is never income: a transfer from his own name, an ATM
   withdrawal into Cash, a top-up from his card → moves. Re-file what is
   stored. Test with his rows.
2. An account's line starts at its first reading — no jump; the day it
   joins is marked ("Cash added Sep 27"), not counted as gain.
3. Hero: one "this month" (in − out, moves excluded); TR cash labeled or
   gone from the Investments row; no zero-currency lines; broker
   sparkline shows total, not cash.
4. **Every account opens its rows.** Tapping an account card lists every
   row in it, newest first, moves included — nothing stored is invisible
   (27 Sep: "I can't see those movements anywhere which is very bad").
   Beside the rows, **the files read into it**: each statement or
   screenshot with its date, what it covered, what it added — and it
   opens again (27 Sep: "list of transactions for bank, and files that
   was read … now its just doesnt exist").
5. **Banks get the brokers' engine.** A balance is an observation, rows
   are the ledger: balance then + rows between = balance now. When it
   does not add up, say where: "€100 missing between Sep 3 and Sep 10 —
   a row was cut off the screenshot?", with one tap to add it on its
   day. A row typed on a day a balance already covers says so. (His ActivoBank case, 27 Sep: one row cut from a screenshot.)
   A row added on its real day never moves a later balance — only rows
   after the latest reading do (aggregate.movedSince), so the total
   stays true.
6. Done when: a written table of every Overview number → its rows, on
   his data, and he agrees with each.

**B. The chart as on :3950.** TOTAL / FREE CASH / INVESTED, 1M–1Y.
Needs a nightly job storing each ticker's close (source 4) and a
backfill of a year of closes for what he holds, so invested has a line
from the trades' dates. Done when: side by side with the mock, his data.

**C. Flow, journey first.** Journey → mock → build: moves as their own
"between your accounts" list, bills found from statements, calendar
without dropdowns, colour by state not gold everywhere.

Then: Revolut trading CSV (22 positions + history), and the parked
full-history import.

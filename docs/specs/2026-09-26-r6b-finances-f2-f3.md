# R6b-c F2–F4 — Balances, Bills, Investments (26 Sep)

Artem, 26 Sep, after F1: "picks, go — I hold US stocks and EU ETFs … make
it complex and cool. Not simple log spending and log salary." Built on the
same branch as F1 (`r6b-finances`, PR #70) because #70 is not merged yet
and PRs are never stacked.

## F2 Balances — his sheet, in the app

- `accounts` table: name, bank or broker, order, retired. Revolut, BPI,
  Activo, TR, 212 are typed in by him (nothing is seeded).
- A balance is a **state** (source 2): a `stateSnapshots` row keyed
  `balance:<accountId>`, typed like a weigh-in; latest wins, history kept.
- ~~Broker balances are the total the broker shows (pick 1).~~ **Changed
  26 Sep** ("we need to distinguish free cash and investments … in revolut
  i have some cash and broker account with investments"): a balance is an
  account's **free cash**, the money not in shares. Its investments are its
  positions at stored prices. One account can hold both, and the hero shows
  cash + investments with each half apart (`aggregate.worth`).
- The total is a **sum of latest balances** (pick 2): euros only, shown
  with the oldest "as of" in it. Written into PLAN.md §1 beside the sum
  rule.

## F3 Bills — recurring money

- `recurring` table: name, out or in, amount, category, account, monthly on
  a day (or the last day) or yearly on a date.
- The month as a strip of days with each bill on its day, today marked,
  and what is paid ticked. **One tap "paid" writes the expense log**
  (`logs.meta.recurringId`); nothing is logged by itself. Salary is an
  "in" item; its tap is "arrived".

## F4 Investments

- `instruments`: a ticker found by search (Yahoo Finance, which reads US
  symbols, Xetra ETFs and ISINs), never typed as a code.
- `trades`: account, instrument, shares, price per share in euros, date.
  A position is the sum of its trades' shares (sum rule, trade rows).
- `prices` and `fxRates` (source 4): a daily Convex cron stores each
  ticker's close from Yahoo Finance and USD→EUR from the ECB (Frankfurter).
  Stored, attributed, shown "as of". Value = shares × price × rate,
  composition of sanctioned values. **No gain/loss number** (held back).
- **Screenshot import:** a Trade Republic (or any broker) screenshot is
  read once by Claude Haiku 4.5 into rows; each row is matched to a ticker
  by search, and he confirms ticker, shares and price per row, then all at
  once. 20 imports per 30 days.

## Done when

His sheet's five accounts show with a total as of a time; the mortgage and
salary sit on this month's strip and one tap logs each; a TR screenshot
becomes confirmed positions with a value as of the last close.

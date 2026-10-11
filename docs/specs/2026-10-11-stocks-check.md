# Stocks file checked against the shares in the account

Journey: you drop Revolut's stocks file (the whole trading history) a few
times a year. Before apply you want to know one thing: do these buys and
sales give the shares the account really has? If they do you press apply.
If one company does not, that company is not saved until you choose, and
the rest is. Third of the reliability slices ordered on 11 Oct ("stocks
CSV checked against the shares held, per ticker, hold the one that does
not match the last broker screen").

Mockup: `design/treasury-mockup/stocks-check.html` ("go", 11 Oct, after
the words were redone — see the plain-words rule).

## What changes

- **Engine** (`src/lib/sharesCheck.ts`, pure): `historySums` — a company,
  bought and split less sold — kept on the intake when the file is read
  (`intakes.historyShares`); `sharesCheck` — each sum on the day of the
  last screenshot beside the shares that screenshot showed. A screen
  rounds, so 42.1 is 42.1034. Rows after the screenshot are saved and not
  compared. No screenshot, or one older than 120 days before the file's
  end: not checked.
- **Review** (`convex/sharesCheck.ts` → `batchReview.accounts[].shares`):
  the account's shares are its last screenshot's `holdings` rows, shares
  only (not coins, not gold).
- **Answers** (`intake.batchAnswer`, kind `sum`): `shares:<file>:<n>`
  save it anyway, `noshares:<file>:<n>` do not; one replaces the other;
  `on: false` takes it back.
- **Save** (`applyBatch` → `batches.heldShares` → `applyHistoryChunk`): a
  company that differs and was not answered "save" is not written; the
  file's note says which.
- **Screen**: `BulkSharesCheck.tsx` in `BulkAccountBlock`; `BulkReview`
  counts the question and names the company in the footer.

## Scenarios

- S1 same shares → "All 2 companies: same shares in the file and in the
  account.", "shares are right" → apply → saving → "Revolut updated",
  31 trades added. (e2e)
- S2 the file has fewer → "Microsoft: 5 shares in the file, 6 in the
  account.", the two boxes, "10 Microsoft not saved", footer "Microsoft
  not saved — 1 question open." → "save Microsoft anyway" → saving… →
  landed line → undo → "do not save Microsoft" → apply → 21 trades
  added. Phone width. (e2e)
- S3 no screenshot → "Not checked: no screenshot of the shares yet." and
  all of it is saved. (e2e in `history.spec`, convex-test)
- S4 the file has more; a company the account has none of; bought after
  the screenshot; a rounded screen; an old screenshot. (unit, convex-test)
- S5 the two answers replace each other; taken back. (convex-test)

## Data

- in the file: a sum of the file's own rows, one company — source 1's
  sum rule over trade rows, every sum opens its rows ("buys and sells").
- in the account: `holdings.shares` of the last screenshot — entity rows.
- Nothing is derived: no "difference", no percentage on screen.

## Out of scope

A short trades file (orders, a month's statement) — its sum is not the
whole position; a screenshot dropped in the same update as the file (the
check uses what is saved); a history read before this (no sums kept —
drop it again); euros in the boxes (he chose shares, 11 Oct); the price
paid for a company that was not saved.

# Balance from the rows

Journey: you drop a bank app screenshot to bring an account up to date. You
want one answer: "is my balance right now?" (11 Oct, on "4 movements added ·
no balance / −€1,114.85 / ✓ still the same": "what is this -1114 value? what
is no balance means? … why the fuck we show still the same button????").
Then you press done. A few times a week.

Mockup: `design/treasury-mockup/landed-balance.html` (you said "go").

## What changes

- **Reader** (`src/lib/intake.ts`, version 10): each row carries the balance
  printed beside it (`balance_after`, null when none).
- **Engine** (`src/lib/rowBalance.ts`, no model judgement): the newest
  row's printed balance is the file's balance. A row dated after a balance
  the app already holds, sitting in the printed trail at or before the
  point where the trail shows that same balance, is one that balance had
  already counted: "you already had", not added.
- **Save** (`convex/rowBalance.ts`, called from `intake.buildReview` and
  `writeTransactions`): the check is kept on the file (`intakes.landed`).
- **Card** (`Landed.tsx`, `LandedStrip.tsx`, `aggregate.landed`): two
  chips, then WAS · OUT · IN · NOW. No typing field, no "still the same"
  after a file that added rows, no row-by-row sum.

## Scenarios (e2e/balance.spec.ts, mocks in convex/e2eUpdate.ts)

- S1 your screenshot: ActivoBank at €153.21, a −700 top-up already in, the
  file's trail passes €153.21 → 2 new, 2 you already had, €90.35, "✓ as
  the screenshot shows", no "still the same".
- S2 the same file again → nothing to save, balance still €90.35.
- S3 20 rows → the same card, 18 new, 2 you already had.
- S4 no printed balance → "worked out from the rows", no button.
- S5 it does not add up → the bank's balance wins, one orange line.
- Every write: the apply button's "saving…" is asserted in `update.spec`
  ("a big file"); here: landed card, then done closes.
- A day with no year: unit-tested in #118 (`noYear.test.ts`); a canned
  reading skips the parser, so no e2e.

## Data

- NOW: state — the latest balance reading, or reading plus rows (as
  `aggregate.balances` already works it out).
- WAS: state — the balance the app held just before this file, kept on
  the file when it is saved.
- OUT, IN: log sums over this file's rows after WAS, one currency.
- N new: log count. N you already had: rows read minus rows written.

## Out of scope

Overview card and hero when no balance exists; the orange gap box in the
account sheet; "remove this file"; CSV rows' balance column per row; a file
with no printed balances cannot tell a row booked later (said in the PR).
A canned reading cannot catch a model misread — which is why the balance
moves from the model's judgement into code.

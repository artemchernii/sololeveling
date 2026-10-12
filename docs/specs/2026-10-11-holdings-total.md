# Broker screenshot checked against the total it prints

Journey: a few times a month you screenshot a broker's portfolio screen
(Revolut Invest, Trade Republic, Trading 212) and drop it to bring the
positions up to date. Before it is saved you want to know one thing: did
the app read the whole screen right? Your words (11 Oct): "positions times
price must reach the total the screenshot prints; if not, it is not saved
until I choose." If it adds up you press apply and nothing is asked. If it
does not, that account is not saved until you press one of two buttons;
another account in the same drop is saved as usual. Fourth of the
reliability slices, after check-before-saving and the stocks file check
("I cant run fixes and db fixes after every update to clean the mess").

Mockup: `design/treasury-mockup/holdings-total.html` ("go", 11 Oct).

## What is built today

- The reader (`src/lib/intake.ts` schema, `convex/ai/intake.ts`) returns,
  per position: name, `valueEur` (worth as printed), and where printed
  `shares`, `priceEur` (average price paid), `changePct`; and for the
  screen `cashEur` and `totalEur`. Everything is euros; a position has no
  currency of its own.
- `mergedHoldings` (convex/intake.ts) joins the screens of one account in
  a drop (two scrolls of one list, 212's list and its summary): one row
  per fund, the first cash found, the largest printed total.
- Saved by `confirmHoldings` / `applyBatch` → `writeHoldings`: shares per
  ticker, what was paid, the cash. The printed total is shown ("account
  total", "what the screen shows") and never compared with anything.
- Screens: the check step's account block (`BulkAccountBlock`: N
  positions · invested · cash · "every position known") and the positions
  screen (`HoldingsReview` with `HoldingsSummary`).

## What changes

- **Engine** (`src/lib/holdingsTotal.ts`, pure): the positions' printed
  worth, added, with and without the cash, beside the printed total.
  - adds up: the total equals the positions and the cash, or the
    positions alone (212's list prints a total without cash).
  - tolerance: one cent for each printed line (each is rounded to a cent),
    at least 5 cents. A total printed without cents is compared in whole
    euros. Nothing wider: both sides are printed on the same screen at the
    same moment, so no price moves between them.
  - not checked: no printed total; no position on the screen (212's
    summary alone); or a position with no printed worth (a file of
    ounces).
- **Review** (`convex/holdingsTotal.ts` →
  `batchReview.accounts[].holdings.total`): positions · cash · positions
  and cash · total on the screenshot, and the positions the sum is of. An
  account that does not add up is `held`, so `applyBatch` leaves it, as
  it does one whose balance does not add up.
- **Answers** (`intake.batchAnswer`, kind `sum`, as the two sister
  checks): `total:<accountId>` save it anyway, `nototal:<accountId>` do
  not; one replaces the other; `on: false` takes it back.
- **Save**: `confirmHoldings` (the positions screen) takes `kept` (which
  positions) and `anyway`, and refuses a screen that does not add up
  without it. Unticking a row there changes the sum, so the check is made
  again on what is kept.
- **Screen**: a new `HoldingsTotalCheck.tsx` (strip, the amber box, the
  answered line, the positions), in `BulkAccountBlock` and under
  `HoldingsSummary`; `BulkReview` does not count an answered "do not
  save" as an open question. `HoldingsReview.tsx` was 553 lines: its
  ticker search (`HoldingsTickerSearch.tsx`) and its "against what the
  account has" panel (`HoldingsChanges`) moved out.

## Scenarios

- S1 it adds up (20 positions and cash) → strip, "adds up", nothing asked
  → apply → saving… → "Trade Republic updated" → done. (e2e)
- S2 one position not read (19 of 20) → "Trade Republic: €24,727.26 in
  the positions and cash, €25,125.78 total on the screenshot.", the two
  boxes, tag "not saved", footer "Trade Republic not saved — 1 question
  open.", apply disabled → "save Trade Republic anyway" → saving… →
  answered line → undo → "do not save Trade Republic" → nothing written.
  Phone width. (e2e)
- S3 no printed total → "Not checked: no total on the screenshot." and it
  is saved. (e2e, convex-test)
- S4 two accounts, one right → apply saves Revolut (broker cash wording),
  Trade Republic not. (e2e)
- S5 the positions screen: the same box; untick and it is made again; the
  buttons read "do not save X" / "save X anyway"; a failed save says so;
  a slow save shows saving…. (e2e)
- S6 engine: total without cash; rounding inside the tolerance; a total
  without cents; more in the positions than the total; two scrolls of one
  list; a position with no worth. (unit)
- S7 refusals: `applyBatch` writes nothing for an unanswered account;
  `confirmHoldings` throws without the answer; the two answers replace
  each other; another owner. (convex-test; his Trading 212 drop of
  3 Oct — the list's €2,014 and the summary's €15,008 — is the real
  case: together they add up, one position of the six does not)

## Data

- positions, and positions and cash: a sum of the screenshot's own rows,
  one currency, every sum opens its rows (the tiles, "N positions"). The
  same reading as the sister checks ("new rows out", "in the file") —
  source 1's sum rule over a reading's rows, not over `logs`. It is
  already on screen as "invested".
- cash, total on the screenshot: the reading's stored values
  (`intakes.cashEur`, `intakes.totalEur`).
- Nothing is derived: no difference, no percentage.

## Out of scope

Shares against worth per position (a share count read wrong while its
worth is right) — see questions; a screen that prints dollars per row
under a euro total (the reader has no currency per position); adding a
second screenshot to an open review; the account's own UPDATE path beyond
`confirmHoldings`.

## Differences from the mockup

The block's header keeps "account total" (no "adds up" tag there — the
strip says it); after "do not save" the block keeps its amber edge and
tag; the answered line says "Positions stay as they are." (no date); the
"N positions" link is not added.

## Answered (11 Oct)

1. Shares × the stored price against each position's printed worth: yes,
   as the next slice, per company like the stocks file check.
2. One mount in `BulkAccountBlock.tsx` and one filter in `BulkReview.tsx`.

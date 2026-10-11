# The account sheet: is the balance right

Journey: you open an account from Overview, most days after an update, to
see one thing first: is this number right? If it is, you read the rows. If
it is not, you want to be told what is missing and, when the same money
sits in another account, to say "yes, that one" in one press. (11 Oct, on
the green "It adds up. Every balance is explained by the rows before it.
3 Oct €153.21 − 2 rows €62.86 = €90.35" and the orange "€500.63 came in
that no row shows … but 3 Oct read €1,543.09": "This green card is so
awful", "confusing slop". You said "go, fee as spending" to the mockup.)

Mockup: `design/treasury-mockup/sheet-check.html`.

## What changes

- **Right**: no card. Under the amount, a green tick: "rows match · since
  3 Oct" (the day of the first balance the rows are checked from).
- **Not right**: under the amount, "€500.63 has no row". One box: "€500.63
  came in with no row · 26 Sept – 3 Oct". No sum lines anywhere.
- **Found in another account** (`src/lib/gapMatch.ts`, pure): a transfer
  on another account, going the other way, of the gap's amount or up to a
  fee more (2% of it, at most €10), from 3 days before the earlier balance
  to 5 days after the later one, pointing at this account or at none, and
  with no other side yet. The smallest fee wins, then the nearest day.
  The box asks "Is it this transfer?", shows the row with its account's
  logo, and offers "same transfer, €4.57 fee" / "not this one".
- **Same transfer** (`gapMatch.sameTransfer`): writes this account's side
  (a move, paired to the other account's row, nothing added there) and the
  fee as an expense, category fees, both on the later balance's time, so
  that balance counts them. A strip says "Transfer from ActivoBank added.
  Fee €4.57." with undo (`gapMatch.undo`).
- **Nothing found, or "not this one"**: day chips, "add +€500.63 on 2
  Oct", "drop a file" — today's choices, without the arithmetic.
- **List**: the dashed line under the balance says "no row · +€500.63".
- **Deleting** the added side from the sheet never deletes the file's row
  in the other account (`logs.removeOwnedLog` unpairs instead).
- `OpenAccount.tsx` loses the check (new `AccountSheetCheck.tsx`).

## Scenarios (e2e/sheet-check.spec.ts, mock `e2eUpdate.sheetGap`)

Your Trade Republic as it stood on 11 Oct: €1,042.46 then €1,543.09 a week
later, no row between; ActivoBank's file row −€505.20 three days after.

- S1 found → "Is it this transfer?" with ActivoBank → Trade Republic,
  €505.20, "€4.57 less arrived — a fee" → "same transfer, €4.57 fee" →
  saving… → strip with undo, tick "rows match", two rows in the list →
  undo → the question is back.
- S2 "not this one" → day chips, "add +€500.63 on …".
- S3 nothing found (no row in ActivoBank) → day chips → pick a day → add
  → saving… → tick "rows match"; the dashed line is gone.
- S4 one balance only (Revolut on the bad day): the grey "one balance so
  far" note, no tick.
- Phone width: S1's box at 390px.
- convex-test: the rule on your real amounts; refusals (another user's
  account, a row that does not fit, a balance that is gone); undo; a
  deleted side leaves the file's row.

## Data

The gap is `aggregate.accountSheet`'s `missing` (state minus state minus a
log sum). The transfer's amount is a log row. The fee is that row minus
the gap, and becomes a logged expense on save.

## Out of scope

"Not this one" is remembered only while the sheet is open. The grey note
for an account with one balance, and the grey "was pending" line, stay.
Trade Republic rows that pair to Revolut through the card tail (its own
fix) are not offered here: a row with another side is never a match.

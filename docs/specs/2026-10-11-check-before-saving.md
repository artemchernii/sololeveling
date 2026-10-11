# Check before saving

Journey: you drop a bank file to bring an account up to date, a few times a
week. Before you press apply you want to know one thing: will the balance
be right, and will anything be written twice? (11 Oct, after one ActivoBank
screenshot wrote duplicate rows three times: "we need to make these reading
more reliable. I cant run fixes and db fixes after every update to clean
the mess." 3 Oct: "very hard to always update and not overwrite or
duplicate existing state. This is main thing.") If it adds up you press
apply. If it does not, nothing of that account is written until you choose.

Mockup: `design/treasury-mockup/check-sum.html`.

## What changes

- **Engine** (`src/lib/fileCheck.ts`, pure): the balance the account holds,
  plus the rows the file calls new, against the balance the file prints.
  Money the earlier balance showed as pending (the pending rows of the
  file that balance came from) explains a difference: the rows that make
  it up are saved and not summed. Otherwise the difference names the row
  that explains it — one new row of exactly that amount, and a row you
  have of the same amount within a week.
- **Review** (`intake.gatherBatch` → `batchReview.accounts[].check`):
  you had · new rows out · new rows in · the file says. An account that
  does not add up is held: `applyBatch` skips it until you answer.
- **Answers** (`intake.batchAnswer`): leave the named row out
  (`skip:<intakeId>:<index>` in `batches.dismissed`), or save it all and
  let the file's balance win (`sum:<accountId>`); each can be undone.
- **Save** (`rowBalance.landedCheck`): the same engine, so a row that was
  pending is not reported as "came in that no row shows".
- **Screen**: `BulkAccountBlock` (strip and the orange box in a new
  `BulkSumCheck.tsx`), `BulkReview` (footer words, apply count).

## Scenarios (e2e/check.spec.ts, mocks in convex/e2eUpdate.ts)

- S1 your screenshot: €153.21 held with −€1,205.20 pending, the −€700
  top-up in → 2 new, 1 was pending, 1 you already had, "adds up", apply
  → saving… → landed €90.35 → done closes.
- S2 one row too many (the top-up not matched) → "not saved yet", the
  row named, the row you have beside it, apply disabled. "leave it out"
  → adds up → apply → €90.35, three rows written, no −€700 on 6 Oct.
- S3 the same, "it is another payment" → saved, the file's balance wins.
- S4 no row explains it → held; "save it" or "leave ActivoBank out".
- S5 three banks, one off → apply saves two, the third waits.
- S6 20 rows; S7 no printed balance ("the file shows no balance").
- An account with no balance yet shows no strip. Phone width.
- convex-test, from his account as it stood on 11 Oct (real trail
  1358.41 → 90.35, the row of the 12th, the side Revolut's file wrote):
  the check, the hold (apply writes nothing for a held account), each
  answer, and `landed.gap` 0 for the pending row.

## Data

- you had: state (latest balance reading) plus log sum of rows after it.
- new rows out / in: sums of the file's rows called new, one currency,
  after that reading; every sum opens its rows (ROWS).
- the file says: the file's printed balance (kept on the intake).
- the difference: the three above, shown only as "does not add up by X"
  — the same check `balanceGaps` and `landed.gap` already make.

## Out of scope

Undo a saved file (next PR); `insideReadings` (third PR); the account's
own UPDATE path (`confirmTransactions`) is checked on save only; a file
with no printed balance cannot be checked.

## Questions

None open: "nothing written by default" is his instruction.

# One balance rule, every door (20 Oct)

Artem, 20 Oct: "This finance is a minefield… all the time same problems
every day." The €422 BPI → ActivoBank arrival of 3 Oct was fixed in the
account sheet on 19 Oct (`balanceChecks`) and broke again the next day in
the bank answer's sum card (`accountCheck`, fixed on
`fix/bank-check-same-day-e0269d`). Each door that asks "do the rows reach
the balance" carries its own copy of the rules, so a fix in one misses the
others.

No screen changes. This is a refactor under the screens he already has.

## The map (as of master 5943268 + fix/bank-check-same-day-e0269d)

Rules, as named in the code:

- **booked later** — rows dated after a balance that the balance already
  had (an app moves the balance at once, the statement books the row up
  to 3 days later). `bookedLater()` in `src/lib/cashHistory.ts`.
- **same-day carry** — a row dated only by its day, that day, that the
  balance had not seen yet (the €422). Counted in the next check.
- **pending** — money the bank showed pending with a balance: the balance
  already has it off, so a gap of that size is not missing.
- **twins** — a new row of the same amount as a saved one, days apart:
  asked, not counted.
- **file grace** — a row read off a file within 12 h after a reading counts
  as inside it (a statement's own rows made its closing balance).

| Check | Where | Door → screen | "Was" | Rows counted | Booked later | Same-day carry | Pending | Twins | File grace |
|---|---|---|---|---|---|---|---|---|---|
| `balanceChecks` | `src/lib/cashHistory.ts` | Account sheet → ✓/missing between two readings (`aggregate.accountSheet`, `AccountSheetCheck`) | the earlier reading | saved rows and trades after it, up to the next reading | ✅ 3 days | ✅ (19 Oct) | ✅ reading's own pending | — | ✅ 12 h (`HISTORY_GRACE_MS`) |
| `balanceGaps` | `src/lib/cashHistory.ts` | none — tests only (wrapper of `balanceChecks`) | — | — | — | — | — | — | — |
| `balanceGaps` | `src/lib/bulk.ts` | UPDATE ALL / bank answer → "€X missing between d1 and d2" ask (`intake.batchReview`) | the drop's earlier file balance | the drop's **new** rows only, by calendar day (`from < day ≤ to`); two balances on one day are skipped | ✅ 3 days | ❌ | ⚠️ after the fact in `batchReview`: pending rows within ±1 day equal to the gap | — | ⚠️ day boundary instead of 12 h |
| `sumCheck` | `src/lib/fileCheck.ts` | engine under the two below | given | given | ❌ | ⚠️ via `checkFrom`: retry from 18 h before the reading | ✅ rows summing to ≤ the held pending | ✅ ASK | via `checkFrom` |
| `landedCheck` | `convex/rowBalance.ts` | one file saved → landed card was / out / in / now (`confirmTransactions`, `IntakeLanded`) | latest saved balance ≤ file + 6 h, plus `movedSince` | the kept new rows of the file, plus fees | ❌ | ⚠️ 18 h retry only; not the 20 Oct fix | ✅ held pending | ❌ (always off) | ✅ in `movedSince` |
| `accountCheck` | `convex/rowBalance.ts` | UPDATE ALL drop and bank answer → sum card (`batchReview`, `BulkSumCheck`; apply asks it too) | latest saved balance ≤ printed + 6 h, plus `movedSince`; **plus** on the fix branch, saved rows of the reading's day before it that equal the gap | the drop's new rows, not pending, not his | ❌ | ⚠️ 18 h retry, and the fix branch's own copy of the €422 rule | ✅ bank: pending now − pending then; file: held pending | ✅ ASK | ✅ in `movedSince` |

Also asking "does it add up", without the rules:

| Check | Where | Door | What it does |
|---|---|---|---|
| `balanceIsNews` | `convex/rowBalance.ts` | bank answer (`bankRows`) and `batchReview`: does this balance need saving | held + `movedSince` ≠ printed, exact cents, no rule applied |
| `movedSince` | `convex/aggregate.ts` | under every "was" above and the account cards | rows after a reading; its own 12 h `FILE_ROW_GRACE_MS`, a second copy of `HISTORY_GRACE_MS` |
| `countedRows` / `insideReadings` | `convex/rowBalance.ts`, `src/lib/rowBalance.ts` | one file's review → "already had" | rows a saved balance already counted, from the balances printed beside rows |

What the map says:

1. The same-day carry lives in three versions (19 Oct in `balanceChecks`,
   18 h retry in `checkFrom`, 20 Oct saved-row look-back in
   `accountCheck`) and is missing from the bulk `balanceGaps` and from
   `landedCheck`.
2. Booked later is in the two sheet/drop checks and in none of the sum
   cards.
3. Pending is applied four ways: per reading, per held balance, as a
   bank's pending-now difference, and as a ±1 day filter after the fact.
4. The bulk `balanceGaps` ledger leaves out rows the drop already had, so
   a gap between two files of one drop can be a row he has.
5. Twins exist only where the card can ask; that stays (a sheet cannot
   ask).
6. The 12 h file grace is written twice (`HISTORY_GRACE_MS`,
   `FILE_ROW_GRACE_MS`).

## The change (after his "go")

One pure function in `src/lib/balanceRule.ts`:

```ts
reach({
  was: { at, cents, pending },          // the earlier balance
  rows: Array<{ id, at, cents, fromFile, twin }>,  // every row near it
  to:  { at, cents, pending } | null,   // the balance it should reach
  pendingIsWhole: boolean,              // a bank answer: the list is whole
}) → { state, out, in, now, gap, counted, bookedLater, carried, pending, twin }
```

It owns the window (file grace), booked later, same-day carry, pending and
twins. Each door keeps only how it fetches its rows and how it shows the
answer:

- `balanceChecks` → calls `reach` per pair of readings; `balanceGaps`
  (cashHistory) goes.
- bulk `balanceGaps` → calls `reach` per pair of the drop's balances, with
  saved rows of the account in the window too.
- `sumCheck` + `checkFrom` → become `reach`; `landedCheck` and
  `accountCheck` fetch the held balance, `movedSince` and the rows of the
  held balance's day, and pass them in.
- `FILE_ROW_GRACE_MS` goes; `movedSince` imports `HISTORY_GRACE_MS`.

Convex reads: none added. `accountCheck` already reads the held day's
rows on the fix branch (≤ 50 logs, by index); `landedCheck` gets the same
one indexed read only when its sum is off. Everything else is pure.

## Tests

Every step in `convex/replay.test.ts` stays green, plus one replay step
per door for the same-day €422 shape:

- **S1 bank answer** — ActivoBank's 15:01 answer at €728, the BPI
  screenshot writes +€422 at noon, the next answer at €1,150: sum card
  `ok`, no missing.
- **S2 statement drop** — the ActivoBank October statement dropped in
  UPDATE ALL after the same three: no "missing between" ask.
- **S3 screenshot** — an ActivoBank screenshot at €1,150 after the same
  three: review and landed card add up, gap 0.
- **S4 landed card** — the BPI screenshot itself, saved after the 15:01
  answer: landed card was / out / in / now with gap 0.
- **S5 sheet** — the existing 19 Oct step (`accountSheet.checks`).

Unit tests of `reach` in `src/lib/balanceRule.test.ts` cover each rule
alone and the refusals (a gap no rule explains stays missing).

## PRs (each < 600 lines, after his "works")

1. `refactor(finances): one balance rule` — `reach` + its unit tests;
   `balanceChecks` and `sumCheck` call it. Replay S5 stays green.
2. `refactor(finances): every door asks the one rule` — `landedCheck`,
   `accountCheck`, bulk `balanceGaps` call it; replay S1–S4. Waits for
   `fix/bank-check-same-day-e0269d` to merge (it touches
   `convex/rowBalance.ts`).

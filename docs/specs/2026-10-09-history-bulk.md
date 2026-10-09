# Revolut trading history through bulk

Journey: once or twice a year he exports the whole Revolut trading CSV
(3,595 trades since 2020) and drops it, on + or on update all. He wants
every buy, sell and split in Revolut, nothing counted twice, and to see it
land. Agreed 9 Oct ("go use bulk"): no screen of its own — the update-all
screen he already has, and the dead-end `HistoryReview` goes.

Screens/files:

- `convex/ai/intake.ts` — a history CSV also finds each ticker once
  (`historyFound`) and stores past ECB rates back to the first trade.
- `convex/intake.ts` — `finish` puts a single-dropped history into the open
  update (or a new one); `applyStep` no longer skips it; `applyOne` writes
  it a chunk at a time (`historyCursor`); `writeTrades` reads each ticker's
  stored trades once per call and knows splits.
- `src/components/finances/Intake.tsx` — a history opens `BulkUpdate`.
- `src/components/finances/Reading.tsx` — `HistoryReview` deleted.
- Journey map: `docs/journeys/finances.md`, "Drop many files" row.

Scenarios:

- S1 bulk: a history in the drop → apply → "saving" at once (applying) →
  "Revolut up to date · N added" → close. (e2e `history.spec`)
- S2 same history again → apply → lands with nothing new added. (e2e)
- S3 a single drop of a history opens the same update screen. (convex:
  `finish` joins the open update)
- S4 a history longer than one chunk lands whole, and the update finishes.
- S5 a trade already stored from a statement is skipped, not doubled.
- S6 a split adds its shares at no cost and no cash.
- S7 history trades never move Revolut's cash (`noCash`).
- S8 a name with no ticker found is left out and counted, not guessed.

Data: trades are source 1 rows (sums over `trades`); euros at the ECB rate
of the trade's day (source 4, stored by the reader).

Out of scope: worth back to 2020 (past prices); "already have" counts for a
history in the review block.

Questions: none open — cash untouched and ECB day rates were agreed 6 Oct.

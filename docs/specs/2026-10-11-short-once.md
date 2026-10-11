# Short once: how much to add, and by when

Journey: you open Flow to see what is coming. ActivoBank has €78.39 and
Preply takes €123.72 on the 29th. The list tagged that row "not enough on
the day" — and then every ActivoBank bill for three months, each with
"already at −€45.33", "−€70.33", "−€206.01". (11 Oct: "Oh this means I
wont have money. This wording is killing me tho.") The first tag is true.
The rest are the same gap carried forward: the app does not know you top
ActivoBank up from BPI, so the account only goes down. You said "go" to
the wording table, with "add" rather than "move".

## What changes

- **The first bill an account cannot cover** carries the tag
  `⚠ not enough funds · €45.33 missing` and, under the amount, "ActivoBank has €78.39, add €45.33
  before 29 Oct". The amount is the whole of that month's gap for the
  account, so one add covers the month.
- **Later bills of that account** carry no tag and no orange line.
- **A later month** says it once, under its heading: "add €160.68 to
  ActivoBank".
- The list's summary says "not enough funds in 1 account", not "5 not covered on the
  day".

Files: `src/lib/ahead.ts` (`buildAhead`: `short` on the first only, `add`,
`later`), `convex/aggregate.ts` (`ahead` returns them),
`src/components/finances/flow/Ahead.tsx` (the words). Journey map: "What's
coming: bills ahead".

## Scenarios

- S1 unit: an account that can pay → no tag, no `later`.
- S2 unit: €60 held, €100 each month → the first is short, add 40; the
  next month is in `later` at 100; no second tag.
- S3 unit: salary lands in the same account between two bills → the second
  month asks for nothing.
- S4 unit: two bills in the first month both short → one tag, add is both.
- S5 e2e (`flow.spec`): a bill bigger than the mock Revolut balance, typed
  in one line → its row says "short" and "add … before"; nothing on the
  page says "not enough on the day" or "already at".

No write is added, so no saving/landed scenario. Empty state is the
existing "Nothing coming yet" test.

## Data

Source 2 (state: each account's balance today) walked forward by the
bills you have, the same walk as before. `add` and `later` are that walk's
gap, read at a month's end instead of at each row. Nothing new is derived.

## Out of scope

Learning your regular BPI → ActivoBank top-up as something the app
expects. Splitting `Ahead.tsx` (over 1000 lines before this).

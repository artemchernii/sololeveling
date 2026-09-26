# R6b-c — Finances (26 Sep)

The last TRACK page, and the biggest. PLAN.md §3 gives it three rooms,
Spending, Balances and Investments, and §4 has kept it blocked on one
sentence: _"A sum of logged amounts is none of the four sources."_ So this
spec does two things: it asks for that answer, and it cuts Finances into
three rows so the first one can ship.

## The question that unblocks it

Every screen here needs a sum: "€612 out this month", "€48 on groceries".
§1 allows a **count** of logs, not a **sum** of their amounts.

**My pick: widen source 1 from "log count" to "log count or sum"**, on
written conditions, the same way source 4 was added:

- **One currency per sum.** Euros add to euros. Nothing is converted until
  an exchange rate is a stored reading (source 4, row F3).
- **A stated period.** "this month", "Sep 1–26". Never "total".
- **Only logged rows.** No estimates, no averages, no projections, no
  "on track to spend".
- **Every sum opens its rows.** Tap €612 and see the 23 logs it is made of.
- **Not a licence to derive.** In and out are shown side by side. A
  "saved" difference, a savings rate or a budget score needs its own yes.

It goes into §1 and CLAUDE.md in the same PR, like source 4.

## Three rows

| Row    | Room                     | Done when                                                                                                                                                                   |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | **Spending** (this spec) | `spend 48 groceries` from ⌘L lands under Groceries; Finances shows this month's out and in, by category, each opening its rows                                              |
| F2     | Balances and net worth   | He types what each account holds (a state per account, source 2), and net worth is that list as of the latest reading                                                       |
| F3     | Investments              | `invest → Revolut → TSLA → 300$` lands in a portfolio, and the position shows at a stored price, as of the time it was read (source 4) — the parked A/B/C design comes back |

F2 and F3 each get their own spec when the row before them ships. The
DeepSeek helper that reads it all ("where did September go?") is R7.

## F1 — what gets built

- **The page, Body's shape:** a short System hero (`[ FINANCES ]`, this
  month's **out** and **in** in euros, the month's name). Tabs: **Spending ·
  History**. Balances and Investments tabs appear when F2 and F3 ship, not
  as empty placeholders.
- **Spending:** a quick add (amount, one tap on a category, optional note)
  for the phone, beside ⌘L. Then this month by category: each a row with its
  icon, its sum and how many logs, tapping in to list them. A category
  without a spend this month isn't shown.
- **History:** Body's month calendar with a small mark on days with
  spending, the tapped day's rows under it (fix the category, the amount or
  delete, like Body's History), and ‹ › between months.
- **Categories:** a fixed short list: groceries, eating out, transport,
  home & bills, health, fun, clothes, travel, other. Stored in
  `logs.meta.category`, like Body. `spend 48 groceries` fills it from the
  note's first word when it matches; otherwise it's **unsorted**, with the
  same fix chip Languages has. Your existing spend logs start unsorted.
- **Colour:** §3d.3 holds. Money out is not red and money in is not green;
  direction is shown by the words **out** and **in** and an arrow.

## Data and files

No new table. `aggregate.moneySums({ start, end })` returns per kind and
category the sum of `value` and the count, euros only (source 1 as widened).
`logs.setCategory` already exists; `logs.setValue` gets a money case.
Files: `convex/aggregate.ts`, `convex/logs.ts`, `src/lib/capture-parser.ts`
(the category from the note), `src/lib/money.ts` (categories, formatting),
`src/routes/_app/finances.tsx`, `src/components/finances/*`, and
`MonthCalendar` reused. Tests: every sum refuses another owner's rows, and
a period boundary is exact.

## Decided (26 Sep: "go with your picks")

All five picks below were taken as written.

## Open questions (my pick first)

1. **The sum rule above.** _Pick: yes, with those five conditions._
   Nothing in F1 can be built without it.
2. **Spending first?** _Pick: yes._ It is the daily loop (⌘L already
   writes `spend`), and F2/F3 need their own storage decisions.
3. **The category list.** _Pick: the nine above._ Name any you'd add or
   drop.
4. **A monthly limit?** _(Built, then removed 26 Sep: "monthly limit i dont need".)_ A goal with a `targetValue` ("€800 a month") would
   give "out" a real bar, like Body's weekly targets. _Pick: yes, in F1,
   optional, set from the hero._
5. **In − out ("saved this month")?** _Pick: not yet._ It is a derivation
   the rule asks you to allow on its own.

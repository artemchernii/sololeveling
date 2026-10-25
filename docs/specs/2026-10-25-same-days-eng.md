# Same days on THIS MONTH, `eng` in ⌘L

Mockup: `design/today-mockup/same-days.html`.

## Journey

Morning, Today. He glances at THIS MONTH to see if October is going better
than September. Mid-month every count was red, because 25 days of October
stood against all 30 of September — he never knew if red meant behind.
Now each count stands against September's same days. Then he logs an
English class from ⌘L in three seconds, as `pt` already does for Portuguese.

## Screens and files

- `src/lib/monthSix.ts` — `monthSix()` takes `prevCut`: the month before's
  day after today's day number (clamped to its length). `prev` counts only
  rows before it.
- `convex/aggregate.ts` `monthSix` — new arg `prevCut`, passed through.
- `src/components/dashboard/MonthSix.tsx` — `monthBounds()` gives `prevCut`
  and `prevDays` (1–N); the line under the delta reads `1–25 SEP · 5`.
  WORTH is unchanged (`SEP 30 · €45.8k`): a level, not a count.
- `src/lib/capture-parser.ts` — `languageVerbs(areas)`: one verb per
  language area other than `portuguese` (which `pt` names), from its short
  (`eng`) and its label (`english`), filed on that area's slug. Same shape
  as `pt`: class, 50 min by default; `eng homework 20`.
- `src/components/shell/QuickCapture.tsx` — passes them with the project
  verbs.
- `docs/journeys/today.md` — the row for THIS MONTH.

## Scenarios

- S1 25 Oct, 6 langs in October, 5 in 1–25 Sep, 9 in all of Sep → LANGS
  shows `▲ 1` and `1–25 SEP · 5`.
- S2 31 Oct against a 30-day September → `1–30 SEP`.
- S3 30 Mar against a 28-day February → `1–28 FEB`.
- S4 0 against 0 in the same days → no compare (unchanged).
- S5 ⌘L `eng` with an English area → Class · 50 min, chip ENGLISH; Enter →
  saving… → landed → closes; the row's area is English's slug.
- S6 ⌘L `eng homework 20` → Homework · 20 min, English.
- S7 no English area → `eng` is not a verb.
- S8 an area whose word a built-in verb holds → skipped, the built-in wins.

## Data

Counts: log count (source 1) and commits, over a stated period
(1–N of the month before). Nothing stored. The month's change rule of
17 Oct stands; only the period of the month before narrows.

## Out of scope

Worth's compare; Review's weeks; `practice` stays on Portuguese.

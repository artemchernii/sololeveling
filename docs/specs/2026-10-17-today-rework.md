# Today rework — one live TODAY card, THIS MONTH as his six

Mockup: `design/today-mockup/month.html` ("go", 17 Oct). Rules that day:
mega simple, colour only on icons, no weight and no girls on Today.

Journey: he opens Today in the morning and through the day. He wants to
know what is next and how long until it, pick or tick his three, and see
at a glance whether this month beats September on the six things he
cares about. He presses "+ X" when he did one.

## Screens and files

- `src/routes/_app/dashboard.tsx` — top kept as it is; then TODAY; then
  THIS MONTH. CURRENT STATE and THIS WEEK leave Today (his yes, 17 Oct).
- `src/components/dashboard/DayCard.tsx` — NEXT, the 08→24 line, the
  three (`ThreeSlots.tsx`). Replaces `TodayCard` and `QuestList` on Today.
- `src/components/dashboard/MonthSix.tsx` — the six tiles. Replaces
  `ActionsLogged` on Today.
- `convex/aggregate.ts` `monthSix` — per-day counts of this month and
  September's count for langs, workout, shake, post, commits.
- `convex/schema.ts` — log kind `post`.

## Scenarios

- S1 empty day: no events, no tasks → NEXT shows `0 EVENTS`; slot 01
  offers picks and `＋ own task`; `0 OF 3`.
- S2 one event at a later hour → NEXT shows its title, time and an
  `IN …` badge with its minutes; the line has its block and the now mark.
- S3 own task: type a title, Enter → it fills slot 01 (`1 OF 3`), the
  field moves to slot 02.
- S4 pick: an event offered as a pick → pressed → fills a slot with its
  title.
- S5 tick: press the ring → slot gets DONE, label stays (not struck),
  badge `1 OF 3 DONE` once three are picked; press again un-ticks.
- S6 full: three picked → no picks offered; fourth refused by
  `TODAY_FULL` (convex-test, existing).
- S7 THIS MONTH quiet: no logs → six tiles, 0s, `SEPTEMBER 0`, AUTO on
  commits and worth.
- S8 lived month: logs in Sep and Oct → counts, ▲/▼ with
  `SEPTEMBER n`, goal ring `n / 4` on langs where a target exists.
- S9 every press: `+ WORKOUT` → `SAVING…` at once → `✓ SAVED` and the
  count +1 → back to `+ WORKOUT`.
- Phone width: one column; nothing overflows.

## Data (CLAUDE.md four sources)

- Counts: source 1, log counts over a stated period (`monthSix`).
  Commits: rows of the `commits` table (own repo, no merges), as Review.
- Targets: `tileTargets` (portuguese → langs, body → workout).
- Worth: `worthHistory` at Sep 30 and each day of October, as Review.
- ▲/▼ vs September: a difference of two shown counts, both beside it;
  worth now vs Sep 30, both beside it (his yes, 17 Oct). Nothing stored.

## Out of scope

Backlog picker overlay and the after-tick log question leave Today
(backlog page keeps the whole list; logging is the tile's press).
Weight, girls, CURRENT STATE, THIS WEEK.

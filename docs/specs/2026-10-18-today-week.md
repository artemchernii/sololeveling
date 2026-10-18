# Today — THIS WEEK, days across, three bands down

Mockup: `design/today-mockup/week.html` ("go", 18 Oct, after his marks:
not a calendar, smaller, icons, draggable). Branch fix/today-dead-code
carries it because the old day line (`lanes`, `dayX`, `.td-line`) was
deleted there and the bands never used it.

Journey: he opens Today and wants to see, in one glance, what he did this
week and where the holes are. In his words: "a cool line of the week …
blocks … hover tooltip says what was done". He presses an empty cell when
he did something and forgot to log it, and drags a block that has the
wrong day.

## Screens and files

- `src/components/dashboard/WeekCard.tsx` — the card, between TODAY and
  THIS MONTH in `dashboard.tsx`.
- `src/lib/weekGrid.ts` — bands, which cell an item is in, the tooltip's
  words, where a drop lands.
- `convex/aggregate.ts` `weekItems` — this week's logs and commits.
- `convex/logs.ts` `setTime` — a block dragged to another cell.
- `convex/schema.ts` — `meta.movedFrom`, the first time a row was moved.

## Scenarios

- S1 empty week: 21 cells, `NOTHING LOGGED`, six legend chips at 0, the
  now badge in the current cell.
- S2 lived week: blocks in their cells in time order; hover names kind,
  detail, day and time.
- S3 add: press an empty cell, pick a kind → `SAVING…` → `✓ SAVED` → the
  block is there, its chip +1.
- S4 future: cells after now are dimmed and refuse presses and drops.
- S5 drag: a block dropped on another cell moves; same band keeps its
  clock time, another band takes its start (06:00, 12:00, 18:00); the
  row shows `MOVED` in the hover card with the time it was.
- S6 commits are not pressed or dragged (GitHub's, as THIS MONTH).
- S7 a refused write (future, a weight, a bank row) says why in a badge.
- Phone width: icons only, nothing wider than the screen.

## Data (CLAUDE.md four sources)

Log counts and commit rows for a stated week (Monday to Sunday, local),
each block one row, each chip a count of what is shown. Nothing derived.
Moving a row changes its `occurredAt` and keeps the first time in
`meta.movedFrom`; a log is never moved into the future.

## Convex cost

One more reactive read on Today: three area index ranges for seven days
plus the commits ranges, a fraction of `monthSix` (which reads two
months). Writes: `setTime` one patch. Schema: one optional field.

## Out of scope

Dragging tasks onto the week (a task is intent, a block is evidence).
Planned blocks. Weights and money rows (not shown, not movable).

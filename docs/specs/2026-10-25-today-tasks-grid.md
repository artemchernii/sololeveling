# Today — tasks in the week, PT and ENG apart

Mockup `design/today-mockup/three.html` (his "go — build it as the
mockup", 25 Oct). Rework of `2026-10-17-today-rework.md`.

Journey: he opens Today to see what he did this week and this month, and
logs what he forgot. Picking tasks is rare ("three we wont see every day.
Its actually rare"), so it must not take a card: the TODAY card with three
empty rows goes. He learns two languages and wants them apart ("I want to
log PT or ENG to be specific"). A comparison of 0 with 0 says nothing.

Screens/files:

- `TaskBar` (new, replaces `DayCard` + `ThreeSlots`): one dashed bar
  inside THIS WEEK — `TASKS TODAY · n OF 3`, a chip per picked task (tick
  box, area icon, full title, ✕ on hover), `＋ TASK ▾` opening a dropdown
  (own task field, then suggestions with their area). Gone at 3 picked.
  The NEXT line of the old card (an event still ahead today) sits in the
  same bar.
- `WeekCard`: chips `WORKOUT · PT · ENG · SHAKE · POST · COMMITS` (one per
  language area); a session's pill says its language (`PT`, `ENG`); a
  ticked task is a `✓ TASK` pill in the cell where it was ticked, title in
  the hover card, not draggable; the cell menu logs `PT` or `ENG`.
- `MonthSix` LANGS: chips `PT n · ENG n` under the number, buttons
  `+ PT` `+ ENG`. Every tile: when this month and last are both 0, no
  comparison is shown; equal and not 0 shows `= n`.
- ⌘L: `eng` / `english` logs a session under English, like `pt`.
- `aggregate.weekItems` reads `task_done` logs through a new index
  `logs.by_owner_kind_time`; `aggregate.monthSix` returns `langs.byArea`.

Scenarios:

- S1 empty day: bar shows `0 OF 3` and `＋ TASK`; no empty rows.
- S2 pick a suggestion from the dropdown: saving → chip arrives → menu
  closes; an own task typed + Enter the same.
- S3 tick a chip: it turns done; a `✓ TASK` pill appears in today's
  current cell; un-tick takes it back.
- S4 three picked: `＋ TASK` is gone; a fourth is refused by the server
  (TODAY_FULL, unchanged).
- S5 sessions in PT and ENG this week: chips `PT 1 · ENG 1`, pills `PT`
  and `ENG`; LANGS tile `PT n · ENG n`.
- S6 `+ ENG` on LANGS: saving → saved; ENG count +1.
- S7 POST 0 this month and 0 last: no `= SAME`, no SEPTEMBER line.
- S8 phone width: bar wraps, dropdown fits the screen.
- S9 a failed write in the bar: `NOT SAVED` badge, chip not added.

Data: task pills and chips — log rows (`task_done`) and entities
(`tasks.listToday`); language counts — log counts by area; all from
`convex/aggregate.ts` or existing task queries. Nothing new is derived.

Out of scope: picking for another day; editing a task title in the bar.

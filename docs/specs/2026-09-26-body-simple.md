# Body, simple — sessions saved, workouts as a guide (26 Sep)

Replaces the same day's "Body in tabs" spec, which was built and then
pressed: "Not simple to use and not clear … I'm not sure if I gonna log all
this … some of those exercises I never heard about … color feels TOO
bright." He took the three recommended picks ("go with your picks"):
ticks are a guide and not saved; gym is three days; the hero keeps a chip
per kind.

## What gets built

- **Hero** — unchanged, except it counts sessions and shakes only (what
  History lists).
- **Tabs: Today · History**, the tab in the URL.
- **Today** — Log today (the five one-tap buttons, unchanged), then
  **Workout**: chips to pick one of six (Back mobility · Back day · Chest &
  shoulders · Leg day · Boxing at home · Hiking legs), remembered in this
  browser. Its moves are a list: tap the row to tick, the chevron opens how
  (why, steps, avoid, **watch how** — a video search). **Finish** writes one
  `workout` log of the workout's kind, with Undo.
- **Ticks are not saved.** They live in this browser for today only, so a
  refresh mid-workout keeps them. The session is the record.
- **History** — sessions, shakes and weigh-ins by day. Select mode: tap
  anywhere on a row to tick it, "select day", Remove selected.
- **Colour** — only live and pressed things fill: Finish, a tick, a
  logged session. Chips and tabs are outlined; doses are grey; no glows on
  done buttons. Bold on Body is his Settings switch — worth trying off.

## Removed

Per-exercise DID, week dots, NEXT UP, DID ALL, Programs tab, "added by
you", and `drills.addProgram` / `dropProgram` / `didDay` with their tests.
Exercise logs already stored stay in the database; they are no longer
listed or counted. His Body drills rows stay too, unused.

## Files

`src/lib/body/library.ts` (six workouts, `howToLink`), `src/lib/body/ticks.ts`,
`src/components/body/Workout.tsx`, `src/routes/_app/body.tsx`,
`src/components/body/RecentBody.tsx`, `BodyHero.tsx`, `DidButton.tsx`,
`convex/drills.ts`. `logs.removeMany` stays (History, Undo).

## Done when

Pick Leg day, tap two rows, refresh — still ticked. Open Squat, watch how
opens a video search. Finish — Gym shows one more, Undo takes it back. In
History, Select, tap a row's text — it ticks.

## Same day, after pressing it (26 Sep, "go with both")

- **Finish saves the moves in the session.** Still one `workout` row, but
  its text names what was ticked, in the workout's order — "Back day — Lat
  pulldown, Face pull" (`sessionText`). The ticks clear once saved and come
  back on Undo. He asked "0 exercises registered?"; now the record says.
- **A month calendar replaces the strip on Body** (`BodyCalendar`,
  `src/lib/month-grid.ts`): Monday-first, an icon per kind logged each day
  from `aggregate.categoryDays` over the month, ‹ › between months (none
  past this one), tap a day to list its rows. Languages keeps the old
  strip — the calendar-week strip was reverted ("even worse").
- **Weight in the hero**: tap it, type, Enter. A new weigh-in is a new
  log; if today already has one, the new one is written and today's old
  one removed, snapshot and all. 20–400 kg.

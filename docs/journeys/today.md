# Today — journeys

One live TODAY card and THIS MONTH as his six (17 Oct; spec
`docs/specs/2026-10-17-today-rework.md`, mockup
`design/today-mockup/month.html`). Route `src/routes/_app/dashboard.tsx`
reads every number; components in `src/components/dashboard/`.

| Journey                                                                                   | Screen             | Code                              | Functions                                                | Test                                                            |
| ----------------------------------------------------------------------------------------- | ------------------ | --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| What is next and how long until it; the day as a line                                     | TODAY · NEXT       | `DayCard`, `src/lib/day.ts`       | `events.listInRange`, `tasks.listToday`, `buildTimeline` | `today.spec` NEXT, `day.test`                                   |
| Pick the three: today's events, a goal behind, the focus project's next task, an own task | TODAY'S THREE      | `ThreeSlots`                      | `tasks.create`, `tasks.pickForToday` (TODAY_FULL)        | `today.spec` empty day, pick                                    |
| Tick one, un-tick it, drop it                                                             | TODAY'S THREE      | `ThreeSlots`                      | `tasks.complete` / `reopen` / `dropFromToday`            | `today.spec` empty day                                          |
| This month against September: langs, workout, shake, post, commits                        | THIS MONTH         | `MonthSix`, `src/lib/monthSix.ts` | `aggregate.monthSix`, `aggregate.tileTargets`            | `today.spec` lived month, `aggregate.six.test`, `monthSix.test` |
| Worth now against the month before's last day                                             | THIS MONTH · WORTH | `MonthSix`                        | `aggregate.worthHistory`                                 | `today.spec` lived month                                        |
| Log one with a press: saving → saved → closes                                             | THIS MONTH tile    | `MonthSix`                        | `logs.create` (kind `post` new)                          | `today.spec` lived month                                        |

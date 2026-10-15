# Review, rebuilt as the bento (14 Oct)

Mockup: `design/review-mockup/index.html` (served by the `review` entry in
`.claude/launch.json`, :3960, path `/design/review-mockup/`). Artem on it:
"fuck its damn goooood! finally". Build what it shows.

## Journey (his words, 14 Oct)

"It should show small review of everything sololeveling has. Small section
for body, lang, finances (can be bigger) and overall activities. + small
note for week … very informative, colorful and see my progress." Opened
on a Sunday (or Monday for the week before). He reads the week at a glance,
taps a tile to open its page, writes one line for next week, closes the
week. Second word (14 Oct): "we dont have quests anymore … We care about
Logs and tasks, But this is not most important things. Overall activities
like GYM, reading, or simple log 'I called Dyson to fix vacuum' is
activity … finances is most important, body and lang both can take same
space as finances". So: no quests anywhere; Finances, Body, Languages and
Activity are the four big tiles, in that order. The AI read is **not** in this slice: it comes with R7, behind an
ANALYZE button, because "some weeks are not worth to analyze".

## Screens / files

- `src/routes/_app/reviews.tsx` — the page shell, week arrows, the bento grid.
- `src/components/review/` — one file per tile, replacing `KpiTiles`,
  `MovementTable` and the five-question `CloseWeek`:
  `WeekBar` (slim System window across the top: week, range, OPEN/CLOSED,
  LOGGED · TASKS DONE · ON PROJECTS, arrows), then four big tiles
  `FinancesTile`, `BodyTile`, `LanguagesTile`, `ActivityTile`, then
  `FocusTile` (2 cols) and `NoteTile` (4 cols).
- Motion: count-up, grow, draw, pop, ping, breathe, sweep — added to
  `src/styles.css` as named utilities beside the existing eight, each one
  under `prefers-reduced-motion`.
- `convex/reviews.ts` — `save` keeps `decision` (the one line); the five
  `answers` stay in the schema for old rows, the page no longer writes them.
- `docs/journeys/review.md` (new) — the map for this page.

## Data — every number and its source

| Tile        | Number                                                                  | Source                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Week bar    | LOGGED · was                                                            | log count: every log in the week, any kind (new `aggregate.weekDays`)                                                                                        |
| Week bar    | TASKS DONE · was                                                        | log count: `task_done` via `kindCount`                                                                                                                       |
| Finances    | OUT · IN · was                                                          | log sum: `aggregate.moneySums` this week and last                                                                                                            |
| Finances    | OUT by category                                                         | log sum: `moneySums.buckets`                                                                                                                                 |
| Finances    | WORTH now · was, 7-day line                                             | `aggregate.worthHistory` with eight day ends (last Sunday → this Sunday)                                                                                     |
| Activity    | bars per day by area, grey last week; legend counts incl. OTHER         | log count: new `aggregate.weekDays` (per day: projects, languages, body, money, social, other — every log, so a note like "called Dyson" counts under OTHER) |
| Activity    | LATEST — the four newest logs, kind badge + their own text + day        | logged rows themselves (`weekDays.latest`, 4 rows)                                                                                                           |
| On projects | hours                                                                   | `kindCount` (work sessions under `projects`)                                                                                                                 |
| Body        | WORKOUTS · was; per kind: days strip, `n of target`                     | `categoryDays` (area body) · `goals.setWeeklyTarget` targets, as on Body's Week chips                                                                        |
| Body        | WEIGHT · was                                                            | state: `stateHistory('weight')` latest in the week and the latest before it                                                                                  |
| Languages   | per language: level, classes, minutes, sheets, a seven-day strip | state `languageLevels` · `kindCount` per category · Vault sheet count (no word count: a reading's words are the model's text, never a number on screen — schema `readings`)                                                                          |
| Focus       | tasks done of total · commits · was                                     | entity count (the `focus` project's tasks) · `projectCommits`                                                                                                |
| Note        | the line                                                                | `reviews.decision`                                                                                                                                           |

Nothing derived, nothing stored new. Day boundaries are passed in from the
client (local midnights), as every existing query does.

## Scenarios (each becomes an e2e test, `e2e/review.spec.ts`, mock data)

- **S1 many** — a week with logs in every area → every tile shows its
  numbers, Finances shows OUT/IN/WORTH and five categories, the bars have
  seven days, LATEST shows four rows newest first, a plain note log
  counts under OTHER.
- **S2 empty** — a week with nothing logged → `0 LOGGED · was N`, the
  Activity tile shows `0 LOGGED`, Finances `0 OUT`, weight `MISSING`; no
  tile is hidden.
- **S3 one** — one workout only → Body shows 1 in its kind, everything else
  0; the day card of that day has one dot.
- **S4 week arrows** — ← shows last week's numbers; → is disabled on this week.
- **S5 note write** — type a line → CLOSE WEEK → `saving…` at once → a
  `CLOSED` badge and `SAVED` → the textarea is gone.
- **S6 failed write** — the save throws → the line stays typed, `NOT SAVED`
  badge, CLOSE WEEK again works.
- **S7 tile opens** — pressing the Finances tile opens `/finances`; Body
  `/body`; Languages `/languages`.
- **S8 phone width** — two columns, nothing overflows.
- **S9 light theme** — tiles read; colours come from tokens.

convex-test: `reviews.save` with only `decision`; another owner's week is
never returned.

## Out of scope

The AI week read (R7, ANALYZE button). The note on Today on Monday (a
separate small slice — Today is the next row). Monthly reviews.

## Decided (14 Oct, "overall agree with picks")

1. No quests anywhere (the day cards and `of 21` are gone).
2. Body: no ring; each kind row reads `2 of 3` with a tick when met.
3. Languages: classes with no "of".
4. Activity: every log counts; areas outside the five named ones are OTHER.
5. No BUY badge in this slice.

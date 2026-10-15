# Review — journeys

The week at a glance, as a bento (14 Oct; spec
`docs/specs/2026-10-14-review-bento.md`, mockup `design/review-mockup/`).
Route `src/routes/_app/reviews.tsx` reads every number and hands it to a
tile in `src/components/review/`.

| Journey                                                               | Screen          | Code               | Functions                                                               | Test                                                    |
| --------------------------------------------------------------------- | --------------- | ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| See the week: logged, tasks done, hours on projects, with last week's | WEEK bar        | `WeekBar`          | `aggregate.weekReview`                                                  | `review.spec` lived week                                |
| Page to an earlier week and back                                      | WEEK bar arrows | `WeekBar`          | —                                                                       | `review.spec` quiet week                                |
| Money this week: out, in, worth, by category, worth line              | FINANCES        | `FinancesTile`     | `aggregate.moneySums` ×2, `aggregate.worthHistory`                      | `review.spec` lived week                                |
| Workouts per kind against weekly targets, weight                      | BODY            | `BodyTile`         | `weekReview.week.body`, `goals.weeklyTargets`, `aggregate.stateHistory` | `review.spec` lived week                                |
| Each language: level, classes, minutes, sheets                        | LANGUAGES       | `LanguagesTile`    | `weekReview.week.languages`, `aggregate.languageLevels`                 | —                                                       |
| Every log as activity, by area, the four newest                       | ACTIVITY        | `ActivityTile`     | `weekReview` (counted in `src/lib/review.ts`)                           | `review.spec` lived week, `src/lib/review.test.ts`      |
| The focus project: tasks, commits                                     | focus tile      | `FocusTile`        | `weekReview.focus`, `aggregate.projectCommits`                          | —                                                       |
| Close the week with one line                                          | NOTE            | `NoteTile`         | `reviews.closeWith`                                                     | `review.spec` closes the week, `convex/reviews.test.ts` |
| Open a room from its tile                                             | any tile's head | `parts.tsx` `Tile` | —                                                                       | `review.spec` tile opens                                |

Not here yet: the AI week read (R7, an ANALYZE button), the note on
Monday's Today.

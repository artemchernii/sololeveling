# Review — journeys

The week at a glance, on what the app gets by itself (15 Oct; spec
`docs/specs/2026-10-14-review-bento.md`, mockup
`design/review-mockup/real2.html`). Route `src/routes/_app/reviews.tsx`
reads every number and hands it to a tile in `src/components/review/`;
counting lives in `src/lib/review.ts`.

| Journey                                                                       | Screen          | Code               | Functions                                          | Test                                                                                  |
| ----------------------------------------------------------------------------- | --------------- | ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| See each day: commits by project, money out and in, workouts, shakes, classes | WEEK bar        | `WeekBar`          | `aggregate.weekReview`                             | `review.spec` lived week                                                              |
| Page to an earlier week and back                                              | WEEK bar arrows | `WeekBar`          | —                                                  | `review.spec` quiet week                                                              |
| What the week spent against last week, bills apart, biggest rows, worth       | FINANCES        | `FinancesTile`     | `weekReview.money`, `aggregate.worthHistory`       | `review.spec` lived week, `convex/aggregate.review.test.ts`, `src/lib/review.test.ts` |
| Each live project's commits against its target, last week, its tasks          | PROJECTS        | `ProjectsTile`     | `weekReview.projects`                              | `review.spec` lived week, `convex/aggregate.review.test.ts`                           |
| Workouts, shakes and kinds beside four weeks; the last weight                 | BODY            | `BodyTile`         | `weekReview.body`                                  | `review.spec` lived week                                                              |
| Each language's sessions beside four weeks, its level                         | LANGUAGES       | `LanguagesTile`    | `weekReview.languages`, `aggregate.languageLevels` | `convex/aggregate.review.test.ts`                                                     |
| Read the week with the AI, or be grilled (front only until R7)                | AI REVIEW       | `AiReviewTile`     | —                                                  | `review.spec` AI review                                                               |
| Open a room from its tile                                                     | any tile's head | `parts.tsx` `Tile` | —                                                  | `review.spec` tile opens                                                              |

Not here yet: the AI week read (R7, an ANALYZE button), the note on
Monday's Today, PRs merged and FEAT/FIX counts (need a count over
`commits` first).

# Review — the AI read (R7)

Journey (his words, 15 Oct): "this review is kinda check what i did and
if week is good it says good this and that you reach your goals and bla
bla, if bad => grill me hard and encourage to work harder." "No need
focus on, maybe simple Grill me." Once a week, often on Sunday or when a
week feels off, he opens Review, presses ANALYZE WEEK (GRILL ME on for
the hard voice), reads the verdict and four lines, hovers a line to see
which tile it means, and closes the page. Reopening the week shows the
same read without paying again.

Look: the "read" state of `design/review-mockup/real2.html` (on :3960,
toggles "read (example words)" and "grill").

## Screens and files

- `src/components/review/AiReviewTile.tsx` — idle / reading / read /
  failed; hover a line → `data-review-tile` on the tile it names lights.
- `convex/weekReads.ts` — `forWeek` (query), `run` (mutation: stores the
  week's facts, schedules the read), internal `forRead` / `finish` /
  `fail`.
- `convex/ai/week.ts` — the one action that calls the model; on the test
  backend (E2E=1) it answers with the canned read and never calls out.
- `src/lib/weekRead.ts` — `weekFacts()` (the page's own numbers as
  labelled facts), the prompt, the JSON schema, `parseWeekRead()`, the
  canned reads.
- `aggregate.weekReview`'s counting moves to `weekReviewFor()` so `run`
  counts the week exactly as the page does.
- Journey map: `docs/journeys/review.md`.

## Scenarios

- S1 idle: NOT READ, ANALYZE WEEK, GRILL ME off.
- S2 press ANALYZE WEEK → READING WEEK n at once (scan bar) → ✓ READ ·
  <day time>, verdict box, 4 lines each a GOOD/BAD/WATCH/NEXT badge, a
  line and its two numbers (e.g. `SPENT €… · LAST WEEK €…`).
- S3 GRILL ME on, press → GRILLING WEEK n → red verdict, 🔥 GRILLED.
- S4 reload the page → the read is still there (stored per week and
  tone); GRILL ME toggled shows the other tone's read or NOT READ.
- S5 hover a line → the tile it names lights.
- S6 the reader fails → FAILED badge and TRY AGAIN; nothing stays
  "reading".
- S7 another week (← arrow) shows its own read or NOT READ.
- Phone width: the four lines stack, no horizontal scroll.

## Data

- The facts are `aggregate.weekReview`'s numbers (log sums and counts,
  entity counts), stored with the read so it can be audited.
- The verdict and the lines are the model's words. The numbers under a
  line are not its words: the model names up to two fact keys and the app
  prints those facts. No score, no grade computed by the app.
- Paid only on a press. One read per week per tone; RUN AGAIN replaces it.

## Out of scope

Worth in the read (it is not in weekReview), news, a note field, a prompt
field, a history of reads.

## Questions (with my pick)

1. Verdict colour — mockup: amber, red when grilled. Pick: as the mockup.
2. Model — Haiku 5.5, like the Vault (his pick, 15 Oct).
3. RUN AGAIN replaces the week's read of that tone. Pick: yes.

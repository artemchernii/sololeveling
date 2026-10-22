# Ask AI — journeys

R7 (22 Oct; spec `docs/specs/2026-10-22-r7-ask-ai.md`, mockup
`design/ask-mockup/index.html` round 2). A ⌘J drawer over any page that
answers from his own rows. The app picks the period, reads and counts the
rows (`src/lib/rowsAsk.ts`); the model only writes words beside the
counts (`src/lib/rowsAskPrompt.ts`). Nothing is stored but the month's
spend.

| Journey                                                     | Screen                   | Code                       | Functions                                                     | Test                                      |
| ----------------------------------------------------------- | ------------------------ | -------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Open it from anywhere, close it                             | ⌘J, ✦ Ask in the top bar | `_app.tsx`, `TopBar`       | —                                                             | `ask-rows.spec` S1, S7                    |
| Ask about a period: the days, the counts, the model's lines | drawer, answer card      | `RowsDrawer`, `RowsAnswer` | `rowsAsk.forPeriod`, `ai/rowsAsk.ask` or `/__claude/rows-ask` | `ask-rows.spec` S1, `rowsAsk.test` (both) |
| Open the rows behind a number                               | a tile or a fact pill    | `RowsAnswer` `RowsList`    | — (the rows came with the question)                           | `ask-rows.spec` S3                        |
| A period with nothing logged                                | ❔ NO DATA line          | `RowsAnswer`               | `cannedRows` / the prompt's nodata rule                       | `ask-rows.spec` S4                        |
| The reader fails; ask again                                 | ✕ NOT REACHED, ASK AGAIN | `RowsDrawer` `TurnView`    | `useRowsAsk.ask(q, id)`                                       | `ask-rows.spec` S5                        |
| The month's $2 is spent (deployed)                          | CAP REACHED              | `RowsDrawer`               | `rowsAsk.spend`, `marketAsk.spent`                            | `ask-rows.spec` S6, `convex/rowsAsk.test` |

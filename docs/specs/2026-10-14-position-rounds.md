# Position rounds — PAID since zero, one shares line, 0 NEW

Journey: he opens a position he sold out once and bought again (iShares
Physical Gold: 2023 bought and sold, 2026 bought €549). PAID beside
"6 BUY · 3 SELL" read as if 2023 were in it. He wants PAID to speak of
what he holds now, with the day it started, and the old rounds kept with
their own sums. Re-dropping the same screenshots should say
"0 NEW · 9 SAVED BEFORE", and held vs. the buys is one line. Mockup
`design/treasury-mockup/position-rounds.html`, his "go" 14 Oct.

Screens/files: `PositionTiles`, `PositionTrades`, `BuysCheck` (`BuysLine`,
`BuysSaved`), `BulkSaving` (`Applied`), `src/lib/rounds.ts`.

Scenarios:

- S1 his 19 gold trades saved → page: `paid · 7 buy`, `since 17 Feb 2026`,
  `down since 17 Feb`; NOW round open (7 rows), two CLOSED rounds folded
  with BUY / SELL sums; press opens one. (add-buys.spec, overlap test)
- S2 the same drop again → `0 new`, `19 saved before`, no undo.
- S3 four buys of 0.408365 oz held → line `0.408365 oz · 0.286213 oz in
the buys · 0.122152 oz missing`; counts `4 new`, no "saved before".
- S4 everything in → `… · every buy in ✓`.
- S5 sold out → its last round open at first (portfolio.spec, sold page).

Data: PAID is `positions.paid` (the cost of what is held, as before). The
round's counts, first day and BUY / SELL sums are log sums over a stated
period (source 1): each round shows its days.

Out of scope: the head line's currency chip and sector badge (PR 2).

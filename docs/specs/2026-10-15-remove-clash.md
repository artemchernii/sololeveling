# Remove · clash — a file's buys another file read too stay

Journey: his gold screenshots overlap — IMG_9290's last three rows are
IMG_9291's first three. The save wrote those three once, under the file
saved first. He presses REMOVE on that file in JUST ADDED (a wrong file,
a re-drop) and expects only what no other file read to go. Before: all
its trades went, IMG_9291 then held 0 of the three, and Gold lost real
buys. Rare press, but it must never lose a real buy.

Mockup: `design/treasury-mockup/remove-clash.html` (his "go", 15 Oct),
drawn from the built `JustAdded` Ask box.

Screens/files: `JustAdded.tsx` (Ask, landed line), `AccountFileBack.tsx`
(`TakeBack` in an opened file), `PortfolioPosition` / `OpenAccount` sums;
`convex/handOver.ts` (`alsoRead`, `staysWith`), `undoFile.erase` /
`preview`, `justAdded.list`. Journey row in `docs/journeys/finances.md`.

Rule: a trade of file A stays — `importId` moves to file B — when B is a
saved, not removed file of the same account whose read rows (`intakes.
trades`) hold a row matching it by the save's twin rule (`writeTrades`):
same side, units within 1e-6, within two days; else, as `fileTrades`,
the same day and side. B's own trades answer for their rows first; each
row answers for one trade. UNDO of a whole drop (`takeBackBatch`) marks
every file first, so nothing is handed between files of the drop.

Scenarios:
S1 two overlapping files saved → REMOVE on the one that saved the three
→ `CLASH`, `3 BUY · IN IMG_9290.PNG`, three `STAYS · IMG_9290.PNG`,
the rest `GOES`; buy total counts only the goes. [e2e, convex-test]
S2 pressed → "removing…" → `−1 BUY` `3 BUY STAY · IMG_9290.PNG`
removed; buys and sells 19 → 18; the other file `5 BUY`. [e2e]
S3 the other file removed after → the three go too. [convex-test]
S4 the whole drop undone → every buy goes. [convex-test]
S5 another owner → refused, nothing moves. [convex-test]
S6 no clash → as before, every row GOES. [existing e2e]

Data: counts of trades rows (entity count of `trades`); no new number.

Out of scope: trades soft-removed by × (`removedTrades`) stay with the
file they came from; files on another account never share a trade.

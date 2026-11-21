# Clean account list (31 Oct)

Approved: "Go" on `design/treasury-mockup/sync-line.html` (round 3). His
words: "too much noise. I want have a clean list of transactions and maybe
some indicator its synced from bank", "ui is a bit poor but better".

Journey: he opens an account (Revolut, ActivoBank) to see what moved. He
reads the list by day; he wants to know it is up to date with the bank,
and only be stopped when something does not add up.

Screens/files: `OpenAccount.tsx` (Timeline), `AccountSheetRows.tsx`
(RowLine), new `AccountSync.tsx` (the pill and the red strip), new
`src/lib/sheetDays.ts` (day lines). Journey map: Finances "Open an account".

Scenarios:

- S1 synced bank: one pill on top — bank logo, SYNCED WITH BANK, day ·
  time, `N NEW`, OPEN › to the rows it saved; no sync card in the list.
- S2 day header: `FRI 23 OCT · 3 OUT −€31.40 ─ BALANCE €x` — the balance
  only when the bank or a file gave one that day.
- S3 rows the last sync saved carry a green dot.
- S4 a sync whose rows leave money with no row: one red strip on top,
  `✕ NO ROW −€6.00 · 30 OCT`; nothing in the list.
- S5 statements and typed balances keep their card (unchanged).
- Phone width: the pill and day line fit 375px.

Data: day OUT = sum of that day's listed rows under 0, one currency
(source 1); BALANCE = that day's newest reading (source 2); N NEW = rows
of the sync's file (source 1). Nothing new is stored.

Out of scope: a list of all syncs (ALL ›) — the pill opens the newest.

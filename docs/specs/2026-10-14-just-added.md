# Just added

Mockup: `design/treasury-mockup/just-added.html` (:3950). Artem said
"go 2" on 14 Oct, after three marks: no LLM sentences, the app's own
badges and logos, REMOVE (not "take back"), and the clash.

## Journey

He saves gold buys from ADD BUYS, closes the window, opens Revolut:
"i see nothing in revolut, no history of this addings … i cant open what
i just added and cant undo". The file was saved; the sheet places a file
at the date of its rows (23 Jul), under 60 newer rows. He wants what he
just added on top, to open it or remove it. Right after every save, and
whenever a number looks wrong.

## Two PRs

- **A (this one):** the strip on the account sheet and on a position's
  page; OPEN (the built file view); REMOVE with what goes before the
  press; BANK / BROKER badges in the sheet's header.
- **B:** the clash. A file that saved 0 because another had its rows
  first: removing the first hands the rows to it (`undoFile`), the
  strip says `CLASH` and `STAYS`.

## Screens and files

`JustAdded` (new) in `OpenAccount` (Ledger, under the header) and in
`PortfolioPosition` (under the tiles); `KindBadge` in the sheet header.
`convex/justAdded.ts`: `list` (one account's or some instruments' files
saved since a day), `rows` (what one file saved, the first few).
REMOVE calls the built `undoFile.takeBack`.

## Scenarios (A)

- S1 nothing saved in 7 days → no strip.
- S2 one file saved → the strip on the account: IMG, its name, its days,
  "added today", `4 BUY` with the thing's mark, OPEN ›, REMOVE.
- S3 the same on the thing's page: only files with its rows.
- S4 REMOVE → each row with `GOES`, the before → after, KEEP / REMOVE.
- S5 REMOVE pressed → "removing…" at once, the landed `−4 BUY · name
removed`, the file gone from the strip and the buys from the page.
- S6 a failed remove says so; nothing goes.
- S7 a file whose rows were all in already → `0 SAVED · 4 BUY IN
ALREADY`, no REMOVE.
- S8 phone width.
- convex-test: another owner's file is never listed; a file removed or
  older than the day asked is not listed; counts saved / in already.

## Data

Counts of rows a file saved (log / trade rows by `intakeId` /
`importId`, source 1) and of rows it read (the stored reading). The buy
total before and after is a sum of trade rows (source 1). Nothing
derived.

## Out of scope

The clash (PR B). Rewording the built file view's take-back box.

# One update window

Status: journey agreed 10 Oct ("yes, go mockup"). Mockup `design/treasury-mockup/update.html` in review. No code yet.

## Journey (his words)

"We should use this update all for all updates modals, no?" (9 Oct)
"Every time I'm scared to upload statements cuz something is wrong all the
time." "I bet screen will stuck with no loading animation, or accidentally
close modal or bad read." (9 Oct) "All scenarios, not only happy path …
user journey shouldn't collapse for some stupid reason." (10 Oct)

He has files from a bank or a broker — one, or twenty. He wants them in,
and to know nothing broke. Roughly monthly for statements; now, once, for
the full stocks history.

1. He presses **update** (hero), or UPDATE on an account, or the check-in.
   The same window opens every time.
2. He drops files. The window says "uploading 2 of 5" at once.
3. It reads. One line per file, each with its own state. It stays until
   every file is read or has said why not.
4. He checks: one line per account — what is new, what was already in.
   Anything the app cannot know is asked here, nowhere else.
5. He presses apply. "saving…" at once, progress on a big file.
6. Landed: per account, what came in. He closes it himself, or it closes.

Leaving at any step never loses work: close asks first while something is
in flight; if he leaves anyway the read goes on and the update button
shows something is waiting; opening it returns to the same step.

## Today (what this replaces)

Five ways in, two engines:

| Way in                      | Component                    | Engine     |
| --------------------------- | ---------------------------- | ---------- |
| hero + → drop               | `Add` → `AddDrop`            | one file   |
| hero update all             | `Bulk` → `BulkUpdate`        | many files |
| check-in → account          | `UpdateSheet` → `DropFiles`  | one file   |
| account card UPDATE         | `UpdateSheet` → `DropFiles`  | one file   |
| strip on Overview (waiting) | `OpenIntakes` → `IntakeFlow` | one file   |

One-file engine: `intake.start` → `ReadingSheet` → one of four reviews,
each with its own landed. Many-files engine: `intake.startBatch` →
`BulkReading` → `BulkReview` → `Applying` → `Applied`; it already opens a
single file's detailed review inside itself (`onCheck`), and a trading
history already lands only through it (9 Oct).

Found while mapping: `Sheet` closes on a click outside and on Escape with
no question, at every step (`Sheet.tsx` backdrop `onMouseDown`). Nothing
guards a page reload either.

## After

The many-files engine is the one engine. Every way in opens `BulkUpdate`.

**Changed 10 Oct after his marks on the mockup** ("+ add now looks pretty
cool, exactly the way I love"; "afraid we lose some good stuff"):

- The window opens as today's **+ ADD** (`AddDrop`: drop area, the four
  icon steps, account chips with how each was last filled, the amber line,
  OR ADD rows by hand). That look is kept, not rebuilt.
- What changes is behind the drop: every drop goes through the many-files
  engine. The four icon steps become the progress strip on later steps.
- Proposed, waiting for his answer: the hero keeps one button, **+ ADD**;
  "update all" goes; the waiting dot sits on + ADD.
- account UPDATE / check-in: the same window, that account named, typing
  the number as the second choice (`TypeBalances`).
- waiting work: the dot on the button; the Overview strip goes.
- The window keeps its size between steps; only the line that changes
  moves. Saving: one row per bank with logo and its own bar. Saved is
  green and ticked, unfinished is amber. ROWS opens the rows in the check,
  on landed and on a stopped save.

Dead-code candidates, to confirm by search when each door moves:
`BulkDrop` in `Bulk.tsx` (AddDrop stays), `DropFiles` + `useIntakeUpload` in `Add.tsx` (Setup still
uses them — check), the file tab in `UpdateSheet`, `OpenIntakes` +
`IntakeStrip`, `ReadingSheet` where `BulkReading` covers it, `intake.start`
/ `lastRead` / `preview` if nothing calls them, the mockups
`add-empty.html` / `add.html` drop half.

## Scenarios (each one e2e test, mock backend only)

Drop

- D1 wrong kind of file → named, nothing uploaded
- D2 file over 10 MB / more than the limit → said plainly, nothing started
- D3 upload fails halfway → says so, can drop again, no half update left
- D4 no reads left this month → says how many are left
- D5 first time, no accounts → a new bank becomes its account

Reading

- R1 "uploading" then one line per file, at once (slow read held open)
- R2 close / Escape / click outside while reading → asks first
- R3 he leaves anyway or reloads → still reading; dot on update; reopening
  returns to the same step
- R4 one of several cannot be read → that line says why; read again or
  leave out; the rest go on
- R5 every file bad → says so, nothing to apply, nothing saved

Check

- C1 one account, one file → one line: new rows, already-in rows
- C2 many accounts → one line each
- C3 the same file as last time → "already in, nothing new"; apply adds 0
- C4 overlapping days from two files → each row once
- C5 bank not known → asked which account, once
- C6 back from a file's detail returns to the list, not out

Apply

- A1 pressed → "saving…" at once → landed → closes (the three asserts)
- A2 100+ rows / a full trading history → progress, then landed with counts
- A3 a write fails midway → says what landed and what did not; pressing
  again finishes it and adds nothing twice
- A4 close while saving → asks first; leaving does not stop the save

Landed

- L1 per account: what came in, in his words
- L2 "more files" returns to the drop; close closes

Everywhere: phone width · dark and light · a second update while one waits.

convex-test alongside: startBatch refusals, applyBatch twice, applyStep
resumed after a failure, a batch with every intake failed.

## Data

No new numbers. Counts in the review and on landed are log counts of the
rows the apply writes (source 1); balances are state (source 2).

## Slices (each one PR, under ~600 lines)

1. Mockup: the one window, a switcher for every state above. His go.
2. Safety net on the engine that stays: the scenarios as e2e, and the
   fixes they force (close asks, bad read, twice, slow, big). After this
   merges the stocks file can go in through update.
3. Every door opens the one window; "update all" → "update".
4. Delete what nothing calls; update `docs/journeys/finances.md`.

## UPDATE on one account (piece 3b) — journey, 11 Oct

Status: journey and mockup `design/treasury-mockup/update-account.html`
in review. No code until his go.

### Journey (his words)

"We should use this update all for all updates modals, no?" (9 Oct)
"+ add now looks pretty cool, exactly the way I love" · "afraid we lose
some good stuff" (10 Oct) "I click still the same and NO animation, no
confirmation" · "should appear only when need update. Not always" (5 Oct)
"I cant run fixes and db fixes after every update to clean the mess"
(11 Oct)

He is looking at one account and its number is old or wrong. Two moments:

- **The card says amber, "balance of Oct 3".** He has that bank's app
  open. About weekly per account, and after payday.
- **Check-in says two are old.** He goes down the list, one account
  after another. About weekly.

What he wants: this account right, now, and proof it took. What he does:

1. Presses UPDATE on the card, in the account's sheet, or on a line of the
   check-in. The window ADD opens, already named for that account.
2. Either drops that bank's statement or screenshot (the usual, it brings
   the rows too), or types what is in it now (ten seconds, no file), or
   presses "still the same" on a number over a week old.
3. A file: reads, he checks one account, applies, "saving…", landed with
   ROWS and UNDO. A number: "saving", a tick, the window closes itself.
4. From check-in, the list comes back with what is still old, so the next
   account is one press away. (Proposed — today it drops him on the page.)

### Today, measured on the test backend (11 Oct)

- UPDATE opens a narrow window with two tabs, "type it" / "statement or
  screenshot"; picking the file tab widens it from 560 to 920.
- The file tab is the old drop (`DropFiles`), then the old one-file check
  (`TransactionsReview`: "2 new payments", spent / came in / balance,
  "add 2 payments and the balance"). None of what was built on the
  many-files check since 10 Oct runs here: not the was · out · in · now
  check before saving, not the shares check, not "same file again", not
  UNDO on the landed card, not the close guard.
- A file that names another bank is saved into the account UPDATE was
  pressed on, with no word: an ActivoBank CSV dropped on Revolut's UPDATE
  read as "Revolut", "becomes Revolut EUR cash". `intake.accountId` wins
  over what the file says (`headingFor`, `guessAccount` is never asked).
- Cash gets the file tab too, though cash has no statement.
- A connected bank still gets the typing fields, though its free cash
  comes from the bank.
- Check-in closes when UPDATE is pressed and does not come back.

### What the mockup's "from an account" state (10 Oct) did not know

Built since: the check is `BulkAccountBlock` with chips and the
was · out · in · now strip (#123–#126), not "adds up"; the landed card has
UNDO (#135) and no ROWS yet; a typed balance can be removed from the
account sheet (#138), so a wrong typed number has a way back; a connected
bank's card has no UPDATE unless it also holds investments (`AccountFoot`).
The 10 Oct state had no "still the same", no hint line, no cash account,
no connected bank, no wrong-account file.

### After

`UpdateSheet` becomes the same `Sheet` + `BulkUpdate` ADD uses. Its drop
area is `AddDrop` told the account (title names it, one chip, no "what is
it?" step, no last-read line), with `TypeBalances` under "or type what is
in it now". Kept as built, untouched: `AddDrop`'s look, `TypeBalances`
(fields, ages, "still the same", save, `SavedNote`), `BulkReading`,
`BulkReview` and its blocks, `Applying`, `Applied` with UNDO, the guard.

New in the window (ADD gets them too, it is one window):

- the four steps in the header once a file is in, the step it is on lit;
- the window glides to each step's height (measured in the mockup: one
  change per step, the file line 58px and the saving row 70px throughout);
- ROWS on the landed card (`intake.fileRows` per file);
- "Which account is this file for?" when the file names another account
  than the one UPDATE was pressed on; not saved until picked;
- cash: no drop area; connected: a "from the bank" line, no fields;
- check-in comes back after the window closes while something is old.

Goes: the tabs; the Overview strip (`OpenIntakes`) — ADD's dot is the one
sign of waiting work; `statement.spec`'s old words.

Words changed to the rule (no "you", nothing "waits"): reading footer
"Closing does not stop the reading. It opens again from ADD."; guards
"Closing does not stop the reading. ADD shows a dot and opens here
again." / "Closing does not stop the save. It finishes either way.";
check footer "Nothing is saved until apply is pressed."; "1 file",
"1 account". The step words "you check" and "lands on the account" stay:
they are the built ADD he approved.

### Scenarios (each one e2e test, new file `e2e/account-update.spec.ts`)

- U1 card UPDATE → window named for the account, drop area and fields, no
  tabs; phone width the same
- U2 a Revolut CSV from check-in → reading → check (was · out · in · now)
  → apply → "saving…" → landed, ROWS opens the rows → done → check-in list
  without Revolut (replaces `statement.spec` "a Revolut CSV")
- U3 typed number → "saving" → "Revolut is up to date" → closes itself
- U4 "still the same" on cash → saving → saved → closes; cash has no drop
- U5 the same file again → "nothing to save", no apply
- U6 another account's file → the question; apply off; pick → that account
  lands; the account UPDATE was pressed on is unchanged
- U7 a typed save fails → "Not saved", numbers kept, save again works
- U8 a file save stops → not finished → finish saving lands it once
- U9 a slow save → pending stays visible (typed and file)
- U10 connected account → "from the bank", no fields; a file still reads
- U11 close while reading asks first; Overview has no strip

convex-test: none new unless `intake.batch` gains `named` (see below).

### Data

No new numbers. Balances are state (source 2); counts on the check and
the landed card are log counts of the rows the apply writes (source 1).

### Not in this slice — dead after it, for the piece-4 PR

`DropFiles` + `useIntakeUpload` stay (Setup uses both). After 3b nothing
calls: `OpenIntakes` (Intake.tsx), `IntakeStrip` outside Setup,
`ReadingSheet` and `IntakeFlow`'s reading branch outside Setup and
`BulkUpdate`'s `onCheck`, `intake.open` outside Setup, `intake.lastRead`
when the last-read line is not shown. Confirm each by search then.

### Open

- Check-in comes back after an update (recommended), or stays closed.
- A connected account shows no typing fields (recommended).
- "Revolut" picked for a file that names ActivoBank is remembered only
  while the window is open, unless `batchAnswer` learns it (A's file).
- An update already waiting on ADD when UPDATE is pressed: the file joins
  it (`intake.finish` does that today) — to be checked in the build.

## Questions

- Q1 The button says **update**. (recommended)
- Q2 Leaving mid-read: the read goes on and waits for him, rather than
  being thrown away. (recommended)

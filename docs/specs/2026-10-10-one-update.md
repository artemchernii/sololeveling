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

## Questions

- Q1 The button says **update**. (recommended)
- Q2 Leaving mid-read: the read goes on and waits for him, rather than
  being thrown away. (recommended)

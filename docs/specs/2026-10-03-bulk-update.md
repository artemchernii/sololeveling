# Bulk update — spec (3 Oct)

Journey: `2026-10-03-bulk-update-journey.md` (agreed). Mockup:
`design/treasury-mockup/bulk.html` on :3950 (agreed, "go" 3 Oct). Built
to match the mockup; compared side by side before it is called done.

## What gets built

**0. Its own button, beside what exists** (Artem, 3 Oct: "more like an
addition to what we have"). An account card's UPDATE and the ADD sheet
stay as they are — one statement for BPI, one CSV for Revolut. A new
**UPDATE ALL** button in the Treasury hero, next to ADD, opens the bulk
sheet. Nothing about the single-file path changes.

**1. A drop is a batch, a file is an intake.** Today one drop is one
intake (all files read together, at most 6). A bulk drop makes one
`intakes` row per file, tied by a new `batches` row, so 27 files read in
parallel and each lands in its own account. Limit raised to 60 files per
drop, on the UPDATE ALL sheet only.

**2. Reading view** (mockup "reading a year"): per-account bins filling
as each file finishes, the file being read, files read of total, a
not-placed bin. Driven by intake statuses already written by
`convex/ai/intake.ts` — no new polling.

**3. One review per batch, gathered per account** (mockup "all clear"):

- per account: months covered (already had / this drop / hole), new vs
  already-had rows, first and last balance, adds up or where not (A.5)
- moves paired _across the batch's files_ before anything is saved —
  today `review` pairs only against rows already stored
- only-you-know asks on top: can't place, new account, missing month,
  move with one side, doesn't add up, money in from a payer or person
  not known yet
- rows behind ROWS; leave out per account; one APPLY

**4. Apply** writes every account's rows oldest statement first, reusing
`confirmTransactions` / `confirmTrades` per intake inside one batch
mutation chain. Unanswered asks and left-out accounts stay in the batch,
waiting.

**5. Two new money kinds** (agreed 3 Oct):

- `paid_back` — a friend returning his money. Positive, **not** money
  in. Optionally linked to the expense it repays (`meta.repays`); the
  expense then shows "€60 · €30 paid back". The expense's own sum never
  changes silently.
- `lent` — money he lent. Negative, **not** spending. A later
  `paid_back` from the same person can pair with it.
- Both are log sums under PLAN.md §1's conditions: shown as their own
  lines ("friends paid back €30 · 1 row"), each opening its rows.

**6. Remembered payers and people.** Salary is recognised (same payer,
monthly, similar amount) and never asked. Every other payer or person is
asked once; the answer is kept in a `counterparties` table (who → kind,
note) next to `merchantRules`, and applied on every later read.

**7. Notes on rows.** `logs.meta.note` — the answer to "what is it?",
or anything he writes with the pen on a row.

## Files

- `convex/schema.ts` — `batches`; `intakes.batchId`; log kinds
  `paid_back`, `lent`; `meta.note`, `meta.repays`; `counterparties`
- `convex/intake.ts` — `startBatch`, `batchReview` (per account, pairs
  across files, the asks), `applyBatch`; `review` reuses the same
  per-row matching
- `convex/aggregate.ts` — `moneySums`, `accountMonth`, cash history and
  `accountSheet` learn the two kinds (sign, and not in in/out)
- `src/lib/intake.ts` — salary detection, person vs company, cross-file
  pairing (pure, tested)
- `src/components/finances/Bulk.tsx` (new) — reading view and review;
  `TreasuryHero.tsx` gets the UPDATE ALL button
- tests: `convex/intake.batch.test.ts`, `src/lib/intake.test.ts` —
  including another owner's batch refused, a pair across two files,
  `paid_back`/`lent` left out of in/out

## Done when

He drops a year of BPI, Revolut, ActivoBank, TR and Trading 212 files at
once; each lands in its account; transfers between them pair; the few
asks are answered; APPLY; Overview shows the new total and a year line
starting October 2025 — and the screen sits next to the mockup and
matches. Typecheck, lint, tests green; one review; PR on `master`.

## Open questions (my pick first)

1. **Reading cost.** Each PDF is one Claude read (CSVs are free). A year
   of four banks is ~40 reads. _Pick: fine for a catch-up; the review
   says how many reads a drop will take before it starts._
2. **Salary detection threshold:** same payer in 3 of the last 4 months,
   amount within 20%. _Pick: that, and he can correct it once._
3. **Trading 212** files go through the trades reader (positions), not
   transactions. _Pick: yes — its CSV is a trades export._
4. **One PR or two?** _Pick: two — (a) batches + reading + review +
   apply, (b) paid back / lent / counterparties / notes. Each one he can
   press._

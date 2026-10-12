# A transfer between two of your accounts, matched before saving

Status: DRAFT — journey and mockup only. No code until "go".

Journey: you drop a bank file, a few times a week, sometimes two banks at
once. Money you moved between your own accounts shows up in both banks,
under two names, days apart, sometimes a few euros less. Before you press
apply you want it to be one transfer, written once — not a payment here
and money in there. (11 Oct: "Transfer between two of my accounts matched
inside the check before saving (amount, a small fee, a few days apart), so
it is written once." 10 Oct: "System should be smart as fuck to understand
what is transfer between accounts, deposits to broker acc, investments and
what is spending." 3 Oct: "very hard to always update and not overwrite or
duplicate existing state. This is main thing.") When the app is sure it
says "already added" and asks nothing. When it is not, it shows both rows
and asks; that account is not saved until answered.

Mockup: `design/treasury-mockup/transfer-match.html` (from `check-sum.html`).

## What is built today, and what slips

- `findDuplicates` (src/lib/intake.ts): same account, same amount, a
  shared word of 4+ letters, 2 days (7 with two shared words).
- `buildReview` second pass (convex/intake.ts ~1071–1094): a row read as
  own money (`self` / `ownMoney`) against a stored `move` of the same
  amount, 2 days — 4 when another account's file wrote that side
  (`fromOther`).
- `twinOf`: any stored row of the account, same amount, 7 days — asked
  only when the file prints a balance, the account holds one, and the sum
  does not reach it.
- `pairAcross` (src/lib/bulk.ts) and the `stored` pass in `batchReview`,
  `openSide` at save: opposite rows in two accounts, both read as moves,
  exact amount, 2 days.
- `gapMatch` (account sheet, after saving): fee up to 2% capped at €10,
  3 days before to 5 after.

Slips, from the real rows of 11 Oct:

1. **€700, ActivoBank.** Stored: −700 "Top-up by \*2789", Sat 3 Oct,
   written by Revolut's file. New: −700 "COMPRA 2789 REVOLUT", Tue 6 Oct.
   No shared word ("2789" is digits), "COMPRA" is a card payment so it is
   not own money, and the `fromOther` pass never looks at it. Only
   `twinOf` sees it — as a question, and only when the sum is off. With no
   printed balance, no balance held, or a sum that happens to pass, it is
   written twice, as spending.
2. **The same €700 with both files in one drop.** `pairAcross` takes only
   rows read as moves and 2 days: Revolut's +700 writes both sides,
   ActivoBank's "COMPRA" is written as spending. Nothing asks.
3. **€505.20 → €500.63, Trade Republic.** Every pass wants the exact
   amount. ActivoBank's file writes +505.20 on Trade Republic; Trade
   Republic's own file then adds +500.63. Found only afterwards, on the
   account sheet.

## The rule (pure, `src/lib/transferMatch.ts`)

A new booked row R of account A, against sides S: stored rows of his
accounts with no pair, and new rows of other files in the drop.

- **Fits** when S is the same money seen from one of two places:
  - _here already_: S is in A, written by another account's file, same
    sign, same amount to the cent;
  - _the other side_: S is in another of his accounts, opposite sign, and
    what arrived is what was sent or less by a fee of at most 2% and €10
    (`FEE_SHARE`, `FEE_MAX_CENTS` from gapMatch — one fee rule in the app).
- **Days**: the two are at most 5 days apart (the 3 Oct top-up booked on
  the 6th; a pending transfer booked 4 days after it arrived).
- **His own accounts**: every account in `accounts`. Nothing else.
- **Sure** → "already added" / one transfer, nothing asked: exact amount,
  exactly one side fits, and either both rows were read as moves or R's
  line names the other account (its name, or an IBAN/card ending of
  either account).
- **A question** otherwise: a fee, nothing in the line names the other
  account, or two sides fit. The account is not saved until answered.
- Never: a side that already has its pair; a pending row; two rows of the
  same file; another currency.

## What is written

- Sure, here already: R is not written.
- Sure or "same transfer", the other side stored: R is written as a move
  paired to it (`pairOf`); nothing is added on the other account.
- Both in the drop: one transfer, each side once.
- A fee: the arriving account gets the amount sent as the move and the
  fee as an expense, category fees, on the arrival day (the account
  sheet's choice, 11 Oct: "fee as spending"). Its balance is unchanged by
  the answer.
- "not this one": R is saved as the row the file shows.
- Answers go through `batchAnswer` kind `sum`: `same:<file>:<row>:<side>`,
  `apart:<file>:<row>`; `on: false` takes one back.

## Files

New: `src/lib/transferMatch.ts` (+ test), `convex/transferMatch.ts`
(+ test), `BulkTransferCheck.tsx`, `convex/e2eTransfer.ts` (canned
readings), `e2e/transfer-match.spec.ts`. Touched, mine:
`BulkAccountBlock.tsx`, `convex/rowBalance.ts`. Needs lines in
`convex/intake.ts` (owned by slice A — ask the coordinator):

1. `batchReview` (~3014–3070): call `transferMatch.forDrop`, count a sure
   row as `had`, keep it out of `sumRows`; return `transfers` per account;
   an open question makes the account `held`.
2. `applyStep` row filter (~3772): leave out matched rows, call
   `transferMatch.write` for a pair or a fee.
3. `batchAccount` validator (~2698): the `transfers` field.

## Scenarios (each one e2e test unless marked)

- S1 his ActivoBank screenshot, the 3 Oct top-up stored from Revolut's
  file → "already added", no question, apply → saving… → landed €90.35,
  no −700 on 6 Oct.
- S2 the same with no printed balance (convex-test): still not written.
- S3 Trade Republic's file with +500.63, ActivoBank's −505.20 stored →
  the question, both rows, fee €4.57; apply disabled. "same transfer,
  €4.57 fee" → saving… → answered line → apply → landed: +505.20 paired,
  −4.57 fees, nothing new on ActivoBank.
- S4 the same, "not this one" → +500.63 saved as the file shows.
- S5 Revolut's file and ActivoBank's screenshot in one drop → one
  transfer, each side once, "1 move paired".
- S6 no transfer in the file → as today.
- S7 two sides fit → both shown, one press picks; "not one of these".
- S8 20 rows with one transfer inside → same size block.
- S9 phone width; a failed answer shows its error and keeps the question.
- convex-test refusals: another user's batch; a side already paired; a
  fee over the limit; 6 days apart; another currency.
- Unit: the rule from the real rows above, both directions.

## Data

Every number is a log amount or a sum of log amounts in one currency over
the file's days (source 1), or a stored balance (source 2). The fee is the
difference of two rows, shown with both.

## Out of scope

The account's own UPDATE path; a transfer in two currencies; moving the
account sheet's question here (it stays for what is already saved); the
2789 card ending kept on Revolut (task_d61ec3ff).

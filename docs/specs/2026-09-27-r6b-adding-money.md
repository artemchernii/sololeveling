# R6b-c — Adding money: movements and accounts (27 Sep)

Artem, 27 Sep, after the Treasury build: the first job is that updating
his money is **easy and fast**. Files first — screenshots, PDFs, CSVs read
by AI into a prefilled list — and still a way to add an account or a
movement by hand, one or many. No bank or broker APIs ("can be
dangerous"); the 212 API pick is dropped. "Make it smart and understand
what is going on." This spec replaces the adding half of
`2026-09-27-r6b-treasury.md`; the Treasury rooms come after it.

## What gets built

**1. Five things that happen to money, one shape.** Every movement has a
from and a to; the kind follows from the two ends, never from a picker.

| Kind     | From            | To                 | Example                                 |
| -------- | --------------- | ------------------ | --------------------------------------- |
| in       | outside         | a cash pocket      | salary, bonus, IRS refund               |
| out      | a cash pocket   | outside (merchant) | groceries, Netflix, a laptop            |
| transfer | his cash pocket | his cash pocket    | BPI → TR, Revolut cash → Revolut Invest |
| buy      | broker cash     | a position         | 3 MSFT @ €402 in TR                     |
| sell     | a position      | broker cash        | —                                       |

Recurring is a flag on a row (monthly, around a day), not a kind; it is
what fills bills and salary. A buy lowers the broker's cash and grows the
position in one confirm — which is what the old Buy/sell form never did.

**2. The reader works out what a file is**, then what is in it:

- **Cash history** (Revolut PDF/CSV, Revolut history screenshot, BPI
  statement) → ins, outs and transfers. A transfer is recognised by his
  own account's identifiers (IBAN ending, card last 4) on the other side,
  and matched to the same transfer already seen from the other account.
- **Holdings snapshot** (TR, 212, Revolut Invest screenshot) → a state,
  not movements. First time: opening positions. After that it is
  compared with what the app holds, and each difference is offered as a
  buy or sell ("MSFT 3 → 5 — you bought 2?"), dated the screenshot day
  and marked so.
- **Trade history** (a broker's order list or confirmation) → buys and
  sells with their own dates and prices.

**3. One review list for every source.** A dropped file, one typed line,
or several typed lines all end in the same editable, prefilled rows —
sure rows ticked, guesses marked. Typed lines: `in 2900 salary`,
`out 1200 laptop revolut`, `bpi → tr 2000`, `bought 3 msft 402 tr`. A
single entry is a list of one. Merchant memory, duplicates (±2 days),
pending rows and bill matching stay as built.

**4. Accounts start from the bank.** + Account: pick the institution
(Revolut, BPI, Activo, Trade Republic, Trading 212, search, or other) —
logo, kind and usual currencies come with it — then its pockets (cash per
currency; investments if it is a broker), then identifiers (IBAN ending,
card last 4; optional). A balance is always "as of" something: the latest
statement or screenshot sets it; typed by hand it says "typed, 27 Sep".
**Or the account comes from a file**: the reader names the bank and IBAN
ending, and the review asks "Create Revolut?" — one tap.

**5. When the file and the app disagree**, the file wins and the gap is
shown ("statement says €799.47, the app had €812.10"), never hidden.

## Files

`convex/schema.ts` (account identifiers and pockets, movement kinds),
`convex/ai/intake.ts` (classify first), `convex/intake.ts`, `convex/money.ts`,
`convex/invest.ts` (buy/sell through cash), `src/lib/intake.ts` (typed-line
parser, snapshot diff), `src/components/finances/Add.tsx`, `Intake.tsx`,
`Accounts.tsx`. Tests with each: the parser, the diff, the transfer match,
buy moving cash, and another owner's account refused.

## Done when

1. His Revolut PDF shows €561 spent, the moves set apart, balance
   €799.47 — and the €4,400 transfer lands on the account whose IBAN ends
   0120 instead of "unassigned".
2. The same TR screenshot with one position changed offers exactly one
   buy; confirming it lowers TR cash by what it cost.
3. `bought 3 msft 402 tr` typed in + does the same, from one line.
4. A statement from a bank he has not added offers "Create <bank>?" and
   lands with its balance as of the statement date.

## Open questions (my recommendation first)

1. **Revolut is one institution with two accounts** — Current and
   Invest — so cash → Invest is an ordinary transfer. _Yes._
2. **Dividends and broker fees**: fall into in/out on the broker's cash
   for now; their own kinds later. _Later._
3. **A holdings difference with no date** is dated the screenshot day and
   says "date from screenshot", editable in the row. _Yes._
4. **Existing dev rows** (the Revolut statement, 10 TR positions, TR
   cash) are migrated into the new shape, not wiped. _Migrate._

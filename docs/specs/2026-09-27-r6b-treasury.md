# R6b-c — Treasury: the Finances rework (27 Sep)

Artem, 26–27 Sep, after F1–F4 (PR #70): the page was "a faceless boring
tool to log numbers". His brief: one paycheck; money in banks, Revolut
(bank + broker), TR and 212, and notes; he wants free cash vs
investments, dynamics and charts, P&L in green/red, bills and salary,
spending that fills itself, and later AI analysis. "log + track + invest
but not slop but bigboy approach."

Designed in a clickable mockup (26–27 Sep) against his real examples: a
Revolut PDF statement, a Revolut history screenshot, a Trade Republic
holdings screenshot. Built on the same branch as F1–F4 (PR #70 is not
merged; PRs are never stacked). "Build what we decided; tomorrow we
refactor and improve."

## Decided

- **[ TREASURY ]**, four rooms: Overview · Flow · Portfolio · Insights.
- **Red/green for P&L** in Finances (PLAN §3d exception); change since
  last month, the cash/invested split, per-position profit, left after
  bills — all allowed (26 Sep picks A–E).
- **Accounts are his**: add, edit, delete. An account is any of bank,
  broker, cash; it holds one or more currencies; a non-euro pocket shows
  its amount and the euros it is worth at the stored ECB rate.
- **+ is two doors.** DROP FILES — statements (PDF/CSV) and screenshots,
  any bank or broker; the reader works out what each is and returns a
  list to check. LOG SOMETHING — transfer, money out (a purchase), money
  in (bonus, IRS, gift, or a transfer in). No coffee logging: small
  spending comes in by the batch.
- **The review list is the product**: guesses marked sure/guess, fix one
  merchant → all its rows and remembered; transfers between his own
  accounts are moves, never spending (his statement: €6,601 out on paper,
  €561 spent); pending rows held back; duplicates matched by amount,
  place and ±2 days; recurring charges offered as bills; the closing
  balance updates the account.
- **Holdings screenshots** (TR's list shows value and % since buy, no
  shares): name → ticker with the right share class (Alphabet (A) →
  GOOGL, not GOOG); shares and what he paid are calculated from the
  day's price and marked as such.
- **Bills & salary** live in Flow: set once, ticked by one tap — or by
  a statement row that matches.
- **Discard goes back one step**, never closes everything (27 Sep).

## Order (each a working slice, committed on its own)

1. Accounts: kinds, currencies, edit/delete; balances per currency.
2. Transactions: `logs` carry the account; transfers as moves; merchant
   memory; the statement/screenshot reader returns transactions.
3. The review list: moves, pending, duplicates, recurring, fix-all,
   confirm → logs + balance.
4. The **+** button, as Add: drop files, log something (transfer / money out / money in).
5. Treasury page: hero, rooms, Flow (bills, month, categories),
   Portfolio (brokers with logos, positions with P&L).
6. Charts (lightweight-charts) and nightly worth history — next session.

**Later, not in this pass:** Buy/sell rethink ("shit, looks like slop" —
27 Sep, redo properly), Insights/AI analysis, sector and earnings data
(needs a Finnhub key), open banking.

## Done when

His Revolut PDF, dropped on +, shows €561 spent with the five moves set
apart and the balance €799.47; his TR screenshot becomes ten positions
with GOOGL, not GOOG; both land in the Treasury page.

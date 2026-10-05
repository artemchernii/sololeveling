# Finances journeys

One line per thing Artem does on `/finances`, mapped to the screen, the code
that draws it, the Convex functions it calls, and the e2e test that guards it.
Read this before opening the code. A bug report names a journey; the row
names the file. Update the row in the same PR that changes the path.

**Shape.** `src/routes/_app/finances.tsx` renders `TreasuryHero` above three
rooms kept mounted (`?room=` in the URL): **Overview**, **Flow**,
**Portfolio**. Everything enters through the hero's **+** (`Add`) or
**update all** (`Bulk`). Reviews open in a `Sheet` titled "check it".
Components live in `src/components/finances/` (Flow in `flow/`); functions
in `convex/`.

**Test** column: `—` means nothing guards it yet. Those are the next
safety-net tests.

## Hero: where do I stand

| Journey                                     | Screen           | Component      | Convex                                                     | Test |
| ------------------------------------------- | ---------------- | -------------- | ---------------------------------------------------------- | ---- |
| See net worth, cash vs invested, this month | hero             | `TreasuryHero` | `aggregate.worth`, `balances`, `accountMonth`, `moneySums` | —    |
| First visit, no accounts yet                | hero empty state | `Setup`        | `accounts.create`, `setBalance`, `intake.open`             | —    |

## Bring things in (+)

| Journey                                              | Screen       | Component                                                             | Convex                                                             | Test                           |
| ---------------------------------------------------- | ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| Add an account: pick the bank, its balance, it lands | + → account  | `AccountForm` (`PickBank`, `AccountDetails`) → `Landed`               | `accounts.create`, `setBalance`                                    | `accounts.spec`                |
| Drop a statement file (CSV, PDF, screenshot)         | + → drop     | `Add` → `AddDrop`                                                     | `attachments.generateUploadUrl`, `intake.start`, `intake.lastRead` | `statement.spec` (Revolut CSV) |
| Watch it being read, retry, discard                  | reading      | `Reading`                                                             | `intake.preview`, `history`, `retry`, `discard`                    | —                              |
| Check transactions found in a file                   | check it     | `Intake` → `TransactionsReview` (own file; rows in `TransactionRows`) | `intake.review`, `setAccount`, `whose`, `confirmTransactions`      | `statement.spec`               |
| Check holdings (broker screenshot)                   | check it     | `Intake` → `HoldingsReview` (own file)                                | `intake.confirmHoldings`, `market.search`                          | `holdings.spec`                |
| Check trades / orders                                | check it     | `Intake` → `TradesReview` (own file), `OrdersFound`                   | `intake.confirmTrades`                                             | `trades.spec`                  |
| Check a crypto statement                             | check it     | `Intake` → `CryptoReview` (own file)                                  | `intake.confirmTransactions`                                       | `crypto.spec`                  |
| Something still waiting to be checked                | Overview top | `OpenIntakes`                                                         | `intake.open`, `one`                                               | —                              |
| Type a few rows by hand (spend, buy)                 | + → rows     | `AddRows`                                                             | `money.record`, `logs.categories`, `market.search`                 | —                              |
| What a save landed as                                | landed       | `Landed` (+ `Landed`, `ReviewLanded` in `IntakeLanded`)               | `accounts.setBalance`, `aggregate.balances`                        | every write spec               |

## Update all (monthly check-in)

| Journey                                       | Screen     | Component                                                                                                    | Convex                                                                                                | Test                              |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| See which accounts are old                    | update all | `Bulk` → `BulkUpdate`                                                                                        | `aggregate.balances`                                                                                  | `statement.spec` (check-in)       |
| "Still the same": saving, saved, closed       | update all | `UpdateSheet`, `SavedNote` (in `AccountParts`)                                                               | `accounts.setBalance`                                                                                 | `statement.spec` (still the same) |
| Drop many files at once, one line per account | bulk       | `BulkDrop` → `BulkReading` → `BulkReview` (`BulkAskCard`, `BulkAccountBlock`) → `Applied` (in `BulkReading`) | `intake.startBatch`, `batch`, `batchReview`, `batchAnswer`, `applyBatch`, `readAgain`, `discardBatch` | `statement.spec` (bulk)           |

## Overview: my accounts

| Journey                              | Screen         | Component                                                     | Convex                                                                                | Test |
| ------------------------------------ | -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| Net worth over time                  | Overview chart | `WorthChart` → `AccountsChart`                                | `aggregate.worthHistory`, `accountSheet`                                              | —    |
| Account cards with sparkline         | Overview       | `Accounts` → `AccountCard` (with `Sparkline`)                 | `accounts.list`, `aggregate.cashHistory`, `positions`, `accountMonth`                 | —    |
| Open one account: its rows and files | account sheet  | `OpenAccount`                                                 | `aggregate.accountSheet`, `intake.fileRows`, `originals`, `logs.remove`, `removeSide` | —    |
| Fix one row: value, category, delete | row            | `MoneyRow`                                                    | `logs.setValue`, `setCategory`, `remove`                                              | —    |
| Edit, retire or erase an account     | account sheet  | `AccountForm` → `AccountDetails`; `Accounts` → `StillCounted` | `accounts.update`, `remove`, `retired`, `erase`                                       | —    |

## Flow: bills, salary, where the month went

| Journey                            | Screen          | Component                | Convex                                                                                       | Test                |
| ---------------------------------- | --------------- | ------------------------ | -------------------------------------------------------------------------------------------- | ------------------- |
| Payday to payday: in, out, left    | Flow            | `flow/Flow` → `PayMonth` | `aggregate.payMonth`, `recurring.find`                                                       | —                   |
| Where the month went, refile a row | Flow            | `Spending`               | `aggregate.payMonthDetail`, `logs.refile`                                                    | —                   |
| What's coming: bills ahead         | Flow            | `Ahead` → `AheadChart`   | `aggregate.ahead`, `recurring.payments`, `end`, `resume`, `setCovers`, `notBill`, `unrefuse` | `flow.spec` (empty) |
| Add a bill (from a row or by hand) | Flow            | `AddBill`                | `recurring.create`, `fromRow`, `likely`, `remove`                                            | `flow.spec` (typed) |
| Every movement in a month          | Flow            | `Movements`              | `logs.movements`, `recurring.fromRow`                                                        | `flow.spec`         |
| Name who a payee is                | Flow / check it | `Payees`                 | `payees.list`, `set`, `paypalNames`, `why.row`                                               | —                   |

## Portfolio: how are my investments doing

| Journey                                          | Screen    | Component   | Convex                                         | Test             |
| ------------------------------------------------ | --------- | ----------- | ---------------------------------------------- | ---------------- |
| Brokers, positions, P&L                          | Portfolio | `Portfolio` | `aggregate.positions`, `worth`, `invest.looks` | `portfolio.spec` |
| One position: price line, trades, delete a trade | Portfolio | `Portfolio` | `invest.priceLine`, `trades`, `removeTrade`    | —                |

## Known gaps

- Revolut stocks history: `HistoryReview` (in `Reading`, `Intake`) reads the trades but saves nothing.
- The crypto landing for Revolut says only "N added", with no coin values.
- `Intake.tsx`, `Bulk.tsx` and `Accounts.tsx` are split, one part per file
  (5 Oct). The session-guard hook names any file a branch touches that
  grows past 500 lines again.

# Broker cash: one Revolut card, two cash lines

Mockup: `design/treasury-mockup/broker-cash.html` (:3950). Artem walked it on
10 Oct and said "two lines win, go tests" — and "ui looks very bland … no
ticker icons, no visuals". The mockup draws grey squares where the app has
logos; the build uses the app's own parts (`TickerLogo`, `AccountLogo`,
`AccountCard`, `HoldingsSummary`), not the mockup's stand-ins.

## Journey

You moved money into Revolut's broker, or it is the monthly check-in. You
screenshot Revolut Invest and drop it into + ADD. You want one answer: does
the Revolut card now say what the Revolut app says? Today it cannot: the
card has one euro pocket, the bank's, and a broker screenshot's cash would
overwrite it (`confirmHoldings` → `writeBalance(…, 'EUR', cashEur)`).

His map of the money is in memory `money-map`: salary on BPI; spending from
ActivoBank and Revolut; Activo → Trade Republic; Revolut → its own broker.

## Decisions (his, 10 Oct)

- One Revolut card, two cash lines. Not a second account.
- The line is called "broker cash".
- Revolut holds about €6k in euros and the rest in dollars, and shows one
  number converted to euros. Both ways in: the Invest screen gives the one
  converted number; the Cash balance screen gives euros and dollars apart.
- Two exact lines win: once they exist, the Invest screen's single number
  never replaces them (it still updates positions). The Cash screen always
  replaces the single number.

## Two PRs

### 1a — the pocket, and the Invest screen

- Data: a second reading beside `balance:<accountId>:<CUR>` for an account
  that is both `bank` and `broker` — the broker's cash. Source 2 (state):
  the latest `stateSnapshots` row for its key. Read sites to follow:
  `convex/accounts.ts` (the key), `convex/aggregate.ts` (`accounts` pockets
  ~1525, `readCashHistory` ~1667, ~2156, the hero's "at brokers"),
  `convex/intake.ts` (`writeBalance`, `confirmHoldings`).
- A broker-only account (Trade Republic, Trading 212) is unchanged: its one
  cash line is already the broker's.
- Check (`HoldingsReview` / `HoldingsSummary`): for a bank-and-broker
  account the cash tile is "broker cash", with "Goes to broker cash. Your
  free cash at Revolut stays €X." Button: "save N positions and the broker
  cash".
- Card (`AccountCard`): "broker cash" line under "free cash"; the total
  includes it. Never read: the line says "never read" in amber, no number.
- Hero and worth chart: "at brokers" and the cash line include it from the
  day of the reading.

Scenarios (each an e2e test, mock data):

- S1 Invest screenshot into Revolut → check shows broker cash and the
  "stays" line → save: "saving…" at once, landed, closes → card shows both
  lines, free cash unchanged, total is the three added.
- S2 Never read → card says "broker cash never read"; total excludes it.
- S3 Same screenshot into Trade Republic → no "broker cash" wording, its
  free cash is written as today.
- S4 A failed save says so and writes nothing; a slow save shows pending.
- S5 Phone width and light theme: the card's lines keep their height.

convex-test: the write lands on the broker key and leaves the bank key;
another owner cannot read or write it; `accounts` returns both pockets;
"at brokers" includes it; a broker-only account is untouched.

### 1b — the Cash balance screen

- Reader: a holdings-kind reading may carry cash by currency (today only
  `cashEur`). The Cash screen has no positions; positions stay as they are.
- Card: "broker cash EUR" and "broker cash USD ≈ €…" at the stored ECB rate
  (source 4, as the other dollar pockets).
- Two exact lines win over the Invest screen's single number.

## Out of scope

- Deposits, dividends and fees from the stocks CSV as movements of this
  line, paired with the bank side, and Flow's "to brokers" (step 2).
- Portfolio combined across brokers: All | Revolut | TR | 212 (step 3).

## Questions

- Should the card get a small three-part bar (free cash · broker cash ·
  investments)? Recommended: yes — it is the one visual that says where the
  money sits, and it is a split of stored numbers, not a grade. Not in the
  mockup yet; needs his yes.

# A connected bank

Mockup: `design/treasury-mockup/bank-connected.html` (twelve situations, both
widths). Nothing is built. He marks the mockup up before any code.

## Journey (approved 11 Oct, "journey yes")

He opens Finances a few times a week and drops nothing. A connected
account shows its balance as the bank reports it, and when. New booked rows
arrive by themselves with the bank's own dates, through the same check as a
file (`docs/specs/2026-10-11-check-before-saving.md`); he is asked something
only when the sum does not add up. The app asks the bank when he opens
Finances and the last answer is hours old, and once a day by itself. Not
live. The first connect takes rows only from the balance the app already
holds. Every few months the bank wants his approval again: the card says so
with one button. Files stay for accounts that are not connected, and as the
fallback.

Why (11 Oct, after one ActivoBank screenshot wrote duplicates three times):
"can we use API?" A screenshot has no year, folds pending money into the
balance and dates rows ahead; the bank's own booked rows and balance remove
the reading step.

Where it stands on 11 Oct: Enable Banking application registered by him
(restricted production, Account Information only, his own accounts).
ActivoBank, Trade Republic and Revolut are linked there. BPI is not: its web
login does not work for him, only the phone app — it stays on files until
that is solved.

## What is kept

The account card as built (`AccountCard.tsx`): logo, badges, edit, the big
total, the 30-day line, free cash / broker cash / investments, "since 1
Oct", the cash bar. The check before saving and its words (was · out · in ·
now, new, already added, "Is this the same payment?", same payment / two
payments, "not saved — 1 question open"). The landed tick. The `Sheet`.
Only the card's footer changes, and one block grows into the card when rows
arrive.

## What the mockup shows

- **Footer of a connected card**: a green link and "from the bank · today
  14:05". No UPDATE where the bank reports everything the card shows
  (ActivoBank). Where investments still come from a screenshot (Trade
  Republic, Revolut), UPDATE stays and a small link beside "free cash" marks
  what the bank reports.
- **Checking**: lavender edge breathes, "checking the bank… · last 08:02".
  The number on screen is the stored one until the answer is in.
- **Rows arrived, they add up**: saved with no press. The card glides
  taller: "2 new", "✓ as the bank shows", was · out · in · now, and a ✕
  that closes it. It stays until closed.
- **A question**: amber breathing edge, "not saved — 1 question open",
  CHECK IT opens the built check window. Nothing of that account is written
  until answered. Apply → saving… → landed → closes; the card is up to date.
- **Approval ends soon / ended**: the day, and APPROVE. Ended keeps the last
  balance and says of when. APPROVE → three facts → the bank's own page →
  back → reading → landed with "approved until …".
- **Bank not reached**: "ActivoBank did not answer", "balance of today,
  08:02", TRY AGAIN.
- **Not connected**: the card as today, plus CONNECT beside UPDATE.
- **First connect**: the same window. Cancelled at the bank: "Not approved.
  Nothing changed." Two accounts at the bank and no number the app knows:
  "Which one is this card?"

## + ADD and UPDATE (his question, 11 Oct: "to not mess")

One rule: each number on a card has one source at a time, and UPDATE stays
on a card as long as something on it does not come from the bank.

- ActivoBank: all from the bank, no UPDATE. Trade Republic, Revolut: free
  cash from the bank; investments and broker cash from files, UPDATE stays.
  BPI, Trading 212: all from files, as today.
- - ADD is unchanged. Its account chips say where each is read from: a
    green link and "from the bank" or "cash", then what a file still brings.
- A file for a connected account is still taken (the fallback). It goes
  through the same check; rows the bank brought are "already added", and
  its balance never replaces a newer one from the bank.
- Trading 212 is not in Enable Banking. It has its own API and key: its
  own slice, and the key must be made with read permissions only.

## Connecting from the app (checked in Enable Banking's FAQ, 11 Oct)

What he did in Enable Banking's panel names the accounts the application
may read ("you can only fetch data from the specific accounts that have
been explicitly linked"). The app still asks each bank once itself: it
sends him to the bank's page, he approves, the bank sends him back, and
the app holds a session. Approval is set by the app and capped by the
bank — "for the majority of ASPSPs … 180 days" — and can end early; the
app is then told the session expired and shows APPROVE.

## Scenarios (each becomes a test; the bank is mocked, never his)

- S1 connected and fresh: the card shows the stored balance, "from the
  bank" and its time; no request leaves at render.
- S2 opening Finances with the last answer older than the limit starts one
  check; a second open inside the limit starts none.
- S3 rows arrive and add up → written once, balance is the bank's, the
  card shows new · was · out · in · now; the same answer again writes
  nothing.
- S4 a row the app already has under another name (the top-up, three days
  apart) → held, nothing written; "same payment" → apply → saving… →
  landed → closes → one row, balance right. "two payments" → both rows,
  the bank's balance wins.
- S5 no row explains it → held; save with the bank's balance, or skip.
- S6 approval ends within 7 days → the day shown; ended → no request is
  made, last balance kept with its time, APPROVE.
- S7 the bank does not answer (timeout, 5xx, limit reached) → last
  balance kept with its time, TRY AGAIN; a failed check writes nothing.
- S8 first connect: only rows after the balance already held; an account
  with no balance yet takes the bank's balance and no rows.
- S9 cancelled at the bank → nothing changed. S10 two accounts → asked
  once, remembered.
- S11 pending rows are never written; a row is written when booked.
- S12 many rows (a month, 60 rows): the card is the same size.
- Every write: pressed → "saving…" at once → landed tick → closes.
- Refusals (convex-test): another owner's link, a callback with a wrong
  `state`, a check while one is running, a check with approval ended.
- S13 a file for a connected account whose rows the bank brought →
  nothing new, nothing written; its older balance does not replace the
  bank's.
- Phone width; dark and light.

## Data — where each number comes from

- **The balance** is an external reading (source 4): the bank's number,
  stored as a `stateSnapshots` row for `balance:<accountId>:<CUR>` with
  `source: 'sync'` (already in the schema) and `recordedAt` = the time the
  bank answered. Stored, never fetched at render; attributed ("from the
  bank", the account's own name and logo); shown as of a time; nothing
  derived from it. The whole reading or none: a check that got the balance
  but not every page of rows writes nothing.
- **Rows** become `logs` rows only through the check; out and in on the
  card are log sums (source 1) over the rows that check called new, one
  currency, from the "was" day; every sum opens its rows.
- **was** is the state before the check; **now** is the bank's reading.
- **Approval day, last answer, last failure** are facts about the link,
  kept on a new `bankLinks` row (owner, account, bank, session, the bank's
  account id, valid until, last checked, last error). Not numbers about
  money.
- The private key and session never reach the client or the repo: a Convex
  environment variable he sets himself.

## How it would be built (for the slices, not for him)

Enable Banking: a signed token per request, start an authorisation → the
bank's page → back to a callback route with a code → a session with the
bank's accounts; then balances and transactions per account. In Convex: a
Node action for the calls, an internal mutation that feeds the rows into
the existing check, a daily cron, and `bankLinks`. No new dependency
expected (Node's own crypto signs the token) — to confirm when built.

Three slices, each under 600 lines: (1) connect, approve again, the stored
balance on the card; (2) rows through the check, the arrived block, the
question; (3) the daily check, not reached, ends soon.

## Out of scope

Payments of any kind. Trading 212 (its own API, its own slice). Holdings
from a bank link. Disconnecting (lives in EDIT; not drawn). The hero and
the chart. Pending money on the card (see questions). BPI's login.

## Questions, each with a recommendation

1. **How long an approval lasts, how many days of history, how many checks
   a day** — not known per bank. Recommend: read them from Enable Banking's
   bank list in slice 1 and store them on the link; until then the mockup's
   "Apr 9, 2027" and "every few months" are stand-ins. Changes on screen:
   only the date.
2. **Trade Republic and Revolut: cash only, or holdings too?** Not known.
   Recommend: assume cash only; the card keeps UPDATE for the broker
   screenshot, as drawn. If holdings do come, UPDATE goes from that card.
3. **Which balance when the bank gives two (booked, available)?**
   Recommend: the card shows the booked one — it is what the rows add up
   to — and pending money is left for its own small slice. Changes on
   screen: the card can be lower or higher than the bank's app by the
   pending amount until it books.
4. **How old before a check on opening?** Recommend 4 hours.
5. **How long "2 new" stays on the card** — decided 11 Oct: until he
   closes it with ✕. Rows that arrive before he closes it join the same
   block (was stays the first day).
6. **A "check now" button.** Recommend none: opening Finances is the
   button, and banks limit unattended checks.
7. **CONNECT on every card, or only where the bank is supported?**
   Recommend only where Enable Banking lists the bank.
8. **Revolut's dollars**: one link, two pockets. Recommend each currency
   checked on its own, as files are today.

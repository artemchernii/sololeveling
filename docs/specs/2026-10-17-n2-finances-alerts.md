# N2 — money alerts on the iPhone

**Status: approved 17 Oct** ("picks, plus C salary in, go"): A, B and C,
with the picks below for questions 2–4.

Journey (his words, 15 Oct): "Finances are going to be much more than 1s
of month and 7 days before expires … we have future spendings like I will
need to spend 200 euros and account has only 20 euros => reminder." And 4
Oct, on Flow: "Bills still to pay — make it with some color and icon
(this is important info)."

The moment: the phone is locked. Two days before a bill, at 09:00, it
rings if the account the bill is paid from does not have enough:
`Preply · €123.72 · 29 Oct` / `ActivoBank €78.39 · €45.33 missing`. You
tap it, Flow opens on that bill, you move €45.33 from BPI. If you already
topped the account up, it stays quiet. Rare: a few times a month at most.
The second moment: a bank's approval runs out every 90–180 days, and a
lapsed one means no rows. Seven days before and one day before, at 09:00:
`ActivoBank · approval until 24 Oct` / `7 days · APPROVE in Finances`. You
tap it, the account opens with APPROVE breathing.

Mockup: `design/notifications-mockup/n2.html` on :3965 (launch entry
`notify`). The ALERT row switches between the candidates, SHOW between
the states. Plan row N (N2).

## Candidates (my pick ★)

|     | Alert                                                                                       | When                                                                             | Source of the numbers                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★ A | **Missing for a bill** — `Preply · €123.72 · 29 Oct` · `ActivoBank €78.39 · €45.33 missing` | 2 days before the bill, 09:00 Lisbon; re-checked when it fires, quiet if covered | `buildAhead` (`src/lib/ahead.ts`): state (source 2, the account's balance) walked by his bills; the gap is the one Flow already shows as "€45.33 missing" (short-once spec, 11 Oct) |
| ★ B | **Approval ending** — `ActivoBank · approval until 24 Oct` · `7 days · APPROVE`             | 7 days and 1 day before `bankLinks.validUntil`, 09:00; quiet once approved again | the link's stored `validUntil` (entity state); "7 days" is a count of days to a stored date                                                                                         |
| ★ C | **Salary in** — `Salary in · €2,809.40` · `BPI · 25 Oct`                                    | when a bank row pays the salary recurring                                        | the row itself (source 1)                                                                                                                                                           |
| —   | (not proposed) a monthly sum on the 1st, a "spent this week" ping                           |                                                                                  | the first is what he said is not enough; the second is only allowed on Review                                                                                                       |

N3 (investments) and N4 (AI replies) stay out.

## Screens and files

Built simpler than first drafted: one job each morning instead of a job
re-planned on every bill, balance and link write — no hooks in the
dozen places that write a bill, and 30 runs a month.

- `convex/moneyAlerts.ts` — `keepMorning(ownerId)`: one scheduled job
  per owner at the next 09:00 Lisbon (`ctx.scheduler.runAt`, job id on a
  `moneyAlerts {ownerId, jobId, at, salaryFor?}` row; never two).
  Started by `push.subscribe`, and once after the deploy by
  `moneyAlerts:startAll`. `morning` (action): asks the bank (`pull` from
  `bankRows.ts`) for the accounts that pay a bill in the next two days
  and for the salary account while the salary is not in, then `send`
  decides on fresh balances, notifies, and schedules tomorrow's.
- `convex/aggregate.ts` `moneySoon()` — the AHEAD walk (`buildAhead`)
  for two days, balances (accounts with a pocket never read left out),
  and logged rows for the salary.
- `convex/schema.ts` — `notificationKind` gains `money_missing`,
  `bank_approval`, `salary_in`; the `moneyAlerts` table.
- `src/lib/moneyAlert.ts` — pure: `nextMorning` (09:00 across the clock
  change), `daysTo`, the words. Unit-tested.
- `/phone` (`PhoneWindow`) — three more source rows: `Money for a bill ·
2 DAYS BEFORE · 09:00`, `Bank approval · 7 DAYS · 1 DAY BEFORE`,
  `Salary · WHEN IN · 09:00`. Static ON like the N1 rows; no switches.
- Bell (`Bell.tsx`) — icons for the three kinds (warn, warn, good).
- Taps: A → `/finances?room=flow`; B and C → `/finances`.
- Journey map: three rows in `docs/journeys/notifications.md`.

## Scenarios

- S1 a bill of €123.72 two days out from an account with €78.39 →
  `money_missing` "Preply · €123.72 · 29 Oct" / "ActivoBank €78.39 ·
  €45.33 missing". (convex-test)
- S2 the account topped up to €278.39 → quiet. (convex-test)
- S3 two bills short in one account → one alert, the whole gap; the body
  shows what the account has now. (convex-test)
- S4 a bill with no account, or a balance never read → quiet; a bill
  three days out → not yet. (convex-test)
- S5 a device on → one job at the next 09:00; subscribing again → still
  one; after the morning → tomorrow 09:00. (convex-test)
- S6 approval until 3 Nov on 27 Oct → `bank_approval` "ActivoBank ·
  approval until 3 Nov" / "7 days · APPROVE"; 1 day → "1 day"; 3 days →
  quiet. (convex-test)
- S7 /phone ON shows the three new rows. (e2e, N1 S2)
- S8 a bill two days out bigger than the account → the bell shows the
  row → a tap opens Flow. (e2e `money-alerts.spec.ts`)
- S9 another owner's short bill never reaches mine. (convex-test)
- S10 a row pays the salary → `salary_in` "Salary in · €2,809.40" /
  "BPI · 26 Oct", once; not in yet → quiet. (convex-test)

No write is pressed on screen in N2.

## Data

A's €78.39 is state (source 2, the latest balance) and €45.33 is the gap
`buildAhead` already computes for Flow — nothing new derived. B's date is
the stored `validUntil`; "7 days" counts days to it. Times are 09:00
Lisbon.

## Out of scope

Investments (N3); AI replies (N4); quiet hours; switches per source;
choosing the 09:00 or the 2 days on screen (fixed until he asks); the
tapped bill lit on Flow and APPROVE breathing on the account (the
mockup's taps) — Flow and Finances open, the row is not singled out yet.

## Decisions (17 Oct, his "picks … go")

1. **Which alerts in N2?** His answer: A, B and C.
2. **How early for A?** Pick: 2 days before, 09:00 — time to move money
   from BPI; once, not again on the day.
3. **Read the bank before deciding A?** The balance is the last reading,
   which may be days old. Pick: yes — the 09:00 job first asks the bank
   for today's balance (one Enable Banking call per account due), then
   decides, so it never rings for money already moved.
4. **B's two marks?** Pick: 7 days and 1 day before.

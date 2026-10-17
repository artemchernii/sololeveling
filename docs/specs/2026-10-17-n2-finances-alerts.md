# N2 — money alerts on the iPhone

**Status: draft, waiting on Artem's picks and his "go" on the mockup.**
Nothing is built.

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

| | Alert | When | Source of the numbers |
|---|---|---|---|
| ★ A | **Missing for a bill** — `Preply · €123.72 · 29 Oct` · `ActivoBank €78.39 · €45.33 missing` | 2 days before the bill, 09:00 Lisbon; re-checked when it fires, quiet if covered | `buildAhead` (`src/lib/ahead.ts`): state (source 2, the account's balance) walked by his bills; the gap is the one Flow already shows as "€45.33 missing" (short-once spec, 11 Oct) |
| ★ B | **Approval ending** — `ActivoBank · approval until 24 Oct` · `7 days · APPROVE` | 7 days and 1 day before `bankLinks.validUntil`, 09:00; quiet once approved again | the link's stored `validUntil` (entity state); "7 days" is a count of days to a stored date |
| C | **Salary in** — `Salary in · €2,809.40` · `BPI · 25 Oct` | when a bank row pays the salary recurring | the row itself (source 1) |
| — | (not proposed) a monthly sum on the 1st, a "spent this week" ping | | the first is what he said is not enough; the second is only allowed on Review |

N3 (investments) and N4 (AI replies) stay out.

## Screens and files (A + B)

- `convex/moneyAlerts.ts` — internal `plan(ownerId)`: reads his bills
  and balances once, finds the next 09:00 that is 2 days before a bill
  with an account (A) and the next 7-day / 1-day mark of any link (B),
  and keeps **one scheduled job per owner** (`ctx.scheduler.runAt`, job
  id on a `moneyAlerts {ownerId, jobId, at}` row; replaced, never
  stacked). `fire(ownerId)`: re-reads, sends what is still true through
  `notifyOwner` (kinds `money_missing`, `bank_approval`), calls `plan`
  again.
- Triggers for `plan`: a bill saved / removed (`recurring`), a balance
  changed (`bankRows.arrive`, `intake.finish`, typed balance), a link
  landed (`bank.land`). No cron (N1b rule, free-plan reads).
- `convex/schema.ts` — `notificationKind` gains `money_missing`,
  `bank_approval`; the `moneyAlerts` table.
- `src/lib/moneyAlert.ts` — pure: `nextMissing(ahead, now)` and
  `approvalMarks(validUntil)`, the 09:00 Lisbon wall clock via
  `remindAt.ts` `OWNER_ZONE`; the title/body words. Unit-tested.
- `/phone` — two more switch rows, `Money for a bill · 2 DAYS BEFORE ·
  09:00` and `Bank approval · 7 DAYS · 1 DAY BEFORE` (the N1 switch rows).
- Tap targets: `/finances?tab=flow&bill=<id>` (the row glows, as the
  mockup) and `/finances?account=<id>` (APPROVE breathing).
- Journey map: two rows in `docs/journeys/notifications.md`.

## Scenarios

- S1 a bill of €123.72 on 29 Oct paid from an account with €78.39 → a
  job at 27 Oct 09:00; fired → `money_missing` "Preply · €123.72 · 29
  Oct" / "ActivoBank €78.39 · €45.33 missing". (convex-test, fake timers)
- S2 the account topped up to €278.39 before 27 Oct → fired → nothing
  sent, the next job planned. (convex-test)
- S3 two bills short in the same account and month → one notification,
  the month's whole gap (same rule as Flow's one tag). (unit)
- S4 a bill with no account, or a balance never read → no alert. (unit)
- S5 a bill moved or removed → the job moves or goes; never two jobs for
  one owner. (convex-test)
- S6 a link `validUntil` 24 Oct → jobs at 17 Oct and 23 Oct 09:00;
  approved again before 17 Oct → quiet; fired → `bank_approval`
  "ActivoBank · approval until 24 Oct" / "7 days · APPROVE". (convex-test)
- S7 a switch off on `/phone` → that kind is not sent; the bell keeps
  the rest. (e2e + convex-test)
- S8 tap → Flow opens with that bill row lit; tap → the account opens
  with APPROVE. (e2e from rows an e2e helper writes)
- S9 another user's bills or links never reach this owner's job.
  (convex-test)
- Bell rows (N1 S5) cover the new kinds; phone width and dark: S7, S8.

No new write is pressed on screen except the switches (S7: pressed →
"saving…" → ON/OFF lands).

## Data

A's €78.39 is state (source 2, the latest balance) and €45.33 is the gap
`buildAhead` already computes for Flow — nothing new derived. B's date is
the stored `validUntil`; "7 days" counts days to it. Times are 09:00
Lisbon.

## Out of scope

C unless he picks it; investments (N3); AI replies (N4); quiet hours;
choosing the 09:00 or the 2 days on screen (fixed until he asks).

## Questions (each with my pick)

1. **Which alerts in N2?** Pick: A and B. C (salary in) later, if he
   misses it.
2. **How early for A?** Pick: 2 days before, 09:00 — time to move money
   from BPI; once, not again on the day.
3. **Read the bank before deciding A?** The balance is the last reading,
   which may be days old. Pick: yes — the 09:00 job first asks the bank
   for today's balance (one Enable Banking call per account due), then
   decides, so it never rings for money already moved.
4. **B's two marks?** Pick: 7 days and 1 day before.

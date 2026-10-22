# N3 — investment alerts on the iPhone

**Status: approved 22 Oct** ("A B C, your picks", then "go — build N3 as
the mockup, yes CLAUDE.md line for earnings" on
`design/notifications-mockup/n3.html`, :3967, launch entry `notify-n3`;
his "you know im a big fan of logos" put the company's mark on the bell,
the share and the Mac push).

Journey: the phone is locked, 09:00. Last night's closes are stored
(22:30 UTC). It rings for a share he holds when (A) its results are two
days away, or its first close after results is in; (B) its ADD / HOLD /
WAIT changed with that close; (C) that close moved 5% or more on the one
before. A tap opens the share on Portfolio. Rare: a few a month.

## Moments

|            | Push                                                                            | When                                                                    | Numbers                                                              |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A soon     | `Netflix · earnings 20 Oct` / `In 2 days · NFLX`                                | the morning 2 days before the results day (Lisbon days)                 | the date, fetched (CLAUDE.md 22 Oct line), not stored                |
| A reported | `Netflix reported · ▼ 5.3%` / `Was $1,180.40 · 20 Oct · now $1,117.80 · 21 Oct` | the morning after the first stored close after the report               | two stored closes (`between()`), both shown                          |
| B          | `ASML · HOLD → ADD` / `SMA 200 bullish · RSI 41 · was HOLD`                     | the newest close changes `callOf()` from what the closes before it gave | `verdict()` on stored closes and fundamentals, twice; nothing stored |
| C          | `Tesla ▼ 6.2%` / `$248.10 · 20 Oct → $232.70 · 21 Oct`                          | the newest close is 5% or more from the one before                      | two stored closes, both shown                                        |

A close counts only on the first morning after it (newer than 24 h), so
a weekend says nothing twice. A second run the same day skips a push
already in today's bell (same kind and title).

## Files

- `src/lib/investAlert.ts` — pure: `bigDay`, `callTurn`, `earnSoon`,
  `reported`, the words, `plainCompany`. Unit-tested.
- `convex/investAlerts.ts` — `investMorning(ctx, ownerId, now)` from
  `moneyAlerts.morning` after the money alerts (no new job): held
  instruments (`aggregate.heldInstruments`), each one's year of closes
  and latest fundamentals (`shareFacts`, one query per share like MINE's
  `callFor`), earnings fetched for the shares (`earningsOf`, canned on
  E2E), then `send` writes the bell rows and pushes.
- `notifications.share` (optional `{ symbol, type, name }`) — the bell
  draws the company's mark with the kind in its corner; `pushNode`
  sends it as the push's `icon` (Mac shows it; iOS shows only the app's).
- `notificationKind` + `earnings`, `call_change`, `big_day`.
- `/phone` three rows: `Earnings · 2 DAYS BEFORE · REPORTED · 09:00`,
  `ADD · HOLD · WAIT · WHEN IT CHANGES · 09:00`, `Big day · ±5% · 09:00`.
- Taps: `/finances?room=portfolio&position=<instrumentId>`.

## Scenarios

- S1 closes ending +6% on the one before, newest 10 h old → `big_day`
  "Microsoft ▲ 6%"; 4% → quiet; newest 30 h old → quiet. (unit + convex-test)
- S2 the newest close turns HOLD into ADD → `call_change`; same call →
  quiet. (unit)
- S3 results in 2 days → `earnings` soon; in 3 → quiet. (unit)
- S4 first stored close after results → reported with both closes; the
  second close after → quiet. (unit)
- S5 a run twice in a day → one row. (convex-test)
- S6 another owner's share never reaches mine. (convex-test)
- S7 /phone ON shows the three rows. (e2e notifications S2)
- S8 a held share's big day → the bell row with its logo → a tap opens
  the share on Portfolio. (e2e `invest-alerts.spec.ts`)

No write is pressed on screen in N3.

## Cost

Inside the 09:00 job: about 15 held shares × ~250 closes ≈ 3,800 small
documents, ~1 MB a day, ~30 MB a month (3% of the free 1 GB); one
Yahoo quote call and one calendar call per share, nothing stored.

## Out of scope

RSI and 52-week pushes (in B already, or noisy); a sell push; amounts in
euros on a push; switches per moment; choosing 09:00 or 5% on screen.

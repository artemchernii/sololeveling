# Earnings dates on MINE

Mockup: `design/treasury-mockup/earnings.html` (the tabs mockup, opened on
3 MINE). Agreed idea 21 Oct; mockup waits his "go".

## Journey

He opens INSIGHTS → 3 MINE, a few times a week, to see how the money
moved. A box that fell hard raises "why?" — the first answer is usually
"it reported". A company about to report raises "should I wait before
adding?". So: each held company says its results day on its box, and a
tap says the rest. Next he either leaves it, or asks ✦ ASK "why did NFLX
drop?", and the answer starts from the report.

## Screen

- A ribbon across the top of a company's box (shares only; funds, coins,
  gold, frozen none):
  - `● EARNINGS 28 OCT` amber, the dot pulsing — next report within 14 days;
  - `● REPORTED 20 OCT ▼ 7.8%` red / green — last report within 7 days,
    the move since the close before it.
  - Further away: no ribbon (Q1).
  - Narrow box: shorter words (`EARNINGS 28 OCT` → `28 OCT`;
    `20 OCT ▼ 7.8%` → `▼ 7.8%`), measured, never cut.
- Tap the ribbon → a card: NEXT `28 OCT · AFTER CLOSE`, IN `7 DAYS`, DATE
  `CONFIRMED` / `ESTIMATE`, LAST `30 JUL`; or DAY `20 OCT · AFTER CLOSE`,
  CLOSE 20 OCT `$1,212.40`, NOW · 21 OCT 21:40 `$1,117.80`, SINCE
  `▼ 7.8%`. Foot `YAHOO · FETCHED 21:40 · NOT SAVED`.
- POSITIONS ⓘ: one sentence on what the date means; its now line lists
  them.
- Yahoo not answering for earnings: no ribbons, the foot says
  `EARNINGS NOT REACHED` in red; the moves and verdicts stay.

## Data

External readings, fetched on open, never stored, kept on the page 10
minutes with the rest of MINE's answer (`useMine`). Yahoo quoteSummary
`calendarEvents` (next date, estimate flag) and the quote's
`earningsTimestamp` for the last report (to confirm on the first real
call — Yahoo rate-limited the probe on 21 Oct). The close before the
report from Yahoo's chart (daily, 1 month); "now" the latest price the
same call returns. The move is two fetched prices, both on the card (the
Insights rule: "the change over a period is two fetched prices with both
shown").

READ (`marketFacts`) and ASK (`marketAsk` context) get one fact per
company with a ribbon: `earn-NFLX` → `REPORTED 20 OCT · CLOSE $1,212.40 ·
NOW $1,117.80 · ▼ 7.8%`, `earn-MSFT` → `EARNINGS 28 OCT · CONFIRMED`.

## Files

`convex/insightsMine.ts` (the `mine` action gains `earnings` on the first
ask; canned on E2E=1), `src/lib/insightsEarnings.ts` (parser, window,
move — pure), `Mine.tsx` (`Box` ribbon + card), `marketRead.ts` /
`marketAsk.ts` facts, `docs/journeys/finances.md` MINE row.

## Scenarios

- S1 shares reporting soon and just reported → ribbons with the right
  words and colours; funds and coins none.
- S2 tap a REPORTED ribbon → card with both prices and the day.
- S3 no company in the window → no ribbons, nothing else changes.
- S4 Yahoo earnings not reached → `EARNINGS NOT REACHED`, boxes as before.
- S5 phone width → short words, nothing cut.
- S6 ASK facts include `earn-` lines (unit, `marketAsk.test`).
- Unit: parser on Yahoo shapes (one date, a date range, missing), window
  edges (14 / 7 days), move from two closes, before-open vs after-close
  base day.

## Questions

1. Window: next 14 days and last 7 (recommended — a box only speaks when
   it matters), or always a date on every company. Both in the mockup's
   `earnings:` switch.
2. CLAUDE.md "Insights" lists the market data allowed; earnings dates are
   not in it. Proposed line, same PR: "earnings dates of held companies,
   with the move since the last report as two fetched prices, both
   shown". Needs his yes.

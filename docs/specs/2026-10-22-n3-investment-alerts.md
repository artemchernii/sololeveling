# N3 — CLOSE, the day's report at 21:30

**Status: approved 22 Oct.** N3 began as three separate pushes at 09:00
("A B C, your picks"; mockup `design/notifications-mockup/n3.html`), then
became one report: "maybe 21:30 we get notification with main thing =>
report of the day: my holdings + major news", "report opens in Insights
as CLOSE, one push at 21:30, rules 1 and 2 as you say", "maybe add small
block for overall market news?", "go — build CLOSE as the mockup"
(mockup `design/treasury-mockup/close.html`, :3950). Rules in CLAUDE.md
("CLOSE, the day's report").

Journey: 21:30, the US has just closed. The phone rings once:
`Close · ▼ €102.40 · 1.6%` / `TSLA ▼ 6.2% · ASML HOLD → ADD · NVDA ▲ 4.1%`.
A tap opens Insights tab 5 CLOSE: worth now and at the close before,
every share's move biggest first with its moments as badges, the
market's day, the headlines. A minute, then closed. Trading days only.

## Moments (badges on CLOSE, words on the push)

| Moment                    | Badge             | Push                   | From                                         |
| ------------------------- | ----------------- | ---------------------- | -------------------------------------------- |
| big day, ±5%              | `BIG DAY`         | `TSLA ▼ 6.2%`          | the newest stored close on the one before    |
| the call changed          | `HOLD → ADD`      | `ASML HOLD → ADD`      | `callOf()` with and without the newest close |
| results in 2 days         | `EARNINGS 24 OCT` | `NFLX earnings 24 Oct` | the date, fetched, never stored              |
| first close after results | `REPORTED ▼ 5.3%` | `NFLX reported ▼ 5.3%` | two stored closes                            |

A close counts on the evening it is made (newer than 24 h). The push
names the moments first, then the biggest movers, three in all.

## Files

- `src/lib/investAlert.ts` — pure: the moments, `badgeOf`, `closePush`,
  `nextEvening` (21:30 across the clock change). Unit-tested.
- `convex/aggregate.ts` `dayClose` / `dayCloseFor` — each share held, its
  latest price and the last close before midnight, both worths (rule 1).
- `convex/closeReport.ts` — `keepEvening` (one job per owner,
  `closeJobs`; started by `push.subscribe`, `closeReport:startAll` once
  after the deploy), `evening` → `ringClose`: today's prices
  (`market.readAll` pricesOnly), the day, the moments, one `day_close`
  push a day → `/finances?room=insights#close`. `badges` and
  `marketNews` for the tab, fetched on open.
- `src/components/finances/insights/Close.tsx` (+ `insights-close.css`),
  tab 5 in `InsightsTabs.tsx`, its badge the day's %. Indices from MARKET's
  1D answer; headlines from `news.of` for the three biggest movers and any
  company reporting, and `closeReport.marketNews`.
- Bell: `day_close`, red with ▼. `/phone`: `Close · TRADING DAYS · 21:30`.

## Scenarios

- S1–S4 the moments, quiet cases included (unit).
- S5 one push a day, one 21:30 job kept (convex-test).
- S6 another owner's shares never reach mine (convex-test).
- S7 /phone shows the CLOSE row (e2e notifications S2).
- S8 the 21:30 job → the bell row → a tap opens CLOSE (e2e `close.spec.ts`).
- S9 the push's words; the 21:30 clock (unit).
- S10 worth now and at the close before (convex-test).
- S11 a weekend: no price today, no push (convex-test).
- S12 CLOSE shows the day, the BIG DAY row, the market, the news (e2e).

No write is pressed on screen.

## Cost

The 21:30 job: ~15 Yahoo price reads, then about 1 MB of Convex reads
(a year of closes per share for the call). Opening CLOSE: the same
moments read once (kept 10 minutes), the day as a reactive query (the
positions read plus one close per share), and Yahoo calls for news.

## Out of scope

RSI and 52-week moments; a sell push; switches per moment; choosing
21:30 or 5% on screen; a model's summary of the news (never).

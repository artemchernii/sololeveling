# Finances B — the chart as on :3950

Plan: `docs/specs/2026-09-29-finances-truth-then-looks.md`, step B. Artem,
1 Oct: "do we have divided cash / investments in graph like in 3950?" — no:
the Overview chart draws free cash only. This builds the mock's chart.

## The moment

He opens Finances → Overview to see how his money has moved — all of it,
or only the cash, or only the shares — over a month or a year. Opens on
**TOTAL, 1Y**, as the mock does. A few times a week.

## What gets built

1. **A year of closes.** A new ticker today reads 3 months back
   (`market.ts` `HISTORY_RANGE = '3mo'`; 25 tickers hold ~67 closes each).
   Raise it to 1 year, and a one-off backfill reads the year for every
   ticker he already holds. Same table (`prices`), same source line
   ("Yahoo Finance"), source 4's four conditions unchanged.
2. **Past exchange rates.** A US share on 3 March is worth its close times
   that day's USD rate, not today's. Store a year of ECB daily rates
   (Frankfurter's time series) as `fxRates` rows, one per day — the same
   table the daily job already writes.
3. **`aggregate.worthHistory`** — per day: free cash (today's
   `cashHistory`, unchanged), invested (shares held that day from his
   trades × that day's close × that day's rate), total = the two. No close
   that day (weekend, holiday) → the last close before it. A ticker with
   no close at all yet → that day's invested is left out, and the chart
   says so, never guessed.
4. **The chart** (`WorthChart.tsx`) gets the mock's switch: TOTAL · FREE
   CASH · INVESTED, colours as the mock (cash gold `--money-cash`,
   invested and total lavender), opens on TOTAL · 1Y. The heading's change
   keeps leaving joins out (`rangeChange`).

Files: `convex/market.ts`, `convex/aggregate.ts`, `convex/crons.ts` (if
the backfill is scheduled), `src/lib/cashHistory.ts` (the pure per-day
invested sum), `src/components/finances/WorthChart.tsx`, tests beside each.

## Done when

- Side by side with :3950 in the browser pane, on his data, and he says
  it matches.
- One day's TOTAL traced by hand to its rows, closes and rate, written down.
- Typecheck, lint, tests green; a `convex-test` case for `worthHistory`
  including another owner's rows.

## Open questions (my recommendation first)

1. **Positions with no buy date** — shares first seen on a holdings
   screenshot (`trades.opening`). Before that day their worth is unknown.
   _Recommend:_ treat them like an account joining — they start on that
   day and are kept out of the change. (His TR positions all have dated
   orders from the statement, so today this touches nothing; it will
   matter for Revolut.)
2. **Past rates as source 4.** A year of ECB rates is ~250 rows per
   currency. _Recommend:_ yes, stored and attributed like today's.
3. **Backfill once or nightly?** _Recommend:_ once when a ticker arrives
   (as now, but 1Y), plus one run for what he holds today. The nightly job
   stays as is: it adds the day's close.

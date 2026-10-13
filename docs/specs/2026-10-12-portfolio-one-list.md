# Portfolio: the one list (slice a)

Journey (`2026-10-04-portfolio-insights-journey.md`; his "go" on the
mockup `design/treasury-mockup/portfolio.html`, 12 Oct): he opens
Portfolio a few times a week, after a buy or when the market moved, and
wants one list of everything he owns across all brokers — each with what
it is worth in euros and whether it is up or down since bought.

Screens/files: `Portfolio.tsx` (room), `PortfolioList.tsx` (the list and
its row, new), `src/lib/owned.ts` (one row a thing, new). No Convex
change: `aggregate.positions` already carries every row.

Scenarios:

- S1 nothing owned → "Nothing owned yet" and where positions come from.
- S2 one broker → no account cards' filter pills needed beyond its own;
  rows show euros first, shares small underneath; title "everything
  owned · N".
- S3 the same company at two brokers → one row, both brokers' marks,
  "2 accounts", sums of worth and cost (unit: `owned.test.ts`; no mock
  with two brokers yet, so not in e2e).
- S4 sort: biggest · up most · down most; a row with no gain known last.
- S5 filter: an account pill or card, a kind in the split's legend;
  pressing the chosen one again clears it.
- S6 a row pressed opens its buys and sells in place, per account (the
  page of its own is slice b).
- S7 no price → the worth the broker showed, "no price" in amber; no
  gain against a cost that is not known.
- Phone width: no sideways scroll; sparkline hidden.

Data: worth and cost are sums of `aggregate.positions` rows (source 1/4
as today); the gain is pick D (26 Sep), only where cost is known.

Out of scope: the one-position page (b), logos (c), sold positions (the
query returns only what is still owned — needs its own read), the dollar
line on rows (not in the mockup he approved), Insights, indicators.

After his go he asked for more (12 Oct): RSI and moving averages as
toggles, news, "a helper" — Portfolio and Insights should "help me
invest, track my holdings and follow what is going on on the market and
trends". Those are numbers worked out from prices, and a new outside
source: CLAUDE.md's "not a licence to derive" forbids them today. Asked
him to allow them as a written rule before any is built.

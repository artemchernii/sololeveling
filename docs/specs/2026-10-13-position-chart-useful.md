# The position chart, useful

Mockup: `design/treasury-mockup/chart.html` (:3950). Artem said "go" to it
on 13 Oct, after pressing compare and ruler (#188) on localhost.

## Journey

He opens one position to decide whether to buy more or to understand what
happened to it. His words on what was built: "it looks a bit raw to me,
not useful".

- "i zoom out and see gaps like we never show older chart" — he expects
  the years before.
- "when i hover dot i expected something like tooltip" — what he bought,
  said at the dot.
- "candles? volume?"
- "we want euros and dollar" — both, his pick: in the tooltip and the
  line of words; the axis stays in the share's own currency.
- "I hope its not gonna make DB full in a week" — the free plan is the
  limit (1 GB of reads a month, 890 MB used by 4 Oct).

## Three PRs, each from master, in this order

### A. A box at the dot, euros beside dollars (no schema change)

- `PriceChart`: a box at the dot within 9px of the pointer (`nearMark`):
  "bought €650.00 · 18 Mar 2026" / "at $118.17 · €106.31 a share". The
  line of words reads the day only (both currencies); the bought/sold chip
  leaves it.
- The header's price shows the euro price beside the dollar one.
- Euros: `invest.priceLine` returns each close with the euro price worked
  out on the server from the stored ECB rate of that day (`fxRates`, the
  same conversion the position's worth already uses). A share quoted in
  euros shows one currency, never "€x · €x".
- Scenarios: S1 hover near a buy → box with amount, day, both prices;
  S2 hover a day → both currencies in the line of words; S3 a euro share →
  one currency; S4 a day with no stored rate → the dollar price alone, no
  made-up euro; S5 phone width, the box stays inside the plot; S6 the line
  of words keeps its height.

### B. Candles and volume

- `prices` gains optional `open`, `high`, `low`, `volume` (same Yahoo
  answer, same `source`, source 4). `market.ts` stores them on every read.
  Rows stored before have none: one re-read of the year for a share when
  its page is opened and its rows lack them — never for all shares at once.
- Pills: line / candles, and volume, as the mockup. Candles only where
  every bar in view has all four; else the pill is not shown.
- Line of words gains "· 199K shares traded" when volume is lit.
- Scenarios: S1 candles lit → candles; S2 volume lit → bars under the
  line and the key "shares traded that day"; S3 a share with closes only →
  no candles pill; S4 tools and the box still work on candles.
- convex-test: the re-read writes the four fields, writes nothing twice,
  refuses another user's instrument.

### C. Older years behind "all"

- New table `priceYears`: one record per share per past calendar year —
  `ownerId`, `instrumentId`, `year`, `bars` (day, open, high, low, close,
  volume), `rates` (day → euros per unit, ECB), `source`, `fetchedAt`;
  index `by_owner_instrument_year`. A past year never changes, so its
  query never re-runs.
- Read from Yahoo (`range=5y`) only when he presses "all" on a share that
  has none stored; "reading…" on the pill at once, the chart grows when it
  lands. Five years, not everything.
- The chart never shows empty space before the first stored day
  (`fixLeftEdge`).
- Scenarios: S1 press all on a share with one year → pending → five years;
  S2 press again → nothing read; S3 Yahoo fails → the pill says so, the
  year stays; S4 zoom out stops at the first stored day; S5 a share that
  is two years old → two years, no gap.
- convex-test: stored once, not for another user, a second ask reads
  nothing.

## Data

Every number is source 4 (stored, attributed, as of a day) or a trade row
(source 1). The euro price is the stored price times the stored rate of the
same day, done in Convex, as the position's worth already is. Compare and
ruler keep their 13 Oct conditions. No indicators.

## Reads (the free plan)

Opening a position: the year's rows as today (≤ 400) plus, after "all", at
most five `priceYears` records. No query reads history for more than one
share. Check `npx convex logs` for the read size of `priceLine` before and
after B.

## Out of scope

RSI, moving averages, news, the facts box. A € / $ switch for the axis.
History for shares he has not opened.

## Questions

- Sold shares (151): same "all" on demand? Recommendation: yes, same rule.
- Crypto and gold: Yahoo gives the same bars; candles yes, volume only
  where Yahoo sends it.

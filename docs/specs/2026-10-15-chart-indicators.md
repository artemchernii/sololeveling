# Chart lines: AVG BUY, SMA 50, SMA 200, RSI 14, 52W, and ? cards

Portfolio helper, part 1 of 3 (part 2 news, part 3 his tags and the map).
Mockup: `design/treasury-mockup/indicators.html` (on :3950).

## Journey (his words)

- 12 Oct, on the Portfolio mockup: "add some RSI, moving averages (but
  we can have like a toggles) … portfolio and insights should help me
  invest, track my holdings and follow what is going on on the market".
- 13 Oct: "i want to have more advanced charts that are useful"; then
  "yes indicators, yes news, yes average price"; he wants "info on
  stocks, useful indicators" to "help me … understand what to do with
  asset".

The moment: he opens one position from Portfolio — a few times a week,
after the price moved or before he buys more. He wants to know, on the
chart he already uses: is today's price above or below what he paid
this round; where it sits against its 50- and 200-day averages; whether
RSI is high or low. Then he decides — buy more, wait, nothing — or
drags COMPARE / RULER over the part that caught his eye.

## Screen

The built chart (`PriceChart`, `ChartTools`), unchanged, plus a second
row of pills under PRICE: `AVG BUY` · `SMA 50` · `SMA 200` · `RSI 14` ·
`52W` · `?` (15 Oct: "go: cards + 52W").

- All off on every open. A pill carries its line's colour as a short
  stroke; lit when on.
- AVG BUY: a dashed lavender line from the round's first day to now,
  labelled `AVG BUY` on the price axis; the key reads
  `AVG BUY $396.88 · €348.24 · 3 BUY · SINCE 22 JUN 2026`. No pill when
  nothing is held (sold out) or no buy is stored.
- SMA 50 / SMA 200: one line each, labelled on the axis; key
  `SMA 50 · 50 closes`. SMA 200 the first time on a page with one year
  loaded: the pill spins `reading…` while older years are read
  (`useOlderYears`, as ALL does), then the line draws.
- RSI 14: its own pane under the price, 0–100, dotted guides at 30 and
  70 in ink; key `RSI 14 · 14 closes · 30 / 70`.
- 52W: two dotted ink lines over the last 52 weeks, `52W HIGH` and
  `52W LOW` on the axis; key `52W HIGH $495.17 · 29 Oct 2025 · 52W LOW
$384.89 · 22 Jun 2026`.
- `?`: cards under the key, one per line — title, one plain sentence
  of what it is, today's numbers side by side with a state
  (`PRICE ABOVE`, `BETWEEN 30 AND 70`), one sentence of why it
  matters. A lit line's card is lit. Sentences allowed here (15 Oct:
  "sometimes when they needed - fine do it"; plain, never LLM wording).
- The reading line above the chart adds each lit line's value for the
  day under the pointer, in its colour: `SMA 50 $439.62`.
- Colours never good or bad: new tokens `--ind-50` (hue 225),
  `--ind-200` (335), `--ind-rsi` (195), clear of good/danger/warn.
- Works in LINE and CANDLES, with VOLUME, in both themes and at phone
  width (pills wrap).

## Data

- SMA, RSI: from stored closes only (`prices` / `priceYears` via
  `invest.priceLine` and `priceYears.line`) — the CLAUDE.md exception
  written in this PR. `sma(closes, n)`, `rsi(closes, 14)` (Wilder) in
  `src/lib/indicators.ts`. Nothing stored, nothing graded.
- AVG BUY: `avgBuy()` in `src/lib/indicators.ts` from the open round
  of `rounds()` (`src/lib/rounds.ts`): the buys' euros (each to the
  cent, as PAID) ÷ the shares bought; rewards and splits left out. In
  the chart's currency each buy at its own day's stored rate
  (`priceLine`'s `eur` ÷ `price` on that day's close).
- 52W: `yearRange()` — highest and lowest stored close of the last 364
  days with their days; `% from high` is `between(high, latest)`.
- No Convex change.

## Scenarios (e2e, mock data)

- S1 position with closes and buys: AVG BUY on → the line drawn
  (`data-lines` on the plot lists `avg`), key shows `AVG BUY` with
  `3 BUY · SINCE`; off → gone.
- S2 SMA 50 on → line drawn, key `SMA 50 · 50 closes`; off → gone.
- S3 RSI 14 on → its pane drawn, key `RSI 14 · 14 closes · 30 / 70`;
  off → gone.
- S4 sold-out position: no AVG BUY pill.
- S5 52W on → both lines and their key; `?` → five cards with today's numbers.
- S6 page opened again: every pill off.
- Units: `sma`, `rsi` against a known series (the 14-day RSI example
  from Wilder's book / StockCharts table), `avgBuy` with a closed round
  before, a reward, a sell inside the round.

## Out of scope

News (part 2), tags and the map (part 3), any score, signal or
"buy / sell" word, other periods.

## Questions

AVG BUY on a dollar chart: each buy at its own day's stored rate, and
sky / pink / teal — both recommended, taken with his go.

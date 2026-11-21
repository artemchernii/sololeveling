# Watchlist

Journey (31 Oct "yes to all", 1 Nov "go" on the mockup
`design/treasury-mockup/watchlist.html`): a name catches his eye on
MARKET (MOVERS, OPPORTUNITIES) or he types it. He presses ★. From then
its daily close is stored like a held one's, so it has a chart, signals
and ADD / HOLD / WAIT. Portfolio shows a WATCHLIST, one row per name;
🔔 a price rings the phone once when the stored close crosses it. Max 20.
In TARGET, a bucket's press lists its watched names under the held ones.

Screens/files:

- `watches` table (one row per owner and instrument; the alert on it)
- `convex/watch.ts`: `list` (reactive: name, latest stored price, the
  close before it, alert), `facts` (action on open: per name a year of
  stored closes → 52W low/high, vs high, call, bull/bear counts — like
  MINE's `callFor`), `add`, `remove`, `setAlert`, `clearAlert`;
  `ids` for the nightly check and the 21:30 job
- `market.readAll` reads watched names with held ones
- `closeReport.ringClose` rings a hit alert as its own push (`watch_hit`)
- `src/lib/watch.ts`: `factsOf`, `sideOf`, `hitOf` (pure, tested)
- `WatchList.tsx` on Portfolio under the map; `WatchStar.tsx` on MOVERS
  and OPPORTUNITIES rows; `WatchPosition.tsx` (a watched name's page:
  head, chart, signals, fundamentals, news — no trades); TARGET's bucket
  press lists watched names (`TargetMap.tsx`)
- Journey map: `docs/journeys/finances.md`

Scenarios (each becomes an e2e test, `e2e/watchlist.spec.ts`):

- S1 none watched → WATCHLIST 0 / 20 and the places ★ is
- S2 three watched → a row each: LAST in its currency, DAY ▲/▼ %,
  52W RANGE low–high with the dot, VS HIGH %, SIGNAL ADD/HOLD/WAIT with
  N BULL · N BEAR, ALERT
- S3 ★ on a MOVERS row → saving (star spins) → ★ lit and
  `✓ AMD · WATCHLIST · 4 / 20` → the row is on Portfolio
- S4 20 watched → ★ refused: `★ 20 / 20 · FULL`, nothing saved
- S5 🔔 ALERT → field with LAST and 52W → SAVE: saving… at once, SAVED
  tick, closes; the row says `≥ €150` or `≤ €55`; REMOVE takes it off
- S6 a stored close past the alert → the 21:30 job rings once:
  `🔔 NOVO · CLOSE €54.70 ≤ €55`, body day and the close before; the row
  says `HIT ≤ €55` with the day; not rung again
- S7 ★ on a row → off the list (closes kept)
- S8 a row pressed → its page: chart, signals, verdict, no trades
- S9 TARGET, STOCKS pressed → HELD then ★ WATCHLIST with their calls
- S10 phone width

Data: the price, the close before and the year of closes are source 4
(stored by the nightly check, Yahoo). 52W, VS HIGH, signals and the call
are `yearRange`, `signals`, `verdict` — the rules already allowed for a
position's chart (15 Oct), now for a watched name too: **needs a
CLAUDE.md line**. The alert price is his own number, like a target.

Cost: the nightly check reads up to 20 more tickers (one Yahoo call
each, ~20 rows written a night); ★ reads a year once (~250 rows, one
mutation). `list` reads ~5 closes per name (≤100 rows, reactive);
`facts` ~250 per name on each Portfolio open (≤5,000 rows, ~0.7 MB).

Out of scope: ★ in ASK answers (no ticker block there yet), rings
during the day, fundamentals read for a name before its page is opened.

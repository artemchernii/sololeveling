# Fundamentals and news on a position

Portfolio helper, part 2 (after #224, the verdict). Fills the verdict's two
`NEXT` feeds. Mockup: `design/treasury-mockup/fundamentals.html` (on :3950),
built from the approved and built `verdict.html`.

## Journey (his words)

- 15 Oct, on the verdict: "if you can give good signals technical +
  fundamentals (btw good idea) + news we actually gonna do that as well
  and tell me overall idea what is the best to do".
- 13 Oct, on news: "we dont want to store news, we simply fetch it and
  show".
- 15 Oct, after #224: "after this we probably gonna do fundamentals and
  news".

The moment is the verdict's own: he opens one position a few times a week,
when he has money to put in or the price moved, and wants to know whether
now is a good time to add shares. Today the answer reads only the chart.
With this slice it also checks what analysts and the company's revenue say,
and the day's headlines sit one tab away, so he does not open Yahoo in
another window to check before he buys.

## Screen

The built page, with these changes:

1. **The verdict moves above the tabs**, so it stays in view on every
   tab. Its content is as built, plus:
   - three more reason chips after the three lines: `TARGET ▲ +20.0%`,
     `REVENUE ▲ +22.0%`, `RATING ▲ BUY 1.6`, each coloured by its own
     reading; the ones that made the call wear the verdict's ring;
   - feeds row: `TECHNICAL 1 ▲ 1 ▼ 1 —` · `FUNDAMENTALS 3 ▲ 0 ▼ 0 — ·
YAHOO · 16 OCT` (opens the tab) · `NEWS · 8 · NOT IN THE RULE`
     (outlined, opens the tab). A fund: `FUNDAMENTALS · NONE FOR A FUND`,
     dashed. **Colour by count** (17 Oct, his ask): more ▲ than ▼ green,
     more ▼ red, even amber; the counts always inside the chip; a group
     that held an ADD back is never green (amber at best). On a phone the
     `· YAHOO · day` tail is dropped (the tab header has it);
   - RULE gains one HOLD row, tagged `FUNDAMENTALS`.
2. **Tabs**: `SIGNALS` · `FUNDAMENTALS 3 ▲ 0 ▼ 2 —` · `NEWS 8` ·
   `BUYS & SELLS 5`. Sold out: SIGNALS and BUYS & SELLS only.
3. **FUNDAMENTALS tab**: header `YAHOO FINANCE · 16 OCT 2026 · 08:10 ·
STORED · ONCE A DAY`; five rows in the SIGNALS anatomy (icon, name +
   sub, badge, number, picture):
   | Row                                                                    | Badge                | Number                           | Picture                                          |
   | ---------------------------------------------------------------------- | -------------------- | -------------------------------- | ------------------------------------------------ |
   | ANALYST TARGET · mean of 41                                            | UPSIDE / DOWNSIDE    | `+20.0%` · `$412.50`             | analysts' low–high bar, mean tick, price dot     |
   | ANALYST RATING · 41 analysts · 1 to 5                                  | Yahoo's word (BUY …) | `1.6` mean                       | strong buy / buy / hold / sell counts as one bar |
   | REVENUE · Q3 2026 on Q3 2025                                           | GROWING / SHRINKING  | `+22.0%`                         | the two quarters' revenue                        |
   | P/E · price ÷ earnings                                                 | NOT IN THE RULE      | `33.8` next 12 months            | last 12 months `88.4`                            |
   | DIVIDEND YIELD                                                         | NOT IN THE RULE      | `0.69%` · `$2.36 a share a year` | ex-dividend day                                  |
   | A fund: one row `NO FUNDAMENTALS · FUND`. Analysts' "mean" reads       |
   | `AVG` (17 Oct: "what is mean?").                                       |
   | **ⓘ on P/E and DIVIDEND YIELD** (17 Oct, his ask): beside the `NOT IN  |
   | THE RULE` badge; hover or tap opens a card: what it is in one plain    |
   | line with this company's number worked through (`33.8 = $33.80 for     |
   | every $1 of profit in the next 12 months`), three bars —               |
   | `BROADCOM 33.8` · `SEMICONDUCTORS AVG 31.2` · `S&P 500 AVG 22.4` — one |
   | line on why this sector sits where it does, and the source line        |
   | `SECTOR AVG · DAMODARAN · NYU STERN · JAN 2026`.                       |
4. **NEWS tab**: header `YAHOO FINANCE · 8 HEADLINES · 10:05 · NOT STORED`;
   rows = publisher chip, headline (two lines at most), `PUBLISHER · time`
   (time today, day before), link out in a new tab. States: none
   (`NO HEADLINES · 30 DAYS`), not loaded (warn icon, `NEWS NOT LOADED ·
YAHOO FINANCE`, `TRY AGAIN`), loading (five shimmer rows).
5. **Motion**: chips and feeds arrive one by one after the badge; range
   and rating bars grow in; the price dot slides to its place; an
   updating reading breathes a lavender dot.

## The rule (goes in `src/lib/indicators.ts`, `verdict()`)

The lines first, exactly as built. Then, **only when the lines say ADD**
and fundamentals exist and are at most 7 days old, checked top to bottom:

| Verdict    | When                                               | Line on screen                                                                                                                                             | Chip ringed |
| ---------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| ADD → HOLD | price ≥ analysts' mean target                      | Long trend up with a dip, and the price is at or above the analysts' mean target of $331.00. By the textbook, keep the shares; no room left to the target. | TARGET      |
| ADD → HOLD | revenue growth < 0 (last quarter on a year before) | Long trend up with a dip, and revenue fell 4.0% on a year before. By the textbook, keep the shares until revenue grows again.                              | REVENUE     |
| ADD → HOLD | rating mean ≥ 3.5 (Yahoo's underperform or sell)   | Long trend up with a dip, and most analysts rate it sell. By the textbook, keep the shares; no new ones against the analysts.                              | RATING      |
| ADD        | none of the above                                  | the lines' ADD line, as built                                                                                                                              | all three   |

Fundamentals can hold an ADD back; they never make one, and never touch a
HOLD or WAIT from the lines. P/E and dividend yield are shown, not read by
the rule (no textbook level fits every company). News is not an input.
A fund, a missing reading or one older than 7 days: the lines alone, and
the feed says which.

## Data (CLAUDE.md four sources)

- Fundamentals: **external reading**, new table `fundamentals` — one row
  per ticker per reading: `ownerId`, `ticker`, `asOf`, `source: 'yahoo'`,
  target mean/low/high/count, rating mean + four counts + key, revenue
  growth + the two quarters, forward and trailing P/E, dividend yield,
  rate, ex-day. Fetched by a Convex action from Yahoo `quoteSummary`
  (`financialData`, `recommendationTrend`, `summaryDetail`, `earnings`)
  when the position opens and the latest row is older than a day — the
  `prices.refresh` pattern, one pending reading at a time. Index
  `by_owner_ticker_asOf`; the page reads the latest row only (free-plan
  reads).
- `+20.0%` on the target: the difference between two stored readings
  (target mean, latest stored price) — needs the exception below.
- Sector averages in the ⓘ cards: a second **external reading** — the
  industry averages Aswath Damodaran (NYU Stern) publishes each January
  (P/E and dividend yield by industry, plus the whole market). Stored as
  rows in a `sectorAverages` table with source and year, refreshed once a
  year; Yahoo's `industry` on the position picks the row. Numbers in the
  mockup are sample. Shown only in the card, never in the rule.
- News: a Convex action calls Yahoo search news for the ticker on open and
  returns at most 8 items (title, publisher, time, link); nothing written,
  no summary, no AI.

## Proposed CLAUDE.md wording (for his "go", not committed)

Under "Reality over gamification", after "A call to act":

> **Fundamentals** (16 Oct, "go" on the mockup `fundamentals.html`): an
> analyst target (mean, low, high, count), an analyst rating (mean and the
> counts), revenue growth (last quarter on the same quarter a year
> before), P/E (next and last 12 months) and dividend yield, as external
> readings on the four conditions: stored in `fundamentals`, one row per
> reading, never edited; attributed to Yahoo Finance; shown with their
> day; derived only as the target's distance from the latest stored price
> (`between()`). Only on one position's verdict and its FUNDAMENTALS tab.
> They feed `verdict()` by the rows written in `src/lib/indicators.ts`:
> they can turn an ADD into a HOLD, never make an ADD; older than 7 days
> they do not feed it. Sector averages for P/E and dividend yield
> (Damodaran, NYU Stern, yearly) are external readings on the same four
> conditions, shown only beside the company's own number in its ⓘ card.
>
> **News** (13 Oct, "we simply fetch it and show"): headlines with
> publisher, time and link, fetched on open, never stored, never
> summarised, not an input to the verdict.

## Scenarios (e2e on mock data)

- S1 mock AVGO, closes for ADD, readings agree → `ADD`, six chips (last
  three ringed), FUNDAMENTALS feed with the day; RULE lists four rows.
- S2 closes for ADD, price above mean target → `HOLD`, TARGET chip ringed
  red, the fundamentals HOLD row lit. S3 revenue down → same with REVENUE.
  S4 rating 3.6 → same with RATING.
- S5 closes for HOLD / WAIT with any readings → the lines' call unchanged.
- S6 fund → no fundamentals chips, `NONE FOR A FUND`, tab shows the one
  row; verdict from the lines.
- S7 readings 8 days old → lines only, feed shows the old day in warn.
- S8 NEWS: 8 rows (canned action), each link opens a new tab; none;
  failed → `TRY AGAIN` re-fetches; slow → shimmer, then rows.
- S9 FUNDAMENTALS refresh slow → yesterday's row shown at once with
  `UPDATING`, then the new day.
- S10 sold out → no FUNDAMENTALS / NEWS tabs. Phone width, light theme.
- Unit: `verdict()` every new row and edges (price = target, growth = 0,
  rating = 3.5, 7 vs 8 days); the Yahoo parsers on saved sample JSON.
- convex-test: `fundamentals.refresh` owner-scoped, one pending reading,
  refuses another user's ticker.

## Out of scope

News feeding the verdict; earnings day; sector or peer comparisons; P/E
in the rule; fund facts (expense ratio, holdings); alerts.

## Questions (each with my pick)

1. News beside the verdict, not in the rule? **Pick: yes** — not stored,
   so a call made from it could not be checked later.
2. Fundamentals only hold an ADD back, never make one? **Pick: yes** —
   the lines decide timing, the fundamentals veto a bad company.
3. The verdict above the tabs (moved out of SIGNALS)? **Pick: yes**, so it
   stays in view on FUNDAMENTALS and NEWS.
4. The rating badge uses Yahoo's word (`BUY`), which is also the trade
   badge's word. **Pick: keep it** — it sits in its own row under ANALYST
   RATING, with the avg beside it.
5. Sector averages from Damodaran's yearly tables (free, attributed,
   dated) rather than computed from other tickers. **Pick: Damodaran** —
   a named source, no averaging of our own.

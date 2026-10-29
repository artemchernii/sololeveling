# IDEAS — the board with a chat beside it (29 Oct)

Approved: "alright lets build and see how it goes after" on
`design/treasury-mockup/ideas-board.html` (round 4). Earlier rounds in
the same folder: `ideas-better.html` (cards), `ideas-chat.html` (chat
only — rejected: "IDEAS are not only chat").

## Journey (his yes, 29 Oct)

1. He opens Finances → Insights → IDEAS most days, after CLOSE or when
   something happens. Without asking he sees: how much cash is idle, the
   plan for it, what to add to among his own stocks, what protects him,
   two or three new names, the market and the movers.
2. He wants to dig into one line: presses ✦ on it. The chat docked on
   the right opens on that line and answers with words, charts, tables.
   He can drop a screenshot there.
3. Once a day he presses READ AGAIN. The board stays as it is until then.

His words that shape it: "Like I need you to be my assistant", "you
always tell me BUY S&P500 etf", "HOW TO INVEST SOME PART SAFELY BUT SOME
PART TO MAKE MONEY", "Ideas need context of my stocks. Give ideas to ADD
some stocks, to add gold or buy BONDS", "more of explanation why you
suggest those tickers and why that much money", "emojis … too childish",
"Remove that crap not advice and web always".

## The screen (match the mockup)

Two columns on desktop: board ~⅔, chat ~⅓ sticky. Phone: one column,
floating ✦ ASK opens the chat as a bottom sheet.

Board, top to bottom:
1. **Head**: `CASH · NOT INVESTED €X · Y%` (app's numbers), two plain
   sentences from the model, model · time, ↻ READ AGAIN. Bar KEEP /
   PROTECT / ADD / NEW with € each. Market strip of 8 (S&P 500, Nasdaq,
   Dow, Russell 2000, 10Y, VIX, gold, Bitcoin): value, day change, a
   sparkline.
2. **ADD TO MINE** — his holdings only. Line: logo, name/ticker, held €
   and % of MINE, sparkline, today + two signal chips, ADD/HOLD/WAIT, +€,
   ✦; under it WHY (words), € reason (words), ▸ NUMBERS (facts list).
3. **PROTECT** — gold (held), cash that pays (e.g. XEON), short bonds
   (e.g. IBGS, IB01). Same line.
4. **NEW** — 2–4 not owned; the held column says `<AREA> x% MINE · y%
   WORLD` from the app's allocation.
5. **MOVERS · US** — TRENDING / GAINERS / LOSERS, 10 chips each, MINE
   marked, ✦ on press.

No emoji in the UI; line icons (+, shield, compass) and logos.
Words: badges and numbers on the board; the model's WHY / € lines and
chat answers may be sentences (CLAUDE.md "IDEAS, the board").

## Numbers and where they come from

- Cash idle, total, spending a month, holdings, % of MINE, allocation vs
  world: the app's existing queries (Overview / Flow / MINE). Read once.
- Prices, day change, sparklines, signals (RSI 14, SMA 200, 52W),
  targets, P/E, yields: fetched in one Convex **action** on open (Yahoo,
  as MARKET and positions already do), signals from
  `src/lib/indicators.ts` on the fetched closes. Never stored, kept on
  the page ≤10 min.
- Movers: Yahoo trending and predefined screeners (day_gainers,
  day_losers), same action. Unofficial: a failed list shows ❔ NO DATA.
- The plan (parts, lines, calls, € amounts, WHY, € reason, NUMBERS as
  text): the model's, stored as one read row like the market read (check
  how `marketRead` is stored and reuse it), shown with model · time ·
  tokens. Tickers it names are validated against Yahoo before showing;
  a line whose ticker does not resolve is dropped.
- **Convex cost**: no reactive query over fetched data, nothing fetched
  is written. The only writes: one read row per READ AGAIN. Say the cost
  line on deploy.

## The model's job (prompt)

Inputs: idle cash split (banks / broker cash), monthly spending (bills +
day-to-day), holdings with € and %, allocation vs world, today's CLOSE
moves, earnings facts, the strip, movers, web search (always on).
Output, checked like `marketRead.ts` checks its answer:
- `take`: two sentences — a real opinion about his money.
- `parts`: keep / protect / add / new with € sums that add up to the idle
  cash (checked; reject otherwise).
- `lines[]`: part, ticker, call (add|hold|wait), eur (0 for hold/wait or
  a staged amount), why, eurWhy, numbers[] (each a fact key or a sourced
  claim). ADD TO MINE only tickers he holds; NEW only tickers he doesn't.
- Rules in the prompt: think across stocks, gold, bonds, cash that pays,
  regions; never only "buy an index fund"; size by % of MINE and stage
  big amounts; never a sell.

## ASK, docked

Reuse `src/lib/marketAsk.ts` and the I4 ASK code: web search on, no 🌐
switch. ✦ passes the line (ticker, part, call, €, why) as context.
Answers can carry blocks: text, chart (ticker(s) + period, fetched by
the app), table, idea card. Screenshot: drop or 📎, sent to the model
with the question (localhost path through Claude Code can read images;
check the deployed path), not stored. Thread stays on the page.

## Order of work (one PR at the end, his "works" first)

1. Fetch action: strip + movers + per-ticker closes/quote/fundamentals;
   unit tests for parsing; render strip + movers (no model yet).
2. Board read: prompt + checker (`src/lib/ideasRead.ts` + tests, canned
   answer for e2e), stored row, READ AGAIN, head + four parts.
3. Lines: signals from fetched closes, WHY / € / NUMBERS, ✦.
4. Docked ASK with line context, web always, screenshots.
5. Phone sheet. Remove the old Ideas cards and the 🌐 switch.
6. e2e on the mock backend with canned model answers (`e2e` skill):
   board renders, READ AGAIN shows saving → landed, ✦ opens chat on the
   line, NO DATA path.

## Done when

He opens IDEAS on localhost with his dev data, sees the board from his
real holdings, presses ✦ on a line and gets an answer with a chart, and
says "works".

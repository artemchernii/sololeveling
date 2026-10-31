# MARKET round 2 — the whole market

Mockup: `design/treasury-mockup/market-world.html` ("Go, build it", 31 Oct).

Journey (his words): "Market is to track what is going on. We want to find
opportunities and understand market … We dont have that info now."
Opened a few times a week, mostly at the weekend or after the US close. It
answers, in order: what happened (the week's biggest stories, whole
market, HELD only a badge), who moved (by region), what is coming (next 7
days), where an opportunity may be ("good company down but still good
investments, and cheap companies with good targets", "not only stocks in
US but EU/Asia/Brazil, and bonds/gold/silver"), and what moved his own
holdings this week ("keep my companies but show CURRENT WHAT HAPPEND this
week that really influenced my holdings").

## Parts

1. **THE TREND, flags and the world** (built): 13 markets in STOCKS ·
   BONDS · METALS · MONEY; SVG flags (`country-flag-icons`), two for a
   pair, a tag (TECH, 10Y); drawn gold and silver bars; MSCI World a globe.
   New: Nikkei 225, Hang Seng, Bovespa, Latin America 40 (ILF), silver.
   Yahoo has no Merval or Bund yield. US inflation falls back to FRED's
   CPIAUCNS when BLS is not reached (`BLS · FRED`).
2. **MOVERS** (built): US · EUROPE · ASIA · SOUTH AMERICA, the five up and
   five down over the week from each region's biggest companies, both
   closes and the base day on the row, the newest Yahoo headline under the
   name. Asked per region, ten minutes in page memory, never stored.
3. **THE WEEK, whole market**: stories from market-wide facts (movers,
   reporters) — one EARNINGS story and one CRASHES story with a row per
   company, `52W LOW` / `BEAT` badges, ⓘ WHY IT MATTERS. Next.
4. **OPPORTUNITIES**: DOWN FROM HIGH · CHEAP · TARGET ABOVE · BONDS · GOLD
   · SILVER, stocks by region. Needs a CLAUDE.md rule before building.
5. **COMING** (next 7 days: Finnhub earnings calendar, Fed/ECB/BoE, CPI,
   jobs) and **MINE · THIS WEEK** (cards for holdings that moved 5% or had
   news; the full table behind ▸).

## Scenarios

- S1 THE TREND: 13 cards in four groups; STOXX 600 the EU flag, EUR / USD
  two flags; silver `$46.20`. (`insights.spec` S1)
- S5 phone width: no sideways scroll, with MOVERS. (`insights.spec` S5)
- S7 MOVERS: READING, then five up and five down, RDDT first down with
  `$100.00 → $75.90`, its headline and publisher; a row with no headline
  has no line; ASIA not reached → `✕ NOT REACHED`; back to US from page
  memory. (`insights.spec` S7, `movers.test`)
- US inflation from FRED when BLS gives nothing. (`insightsMarket.test`)

## Data

Every number is an external reading fetched on open, attributed, with its
time, never stored (CLAUDE.md, Insights: market data). A week's move is
two fetched closes, both shown.

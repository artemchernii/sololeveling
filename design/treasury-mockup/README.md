# Treasury mockup (27 Sep)

The Finances ("Treasury") page as Artem approved it — the bar the app is
built to. Served by `.claude/launch.json` config "treasury" on :3950.

- `index.html` — the whole page, four rooms (Overview, Flow, Portfolio,
  Insights). Sample numbers, not his data. He likes its hero, tabs,
  worth chart and account cards more than the first build.
- `hero.html` — the hero as re-mocked and approved on 27 Sep: dynamic
  check-in, animated + add, three fixed rows (Investments / Banks / Cash)
  that open sheets, and the day-one setup (files first, or by hand in
  three steps). Built in the app as TreasuryHero.tsx and Setup.tsx.
- `add-empty.html` — the + sheet as it opens, before any row (27 Sep, approved
  and built as AddDrop.tsx): a four-step strip, his accounts with what each is read
  from, a "last read" line, a breathing lavender edge. Four situations; after a drop the
  existing reading screen takes over.
- `holdings.html` — the check-it screen for a broker screenshot (27 Sep, in
  review): total / invested / free cash on top, saved in one press with
  nothing typed, "what you paid" unknown until a statement fills it in
  (never doubles shares), rows fixed behind a tap. Five situations.
- `bulk.html` — bulk update (3 Oct, in review): many statements dropped
  at once, read and sorted into accounts, one review per account (the
  year month by month, new vs already-had rows, does it add up), moves
  paired across files, only-you-know questions, one APPLY. Nine
  situations. Journey: docs/specs/2026-10-03-bulk-update-journey.md.
- `dollar.jpg` — his header photo (also public/finances/dollar.jpg).

Rule (CLAUDE.md, 27 Sep): journey, then a mockup here he marks up, then
code that matches it — compared side by side before it is called done.
- `accounts-chart.html` — chart by account (3 Oct): one line per account on Overview's chart, joins tagged, own moves marked, tap a point for its rows. Journey: `docs/specs/2026-10-03-chart-by-account-journey.md`. Sample numbers.
- Bands or lines (3 Oct): after the first build looked "bad as fuck" on his data, three drawings were compared on his real numbers in a scratch page (never committed — real balances): A stacked bands, B small charts, C cleaned-up lines. His pick: keep lines, add A, a toggle; bands by default.
- `flow.html` — Flow (3 Oct, in review): the month in one line on top, then three tabs — AHEAD (default) · SPENDING · MOVEMENTS — each carrying one line of what is inside, a warning included; AHEAD first (his words: "show future spendings, especially reoccurring") — this month's recurring payments in full, later months folded to what differs (yearly bills, an account short on the day), free cash with everything in by default (bills, salary, and the rest as a range from the last three real months; a toggle shows bills and salary alone), bills found by themselves (NEW, × not a bill), one the app cannot know added by tapping a past payment → repeats, or + BILL, which opens with the likely bills from his statements (typing only for one not paid yet), subscriptions a year, "what I pay this year"; WHERE IT WENT with six months per group; MOVEMENTS — every account in one list, moves as one grey row, a day strip. Seven situations. Journey: `docs/specs/2026-10-03-flow-journey.md`.
- `stock.html` — one position opened from Portfolio (3 Oct, first draft, journey still owed): logo chosen by what it is (company site / ETF issuer / coin / letters, said which), price with its source and time, stale price in amber, value · paid · gain · share of invested, chart with his buys and sells and the average paid, market facts (company: cap, P/E, earnings; ETF: tracks, cost a year, biggest inside; coin: from the high). Five situations: US stock, EU ETF, crypto, frozen share, price is old.
- `flow-month.html` — Flow's top line reworked (4 Oct, in review): the pay month, salary to salary; LEFT UNTIL the next salary first, then salary + in, bills (tap for the list) and day-to-day; day-to-day against the last pay month at the same day; six pay months as bars — in beside bills under day-to-day — with a tooltip on hover. Five situations.
- `flow-spending.html` — SPENDING reworked (4 Oct, in review): the pay month opened — every bill (paid with its statement line, still to pay in amber), day-to-day by group biggest first, each group opening its rows (account, day, what the bank wrote) with last month's figure beside it, and money in. Pay-month pills.
- `payees.html` — payees (4 Oct, in review): tap a payee's name → "Who is this?": his name, the logo found from it, the group (a new Learning), part of a bigger thing; PayPal named per mandate code, not all of PayPal; known shops recognised with no question; Portuguese bank phrases proposed as plain names; Mortgage as one bill in two parts. The bank's words always kept underneath. Five situations.

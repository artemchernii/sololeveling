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

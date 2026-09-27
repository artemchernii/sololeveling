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
- `dollar.jpg` — his header photo (also public/finances/dollar.jpg).

Rule (CLAUDE.md, 27 Sep): journey, then a mockup here he marks up, then
code that matches it — compared side by side before it is called done.

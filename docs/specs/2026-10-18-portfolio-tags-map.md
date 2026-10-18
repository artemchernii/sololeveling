# Portfolio: tags and map

Journey (17–18 Oct, "tags + map"): he opens Finances → Portfolio wanting
to know where his money is — how much in tech, gold, the US. He presses a
part of the bar and the list keeps only those positions. Every row carries
its two tags. Once or twice a week, when deciding what to add next.

Mockup: `design/treasury-mockup/tags-map.html` (:3950) — direction A of
four, emoji marks ("go emoji"), funds say ETF ("fund make ETF").

Screens/files: `PortfolioMap.tsx` (`MoneyMap`, `TagChips`, `PartPill`,
`useTags`), `Portfolio.tsx` (the bar by kind moved into `MoneyMap`),
`PortfolioList.tsx` (a pressed part filters), `src/lib/tags.ts`,
`convex/sector.ts` (`tags`, `askAll`, `readProfile`, `storeProfile`),
`instruments.country` / `countryReadAt`.

What he sees:

- Under worth: `WHERE THE MONEY IS` and a KIND · SECTOR · REGION switch;
  KIND is the bar as built.
- SECTOR / REGION: parts with an emoji, `TECH €… · 57%`, MISSING last
  in amber. A press dims the rest and keeps its rows; the list title
  gets `EUROPE ✕`, which clears it. Sold rows are left out under a
  sector or region.
- Each row: two coloured tags, e.g. `💻 TECH` `🇪🇺 EUROPE`,
  `📈 ETF` `🇺🇸 US`, `🪙 COIN` `⚪ NO COUNTRY`, `⚠️ MISSING`.

Data (CLAUDE.md four sources): each part is the sum of its positions'
`valueEur` (state × external reading), as the bar by kind already was.
Tags are labels, not numbers: a share's sector and country are Yahoo's
(`assetProfile`), read once and stored with their day; a fund's from
words in its name (`fromName`, `REGION_WORDS`); a coin or gold has no
country. Nothing is derived beyond the sum.

Scenarios (`e2e/portfolio-tags.spec.ts`, mock `e2eTags.tagged`):
S1 rows carry both tags; not read is MISSING twice.
S2 SECTOR → tech 57% → press → 3 rows.
S3 REGION → us 71% first, missing last → press europe → 2 rows.
S4 the `EUROPE ✕` pill clears it.
S5 phone width.
No write is pressed by him: `askAll` runs by itself on open.

Out of scope: a country split inside a fund; a world map picture.

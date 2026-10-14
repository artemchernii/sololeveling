# A position's head: currency chip and sector badge

Journey: he opens one thing's page from Portfolio and wants to see at a
glance what it is and what it is in — "MSFT is tech, VDPG is Asia
Pacific" — and in which money its price is. He reads it, then goes on
to the chart and the buys. Every time a page opens; nothing to press.
Mockup: `design/treasury-mockup/position-rounds.html`, tab "4 · head
line" (on PR #217's branch); his word: "go, funds from the name".

Screens/files: `HeadLine` in `src/components/finances/PositionHead.tsx`
(replaces the `<p>` in `PortfolioPosition`), `Bars` in `Logo.tsx`;
`convex/sector.ts` (`of`, `ask`, `read`, `store`); `src/lib/sector.ts`
(`fromName`, `fromYahoo`, `parseSector`); `instruments.sector`,
`sectorFrom`, `sectorReadAt`; journey row in `docs/journeys/finances.md`.

Scenarios:
S1 a fund named "… Asia Pacific ex Japan", priced in USD → its page →
`ETF · 🌐 ASIA PACIFIC · VDPG · $ USD`; hover on the badge names the
fund's name as its source. [one] e2e position-head.spec
S2 Gold (a metal) → `GOLD` once, bars icon, metal colour, `€ EUR`; no
second GOLD badge. [one] e2e position-head.spec
S3 phone width → the line wraps, nothing cut. [phone] e2e screenshot
S4 a share (EQUITY) → Yahoo's search is read once, its `sector` stored
as `yahoo`; asked again → nothing read. convex-test sector.test
S5 a name with nothing known in it → stored as read, no badge, never
asked again. convex-test sector.test
S6 another user's instrument → `ask` refuses, `of` returns null.
convex-test sector.test
S7 the test backend never calls Yahoo. convex-test sector.test
No write he presses: the read happens on open, so no saving/landed.

Data: a label, not a number — none of the four sources is needed. It
keeps their pattern anyway: read once, stored on the instrument with
where it came from (`sectorFrom`: `yahoo` | `name`) and when
(`sectorReadAt`), never fetched at render.

- shares: Yahoo `v1/finance/search` `sector` (works with no crumb).
- funds and everything not a share: words in the name — Yahoo has no
  category for his London funds (fundProfile empty for VDPG, VUAA,
  SHLD, IGLN).

Out of scope: picking a sector by hand when none is found (the mockup's
"one press to pick"); reading again when Yahoo changes its sector;
sector on the Portfolio list rows.

Questions: none open.

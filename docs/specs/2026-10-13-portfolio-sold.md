# Portfolio: what was sold, and codes without the exchange

Journey: he opens Portfolio to see what he owns. Under the list he wants
to find what he no longer owns — "did I make money on Shopify?" — press
it, and read what it was bought for, what it was sold for, and its buys
and sells. The mockup `design/treasury-mockup/portfolio.html` (situation
"sold", his "go" of 12 Oct) is the bar.

Screens/files: `PortfolioList` (fold "sold · N", `SoldRow`),
`PortfolioPosition` (sold tiles, tag), `PositionTrades` (split out),
`Portfolio` (a sold thing has a page), `src/lib/sold.ts`,
`aggregate.positions` (returns `sold`), `holdingLine.codeOf`. Journey map:
`docs/journeys/finances.md`, Portfolio table.

Scenarios:

- S1 nothing sold → no fold under the list.
- S2 one thing sold out → "sold · 1", closed; pressed, it opens a row:
  name, code, "all sold <day>", "sold for €X", "bought for €Y".
- S3 the row → its page: tag "all sold <day>", worth now €0, bought for,
  sold for, up or down when sold, the price line, bought and sold.
- S4 the page's address alone opens it; an address of nothing still says
  "Not owned now".
- S5 sold in one account, still owned in another → an owned row, not sold.
- S6 sold, but the buys are not in the files → "bought for —", no up or
  down.
- S7 gone from the broker's list with no sale in the files → sold, "sale
  not in the files yet".
- S8 an account filter or a kind filter narrows the sold rows too.
- S9 a fund's code reads VUAA, not VUAA.L; a coin's reads SOL; BRK-B stays.
- S10 phone width: nothing runs off the side.

No write in this slice.

Data: "sold for" and "bought for" are sums of trade rows (shares × the
euro price of each), source 1 on its five conditions: euros, all time,
only stored rows, the page lists every row, nothing derived beyond the
difference the mockup shows. "Bought for" is given only when the buys in
the files cover the shares sold. The price is source 4, as on an owned
page. Read inside `aggregate.positions` from rows it already loads — one
more price row a sold thing, no second pass over trades.

Out of scope: the facts box, the average buy price line, the "all" range,
indicators, news, the empty state's two buttons.

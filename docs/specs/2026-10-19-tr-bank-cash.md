# Trade Republic's cash from the bank

Mockup: `design/treasury-mockup/cash-lines.html` (:3950). Artem, 19 Oct:
"go — TR balance only, screenshot keeps positions".

## Journey

Trade Republic's card shows a free cash typed or read off a screenshot
days ago. He linked TR in his Enable Banking application on 11 Oct. He
wants the card to show what TR shows, with no screenshot for the cash.
CONNECT on the card, TR's own page, back. From then on the cash line
says where it came from (a green link) and the footer says
`from the bank · today 09:12`. Positions still come from a screenshot or a
statement: UPDATE stays.

## What Enable Banking gives for Trade Republic

Per TR's TPP guide (v2.3.1): the cash account only (IBAN, current and
available balance, booked rows). No securities. Consent is 90 days, not
180, so APPROVE comes back every three months.

## Decisions (his, 19 Oct)

- **Balance only.** A broker's bank rows are buys and sells that the bank
  calls payments. Saved as rows, they would be spending. `bankRows.begin`
  asks a broker-only account for no rows. Its rows stay with its
  statement.
- **A screenshot keeps positions.** Once connected, a screenshot or a
  statement does not write a broker's cash (`writeHoldings`). The check
  shows `FROM THE BANK €727.49` and `on the screen €120.00 NOT SAVED`.
  The button reads `save N positions`.
- Revolut is unchanged: the bank sends no broker cash, so its Invest
  screenshot still writes broker cash.

## Revolut's broker cash (no build)

It was built on 10 Oct (`broker-cash.spec`). It says `missing` because no
Invest screenshot has been saved since. One Revolut Invest screenshot
through UPDATE on the Revolut card fills it. The Cash screen's EUR and USD
lines apart (1b) were never built.

## Tests

- e2e `trade-republic-bank.spec`: connect on the canned bank; the next
  check takes the balance and no rows; a screenshot saves positions and
  keeps the bank's cash.
- convex-test `bankBroker.test`: a broker asks no rows (`from: null`), a
  bank still does; a connected broker's screenshot leaves the cash; an
  unconnected broker's still writes it.

## Cost

Each check is one action, two small mutations and two Enable Banking calls
(balances, plus the account list on connect). It runs when Finances opens
and the last answer is over 4 hours old, so about 3–5 a day. Asking for no
rows is one call fewer than a bank's check. The open Finances queries run
again only when the balance changed, the same as ActivoBank's.

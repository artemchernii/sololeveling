# Remove a trade, and take it back

Journey: on a position's page he sees a buy that does not belong, or he
presses × by accident (14 Oct night: his MSFT buy went for good with no
question). He wants the × to ask, and anything removed to come back with
one press. Rare; the page is read far more than it is edited. Mockup
`design/treasury-mockup/trade-remove.html`, his go 15 Oct.

Screens/files: `TradeRow` (new), `PositionTrades`, `convex/invest.ts`
(`removeTrade`, `restoreTrade`, `removedTrades`), table `removedTrades`.

Design: REMOVE moves the row into `removedTrades` with `removedAt`; UNDO
moves the same fields back. Nothing that counts (positions, PAID, cash,
just added, the account sheet: ~27 reads of `trades`) reads
`removedTrades`, so none of them changes. No other table stores a
trade's id.

Scenarios:

- S1 × → row amber `REMOVE?` · REMOVE · KEEP; KEEP leaves it.
- S2 REMOVE → "removing…" → row struck, `REMOVED`, UNDO, in place; PAID
  and the counts drop.
- S3 UNDO → "restoring…" → the row back, flashing green; PAID counts it.
- S4 page opened again → `REMOVED · N` folded at the end, UNDO on each.
- S5 another person can neither remove, see nor restore the trade.

Data: no new number. The list and the sums read `trades` as before.

# Remove a typed balance

Journey: you typed what an account holds and the number was wrong, or a
file later said otherwise. You open the account, find the balance marked
"typed by you", press it, see what the account is afterwards, and remove
it in one press. Rare — a few times a month at most.

Mockup: `design/treasury-mockup/typed-balance.html` ("go", 11 Oct).

Screens/files: account sheet (`OpenAccount` → `Divider` →
`TypedBalance` in `AccountTypedBalance.tsx`); `convex/typedBalance.ts`
(`preview`, `remove`); `aggregate.accountSheet` readings carry `id`.
The landed line is `TakenStrip` with the title "Removed.".

Scenarios:

- S1 the newest balance is typed → open its line → "The balance of 12 Oct
  you typed goes.", now / after → press → "removing…" at once →
  "Removed. ActivoBank is €153.21 again." (e2e)
- S2 an older typed balance → "not changed", "ActivoBank stays … — the
  balance of … set that." → press → "ActivoBank stays ….". (e2e)
- S3 the only balance → after "—", "no balance left", "Its rows stay."
  (convex-test)
- S4 a balance a file set → no line; `remove` refuses it. (e2e,
  convex-test)
- S5 not yours → refused. (convex-test)
- S6 the write fails → "Not removed — nothing changed." and the line
  stays open. (not tested: no mock fails this write)
- Phone width: screenshot in S1.

Data: now and after are state (the balance) plus logged rows after it,
one currency — sources 2 and 1, as `aggregate.balances` counts them.

Out of scope: broker cash typed by hand (the sheet does not list it);
balances saved before `source` existed (no mark, so no line); changing a
typed balance in place; "put it back".

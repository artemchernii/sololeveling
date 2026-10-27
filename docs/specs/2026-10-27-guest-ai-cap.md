# Guest AI cap (R8 · S4)

His words, 27 Oct: "yes, S4 as picked: money AI closed to guests, $0.50 a
month per guest, no Trading 212 keys".

- **Money AI closed to guests.** The statement reader (`intake` start,
  retry, read again) and the Insights read (`marketReads.run`) refuse a
  guest with `NOT_FOR_GUESTS` (`refuseGuest` in `convex/profiles.ts`) —
  Finances is out of their sidebar, and now out of reach by URL too.
- **One pot per guest.** Ask (⌘J and Insights' ASK), Review's week read and
  a class sheet count toward `GUEST_CAP_USD` ($0.50) a month in `aiSpend`.
  Ask checks `marketAsk.cap`; a sheet or a week read is refused with
  `CAP_REACHED` once the pot is spent (`guestAtCap`) and charged from its
  usage at Sonnet prices when it lands (`chargeGuest`). The drawer's header
  shows `spent of $0.50` (`rowsAsk.spend`).
- **Artem unchanged.** `$2` on Ask and Insights; his sheets and week reads
  are not counted.
- **Trading 212 keys: dropped** — guests have no Finances.

Tests: `convex/guestAi.test.ts` (cap per person, the pot filling, Artem
not counted, money AI refused for a guest).

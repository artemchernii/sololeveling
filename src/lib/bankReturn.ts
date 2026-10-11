/* The trip to the bank's own page and back (11 Oct). The bank's page is
   another site, so what the app was doing is kept in this tab while it is
   away: which card, and whether it was a first connect or an approval again.
   Not money and not a record — only how to greet him when he is back. A tab
   that lost it (private window, another browser) still lands: the card is
   up to date, the window just does not reopen. */

export type BankBack = 'linked' | 'choose' | 'refused'
export type BankTrip = { accountId: string; again: boolean }
export type BankReturn = BankTrip & { back: BankBack }

const GOING = 'bank:going'
const BACK = 'bank:back'

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    window.sessionStorage.removeItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Nothing to do: the trip still works without it. */
  }
}

/** Before the bank's page opens. */
export const leaveForBank = (trip: BankTrip) => write(GOING, trip)
/** On the callback page: the trip he is back from, once. */
export const tripBack = () => read<BankTrip>(GOING)
/** For Finances, opened next: how it ended. */
export const cameBack = (r: BankReturn) => write(BACK, r)
/** On Finances: how the trip ended, once. */
export const takeReturn = () => read<BankReturn>(BACK)

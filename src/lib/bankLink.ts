/* A connected bank (11 Oct, docs/specs/2026-10-11-bank-connections.md):
   the choices made on what Enable Banking answers, with no Convex and no
   network in them, so each is tested on its own. */

export type Aspsp = {
  name: string
  country: string
  /** Seconds an approval may last at this bank. */
  maximum_consent_validity?: number
}

export type BankAccount = {
  uid: string
  currency: string
  iban?: string
  name?: string
}

export type BankBalance = {
  balance_type: string
  balance_amount: { amount: string; currency: string }
}

/* The banks the app knows how to find in Enable Banking's list, by the
   institution of src/lib/institutions.ts. Countries in the order tried:
   his accounts are Portuguese first. */
const KNOWN: Record<string, { match: RegExp; countries: Array<string> }> = {
  activo: { match: /activo/i, countries: ['PT'] },
  bpi: { match: /\bbpi\b/i, countries: ['PT'] },
  revolut: { match: /^revolut/i, countries: ['PT', 'LT'] },
  'trade-republic': { match: /trade\s*republic/i, countries: ['PT', 'DE'] },
}

export function canConnect(institution: string | undefined): boolean {
  return institution !== undefined && institution in KNOWN
}

/** The bank in Enable Banking's list, or null when it is not there. */
export function aspspFor(
  institution: string,
  list: ReadonlyArray<Aspsp>,
): Aspsp | null {
  if (!canConnect(institution)) return null
  const known = KNOWN[institution]
  for (const country of known.countries) {
    const found = list.find(
      (a) => a.country === country && known.match.test(a.name),
    )
    if (found) return found
  }
  return null
}

const DAY = 86_400_000
/* Most banks allow 180 days; asking for more is refused. */
const LONGEST = 180 * DAY

/** When the approval asked for ends: as long as the bank allows. */
export function approvalEnds(now: number, bank: Aspsp): number {
  const allowed =
    bank.maximum_consent_validity === undefined
      ? LONGEST
      : Math.min(LONGEST, bank.maximum_consent_validity * 1000)
  /* A minute inside the limit: "now" here is earlier than the bank's. */
  return now + allowed - 60_000
}

/* The booked balance first: it is what the booked rows add up to. Then
   what the bank calls available, then whatever it gave. */
const ORDER = ['CLBD', 'ITBD', 'XPCD', 'ITAV', 'CLAV']

/* Balances that leave pending money in: the booked rows alone reach them. */
const BOOKED = ['CLBD', 'ITBD']

function best(balances: ReadonlyArray<BankBalance>, currency: string) {
  const mine = balances.filter((b) => b.balance_amount.currency === currency)
  return (
    ORDER.map((type) => mine.find((b) => b.balance_type === type)).find(
      (b) => b !== undefined,
    ) ?? mine.at(0)
  )
}

/** Whether the balance picked leaves pending money in (ActivoBank's
    booked one) rather than taking it off (Revolut's available one). */
export function balanceIsBooked(
  balances: ReadonlyArray<BankBalance>,
  currency: string,
): boolean {
  const b = best(balances, currency)
  return b !== undefined && BOOKED.includes(b.balance_type)
}

/** One currency's balance out of the several a bank reports, or null. */
export function pickBalance(
  balances: ReadonlyArray<BankBalance>,
  currency: string,
): number | null {
  const picked = best(balances, currency)
  if (picked === undefined) return null
  const value = Number(picked.balance_amount.amount)
  return Number.isFinite(value) ? value : null
}

export type Picked =
  | { kind: 'found'; accounts: Array<{ uid: string; currency: string }> }
  | { kind: 'choose'; choices: Array<BankAccount> }
  | { kind: 'none' }

/** Which of the bank's accounts this card is: the one whose IBAN ends as
    the card's does; else the only one in each currency; else it is asked. */
export function pickAccounts(
  fromBank: ReadonlyArray<BankAccount>,
  currencies: ReadonlyArray<string>,
  ibanTails: ReadonlyArray<string>,
): Picked {
  const mine = fromBank.filter((a) => currencies.includes(a.currency))
  if (mine.length === 0) return { kind: 'none' }
  const known = mine.filter(
    (a) => a.iban !== undefined && ibanTails.some((t) => a.iban?.endsWith(t)),
  )
  const pool = known.length > 0 ? known : mine
  const accounts: Array<{ uid: string; currency: string }> = []
  for (const currency of currencies) {
    const inIt = pool.filter((a) => a.currency === currency)
    if (inIt.length > 1) return { kind: 'choose', choices: mine }
    if (inIt.length === 1) accounts.push({ uid: inIt[0].uid, currency })
  }
  return accounts.length > 0 ? { kind: 'found', accounts } : { kind: 'none' }
}

const DAY_FMT = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
})
const pad = (n: number) => String(n).padStart(2, '0')

/** When the bank last answered, as the card says it: "today 14:05", or
    "Oct 9, 08:02" for any other day. */
export function bankWhen(at: number, now: number): string {
  const d = new Date(at)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.toDateString() === new Date(now).toDateString()
    ? `today ${time}`
    : `${DAY_FMT.format(d)}, ${time}`
}

/** The day an approval runs to, with its year: "Apr 9, 2027". */
export function approvalDay(validUntil: number): string {
  return `${DAY_FMT.format(validUntil)}, ${new Date(validUntil).getFullYear()}`
}

type Answer = { source: string | null; currency: string; at: number }

/** Whether a reading is the bank's last answer of its currency (19 Oct,
    "why we see still pending and new?"): only it says what is new and
    pending now; an older one says what it was. */
export function lastSync(
  readings: ReadonlyArray<Answer>,
): (r: Answer) => boolean {
  const last = new Map<string, number>()
  for (const r of readings)
    if (r.source === 'sync')
      last.set(r.currency, Math.max(last.get(r.currency) ?? 0, r.at))
  return (r) => r.source === 'sync' && last.get(r.currency) === r.at
}

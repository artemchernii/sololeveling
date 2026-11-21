/* COMING on MARKET (31 Oct, part 5 of design/treasury-mockup/market-world.html):
   the next seven days, a row per day — rate decisions, US prices and jobs
   from the dated lists their publishers fix a year ahead, and the big
   companies reporting, from Finnhub's earnings calendar. Nothing is
   stored. Pure: the fetch is in convex/marketSources/coming.ts. */

import { ECB_MEETINGS, FED_MEETINGS } from './insightsRates'
import { plainName } from './mineWeek'
import { UNIVERSE } from './movers'

/** The Bank of England's 2026 MPC announcements, as it publishes them
    (bankofengland.co.uk, "Upcoming MPC dates", read 31 Oct). */
export const BOE_MEETINGS = [
  '2026-02-05',
  '2026-03-19',
  '2026-04-30',
  '2026-06-18',
  '2026-07-30',
  '2026-09-17',
  '2026-11-05',
  '2026-12-17',
]

/** BLS's release schedule (bls.gov/schedule/news_release, read 31 Oct):
    the CPI and the Employment Situation still to come, 08:30 Washington. */
export const CPI_DAYS = ['2026-11-10', '2026-12-10']
export const JOBS_DAYS = ['2026-11-06', '2026-12-04', '2027-01-08']

export const COMING_DAYS = 7

export type MacroKind = 'fed' | 'ecb' | 'boe' | 'cpi' | 'jobs'
export type MacroEvent = {
  kind: MacroKind
  day: string
  /** On the Lisbon clock, for the winter both sides keep from 1 Nov. */
  time: string
  flag: 'US' | 'EU' | 'GB'
  source: string
}

const MACRO: Array<{
  kind: MacroKind
  days: ReadonlyArray<string>
  time: string
  flag: MacroEvent['flag']
  source: string
}> = [
  { kind: 'fed', days: FED_MEETINGS, time: '19:00', flag: 'US', source: 'FED' },
  { kind: 'ecb', days: ECB_MEETINGS, time: '13:15', flag: 'EU', source: 'ECB' },
  {
    kind: 'boe',
    days: BOE_MEETINGS,
    time: '12:00',
    flag: 'GB',
    source: 'BANK OF ENGLAND',
  },
  { kind: 'cpi', days: CPI_DAYS, time: '13:30', flag: 'US', source: 'BLS' },
  { kind: 'jobs', days: JOBS_DAYS, time: '13:30', flag: 'US', source: 'BLS' },
]

/** The chip's name. */
export const MACRO_NAME: Record<MacroKind, string> = {
  fed: 'Fed',
  ecb: 'ECB',
  boe: 'Bank of England',
  cpi: 'US prices · CPI',
  jobs: 'US jobs report',
}

/** Today in Lisbon, YYYY-MM-DD. */
export const lisbonDay = (now: number) =>
  new Date(now).toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })

/** The seven days from today, YYYY-MM-DD. */
export function window7(today: string): Array<string> {
  const start = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: COMING_DAYS }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  )
}

/** The fixed-list events inside the seven days. */
export function macroIn(days: ReadonlyArray<string>): Array<MacroEvent> {
  const inside = new Set(days)
  return MACRO.flatMap((m) =>
    m.days
      .filter((d) => inside.has(d))
      .map((day) => ({
        kind: m.kind,
        day,
        time: m.time,
        flag: m.flag,
        source: m.source,
      })),
  )
}

/** Names for the companies Finnhub's calendar may list: the MOVERS
    universe that trades in New York, its own ticker with no suffix. */
const NAMES: Record<string, string> = {
  NVDA: 'Nvidia',
  MSFT: 'Microsoft',
  AAPL: 'Apple',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  META: 'Meta',
  AVGO: 'Broadcom',
  TSLA: 'Tesla',
  'BRK-B': 'Berkshire Hathaway',
  JPM: 'JPMorgan',
  LLY: 'Eli Lilly',
  V: 'Visa',
  MA: 'Mastercard',
  NFLX: 'Netflix',
  ORCL: 'Oracle',
  WMT: 'Walmart',
  COST: 'Costco',
  XOM: 'Exxon Mobil',
  UNH: 'UnitedHealth',
  PLTR: 'Palantir',
  AMD: 'AMD',
  INTC: 'Intel',
  CRM: 'Salesforce',
  ADBE: 'Adobe',
  UBER: 'Uber',
  RDDT: 'Reddit',
  SHOP: 'Shopify',
  CAT: 'Caterpillar',
  BA: 'Boeing',
  NKE: 'Nike',
  DIS: 'Disney',
  PYPL: 'PayPal',
  COIN: 'Coinbase',
  SNOW: 'Snowflake',
  MU: 'Micron',
  QCOM: 'Qualcomm',
  SPOT: 'Spotify',
  MELI: 'MercadoLibre',
  NU: 'Nubank',
  YPF: 'YPF',
  GGAL: 'Galicia',
  SQM: 'SQM',
  EMBJ: 'Embraer',
  BAP: 'Credicorp',
}

/** Finnhub writes Berkshire as BRK.B; the universe as Yahoo does. */
const finnhubOf = (s: string) => s.replace('-', '.')

/** The listed companies the calendar is read for, by Finnhub's ticker. */
export const CALENDAR_LIST: ReadonlyMap<
  string,
  { symbol: string; name: string; domain: string }
> = new Map(
  Object.values(UNIVERSE)
    .flat()
    .filter((l) => l.symbol in NAMES)
    .map((l) => [
      finnhubOf(l.symbol),
      { symbol: l.symbol, name: NAMES[l.symbol], domain: l.domain },
    ]),
)

export type Reporter = {
  day: string
  symbol: string
  name: string
  domain: string | null
  /** Finnhub's hour: before the open, after the close, or not given. */
  hour: 'BEFORE OPEN' | 'AFTER CLOSE' | null
  expected: number | null
  held: boolean
}

const HOURS: Record<string, Reporter['hour']> = {
  bmo: 'BEFORE OPEN',
  amc: 'AFTER CLOSE',
}

/**
 * Finnhub's earnings calendar, kept to the listed companies and the held
 * ones (by their ticker without a suffix), inside the days, one row per
 * company and day.
 */
export function parseCalendar(
  json: unknown,
  days: ReadonlyArray<string>,
  held: ReadonlyArray<{ symbol: string; name: string }>,
): Array<Reporter> {
  const rows = (json as { earningsCalendar?: unknown } | null)?.earningsCalendar
  if (!Array.isArray(rows)) return []
  const inside = new Set(days)
  const mine = new Map(held.map((h) => [h.symbol.toUpperCase(), h.name]))
  const seen = new Set<string>()
  const out: Array<Reporter> = []
  for (const r of rows as Array<Record<string, unknown>>) {
    const s = typeof r.symbol === 'string' ? r.symbol.toUpperCase() : null
    const day = typeof r.date === 'string' ? r.date : null
    if (!s || !day || !inside.has(day) || seen.has(`${s}|${day}`)) continue
    const listed = CALENDAR_LIST.get(s)
    const base = s.split('.')[0]
    const heldName = mine.get(s) ?? mine.get(base)
    if (!listed && heldName === undefined) continue
    seen.add(`${s}|${day}`)
    const eps = Number(r.epsEstimate)
    out.push({
      day,
      symbol: listed?.symbol ?? s,
      name: listed?.name ?? (heldName ? plainName(heldName) : s),
      domain: listed?.domain ?? null,
      hour: HOURS[String(r.hour)] ?? null,
      expected: r.epsEstimate != null && Number.isFinite(eps) ? eps : null,
      held: heldName !== undefined,
    })
  }
  return out
}

export type ComingDay = {
  day: string
  macro: Array<MacroEvent>
  reporters: Array<Reporter>
}

/** A row per day that has something, in order; held companies first. */
export function comingDays(
  days: ReadonlyArray<string>,
  macro: ReadonlyArray<MacroEvent>,
  reporters: ReadonlyArray<Reporter>,
): Array<ComingDay> {
  return days.flatMap((day) => {
    const m = macro.filter((e) => e.day === day)
    const r = reporters
      .filter((e) => e.day === day)
      .sort((a, b) => Number(b.held) - Number(a.held))
    return m.length || r.length ? [{ day, macro: m, reporters: r }] : []
  })
}

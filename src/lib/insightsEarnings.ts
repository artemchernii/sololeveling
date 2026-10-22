import type { Point } from './insightsMarket'
import type { Fact } from './marketRead'

/* Earnings on MINE (22 Oct, spec docs/specs/2026-10-21-earnings-dates.md;
   mockup design/treasury-mockup/earnings.html). A held company's next
   results day, or its last with the move since the close before it —
   read from Yahoo on open, never saved. Pure: the parsers of Yahoo's
   answers, the window a ribbon shows in, and the facts READ and ASK get. */

const DAY = 86_400_000
/** A ribbon shows a report this many days ahead … */
export const AHEAD_DAYS = 14
/** … or this many days back. */
export const BACK_DAYS = 7
/** A US session, open to close: a report later than a day's open plus
    this came after that day's close. */
const SESSION_MS = 6.5 * 3_600_000

export type Price = { at: number; price: number }
/** What the action answers per company. */
export type Earning = {
  symbol: string
  next: number | null
  estimate: boolean
  last: number | null
  /** The close before `last`, and the latest price. */
  base: Price | null
  now: Price | null
  currency: string | null
}

const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null)
/** Yahoo's { raw } or a bare number, in seconds. */
const secs = (v: unknown) =>
  num(v) ?? num((v as { raw?: unknown } | null)?.raw ?? null)

/** quoteSummary `calendarEvents`: the dates Yahoo gives for the next
    report (one, or the two ends of a range) and whether it is a guess. */
export function parseCalendar(
  json: unknown,
): { times: Array<number>; estimate: boolean } | null {
  const e = (
    json as {
      quoteSummary?: {
        result?: Array<{ calendarEvents?: { earnings?: unknown } }>
      }
    } | null
  )?.quoteSummary?.result?.[0]?.calendarEvents?.earnings as
    | { earningsDate?: Array<unknown>; isEarningsDateEstimate?: unknown }
    | undefined
  if (!e || !Array.isArray(e.earningsDate)) return null
  const times = e.earningsDate.flatMap((d) => {
    const s = secs(d)
    return s === null ? [] : [s * 1000]
  })
  return { times, estimate: e.isEarningsDateEstimate === true }
}

/** v7 quote: each symbol's earnings times (the last and the next window)
    and its currency. */
export function parseQuotes(
  json: unknown,
): Map<
  string,
  { times: Array<number>; estimate: boolean; currency: string | null }
> {
  const out = new Map<
    string,
    { times: Array<number>; estimate: boolean; currency: string | null }
  >()
  const rows = (json as { quoteResponse?: { result?: unknown } } | null)
    ?.quoteResponse?.result
  if (!Array.isArray(rows)) return out
  for (const r of rows as Array<Record<string, unknown>>) {
    if (typeof r.symbol !== 'string') continue
    const times = [
      r.earningsTimestamp,
      r.earningsTimestampStart,
      r.earningsTimestampEnd,
    ].flatMap((v) => {
      const s = secs(v)
      return s === null ? [] : [s * 1000]
    })
    out.set(r.symbol, {
      times,
      estimate: r.isEarningsDateEstimate === true,
      currency: typeof r.currency === 'string' ? r.currency : null,
    })
  }
  return out
}

/** The nearest report ahead and the latest one behind, from every time
    Yahoo gave. A range's two ends count as its first day. */
export function pickDays(times: ReadonlyArray<number>, now: number) {
  const ahead = times.filter((t) => t > now).sort((a, b) => a - b)
  const behind = times.filter((t) => t <= now).sort((a, b) => b - a)
  return { next: ahead[0] ?? null, last: behind[0] ?? null }
}

/**
 * The close before a report and the latest price, from daily points (a
 * point's time is that day's open). A day whose close came before the
 * report is "before"; the report's own day counts when it reported after
 * the close.
 */
export function sinceReport(
  points: ReadonlyArray<Point>,
  report: number,
): { base: Price; now: Price } | null {
  const before = points.filter((p) => p.t + SESSION_MS <= report)
  const b = before.at(-1)
  const n = points.at(-1)
  if (!b || !n || n.t <= b.t) return null
  return { base: { at: b.t, price: b.v }, now: { at: n.t, price: n.v } }
}

export type Ribbon =
  | { kind: 'soon'; at: number; days: number; estimate: boolean }
  | {
      kind: 'reported'
      at: number
      base: Price
      now: Price
      change: number
      currency: string | null
    }

const daysFrom = (now: number, at: number) =>
  Math.round(
    (Date.UTC(
      new Date(at).getUTCFullYear(),
      new Date(at).getUTCMonth(),
      new Date(at).getUTCDate(),
    ) -
      Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate(),
      )) /
      DAY,
  )

/** What a box's ribbon says, or null: the last report within 7 days
    (with both prices) comes before the next within 14. */
export function ribbonOf(e: Earning, now: number): Ribbon | null {
  if (e.last !== null && daysFrom(now, e.last) >= -BACK_DAYS && e.base && e.now)
    return {
      kind: 'reported',
      at: e.last,
      base: e.base,
      now: e.now,
      change: ((e.now.price - e.base.price) / e.base.price) * 100,
      currency: e.currency,
    }
  if (e.next !== null) {
    const days = daysFrom(now, e.next)
    if (days >= 0 && days <= AHEAD_DAYS)
      return { kind: 'soon', at: e.next, days, estimate: e.estimate }
  }
  return null
}

const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
/** "20 OCT", in UTC as Yahoo dates it. */
export const dayWord = (at: number) =>
  `${new Date(at).getUTCDate()} ${MONTHS[new Date(at).getUTCMonth()]}`
export const moveWord = (change: number) =>
  `${change > 0 ? '▲' : change < 0 ? '▼' : '='} ${Math.abs(change).toFixed(1)}%`
export const priceWord = (n: number, currency: string | null) =>
  `${currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency ? `${currency} ` : ''}${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** One fact per ribbon, for the read and ASK: `earn-NFLX`. */
export function earningsFacts(
  rows: ReadonlyArray<Earning>,
  now: number,
): Array<Fact> {
  return rows.flatMap((e): Array<Fact> => {
    const r = ribbonOf(e, now)
    const name = e.symbol.split('.')[0]
    if (r === null) return []
    if (r.kind === 'soon')
      return [
        {
          key: `earn-${name}`,
          label: `${name} EARNINGS`,
          value: `${dayWord(r.at)} · IN ${r.days} ${r.days === 1 ? 'DAY' : 'DAYS'} · ${r.estimate ? 'ESTIMATE' : 'CONFIRMED'}`,
          tone: null,
        },
      ]
    return [
      {
        key: `earn-${name}`,
        label: `${name} REPORTED ${dayWord(r.at)}`,
        value: `CLOSE ${dayWord(r.base.at)} ${priceWord(r.base.price, r.currency)} · NOW ${priceWord(r.now.price, r.currency)} · ${moveWord(r.change)}`,
        tone: r.change > 0 ? 'good' : r.change < 0 ? 'bad' : null,
      },
    ]
  })
}

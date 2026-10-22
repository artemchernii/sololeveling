import { money } from './currency'
import { between } from './priceChart'
import { callOf } from './insightsMine'
import { signals, verdict } from './indicators'
import type { Call, Reading } from './indicators'
import { OWNER_ZONE, dayStart } from './remindAt'

/* CLOSE (22 Oct; spec docs/specs/2026-10-22-n3-investment-alerts.md,
   mockups design/notifications-mockup/n3.html and
   design/treasury-mockup/close.html). One push at 21:30 Lisbon, after
   the US close: the day's change of worth, and the moments of the shares
   held — a big day (±5%), a call that changed, results two days away or
   the first close after them. Pure, so it is tested. */

const DAY = 86_400_000
/** A big day: this move or more, either way. */
export const BIG_PCT = 5
/** Results ring this many days before. */
export const SOON_DAYS = 2

export type Close = { asOf: number; price: number }

/** "Netflix, Inc." → "Netflix": the name as he says it. */
export function plainCompany(name: string): string {
  let n = name.trim()
  for (;;) {
    const cut = n.replace(
      /,?\s+(inc\.?|incorporated|corp\.?|corporation|co\.?|company|n\.v\.|nv|plc|ltd\.?|limited|s\.a\.|sa|se|ag|holdings?|group)$/i,
      '',
    )
    if (cut === n || cut === '') return n
    n = cut
  }
}

/** "AAPL", "VUAA" — a ticker without its exchange. */
export const tickerOf = (symbol: string) => symbol.split(/[.=]/)[0]

const dayWord = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: OWNER_ZONE,
  })
export const pctWord = (pct: number) =>
  `${pct < 0 ? '▼' : '▲'} ${Math.abs(Math.round(pct * 10) / 10)}%`

const sorted = (closes: ReadonlyArray<Close>) =>
  [...closes].sort((a, b) => a.asOf - b.asOf)

/** A close counts on the evening it is made: newer than a day. */
export const fresh = (c: Close | undefined, now: number) =>
  c !== undefined && now - c.asOf < DAY

export type Moment =
  | { kind: 'big'; pct: number }
  | { kind: 'call'; was: Call; now: Call; why: Array<string> }
  | { kind: 'soon'; at: number }
  | { kind: 'reported'; pct: number; from: Close; to: Close }

/** Big day: the newest close and the one before, 5% or more apart. */
export function bigDay(closes: ReadonlyArray<Close>, now: number) {
  const s = sorted(closes)
  const to = s.at(-1)
  const from = s.at(-2)
  if (!to || !from || !fresh(to, now)) return null
  const b = between(
    { t: from.asOf, v: from.price },
    { t: to.asOf, v: to.price },
  )
  return Math.abs(b.pct) >= BIG_PCT ? { from, to, pct: b.pct } : null
}

/** The call of every close against the call without the newest. */
export function callTurn(
  closes: ReadonlyArray<Close>,
  reading: Reading | null,
  now: number,
): { was: Call; now: Call; why: Array<string> } | null {
  const s = sorted(closes)
  if (!fresh(s.at(-1), now)) return null
  const was = callOf(s.slice(0, -1), reading, now)
  const is = callOf(s, reading, now)
  if (was === null || is === null || was === is) return null
  const pts = s.map((c) => ({ t: c.asOf, v: c.price }))
  const rows = signals(pts, null)
  const v = verdict(rows, { reading, now })
  const words: Record<string, string> = {}
  for (const r of rows) {
    if (r.id === 'sma50' || r.id === 'sma200')
      words[r.id] = `SMA ${r.id.slice(3)} ${r.verdict}`
    if (r.id === 'rsi') words.rsi = `RSI ${Math.round(r.level)}`
  }
  if (reading?.targetMean !== undefined)
    words.target = `target ${Math.round(reading.targetMean * 100) / 100}`
  if (reading?.revenueGrowth !== undefined)
    words.revenue = `revenue ${pctWord(reading.revenueGrowth * 100)}`
  if (reading?.ratingMean !== undefined)
    words.rating = `rating ${reading.ratingMean.toFixed(1)}`
  return {
    was,
    now: is,
    why: (v?.why ?? []).flatMap((id) => (words[id] ? [words[id]] : [])),
  }
}

/** Lisbon days from today to `at`. */
const daysTo = (at: number, now: number) =>
  Math.round((dayStart(at) - dayStart(now)) / DAY)

/** Results exactly two days away. */
export const earnSoon = (next: number | null, now: number) =>
  next !== null && daysTo(next, now) === SOON_DAYS

/**
 * The newest close is the first stored after the report, fresh, with the
 * stored close before the report. A close stored before the report's time
 * is "before" — a report after the bell counts its own day's close.
 */
export function reported(
  closes: ReadonlyArray<Close>,
  last: number | null,
  now: number,
) {
  if (last === null) return null
  const s = sorted(closes)
  const after = s.filter((c) => c.asOf > last)
  const base = s.filter((c) => c.asOf <= last).at(-1)
  const to = after[0]
  if (after.length !== 1 || !base || !fresh(to, now)) return null
  const b = between(
    { t: base.asOf, v: base.price },
    { t: to.asOf, v: to.price },
  )
  return { from: base, to, pct: b.pct }
}

export type Tone = 'good' | 'bad' | 'lav'

/** A moment as its badge on CLOSE's row. */
export function badgeOf(m: Moment): { text: string; tone: Tone } {
  if (m.kind === 'big')
    return { text: 'BIG DAY', tone: m.pct < 0 ? 'bad' : 'good' }
  if (m.kind === 'call')
    return {
      text: `${m.was.toUpperCase()} → ${m.now.toUpperCase()}`,
      tone: m.now === 'add' ? 'good' : m.now === 'wait' ? 'bad' : 'lav',
    }
  if (m.kind === 'soon')
    return { text: `EARNINGS ${dayWord(m.at).toUpperCase()}`, tone: 'lav' }
  return {
    text: `REPORTED ${pctWord(m.pct)}`,
    tone: m.pct < 0 ? 'bad' : 'good',
  }
}

/** A moment in the push's body: "TSLA ▼ 6.2%", "ASML HOLD → ADD". */
function pushWord(ticker: string, m: Moment, pct: number | null): string {
  if (m.kind === 'big') return `${ticker} ${pctWord(pct ?? m.pct)}`
  if (m.kind === 'call')
    return `${ticker} ${m.was.toUpperCase()} → ${m.now.toUpperCase()}`
  if (m.kind === 'soon') return `${ticker} earnings ${dayWord(m.at)}`
  return `${ticker} reported ${pctWord(m.pct)}`
}

const ORDER: Record<Moment['kind'], number> = {
  big: 0,
  call: 1,
  reported: 2,
  soon: 3,
}

export type DayRow = {
  symbol: string
  /** Today's move on the close before, null without both. */
  pct: number | null
  moments: ReadonlyArray<Moment>
}

/**
 * The 21:30 push: `Close · ▼ €102.40 · 1.6%` and three parts — the
 * moments first, then the biggest movers. Worth now and at the close of
 * the day before are both on CLOSE (CLAUDE.md, 22 Oct rule 1).
 */
export function closePush(
  total: { nowEur: number; wasEur: number },
  rows: ReadonlyArray<DayRow>,
): { title: string; body: string } {
  const diff = Math.round((total.nowEur - total.wasEur) * 100) / 100
  const pct = total.wasEur > 0 ? (diff / total.wasEur) * 100 : 0
  const title =
    diff === 0
      ? 'Close · = €0'
      : `Close · ${diff < 0 ? '▼' : '▲'} ${money(Math.abs(diff))} · ${Math.abs(Math.round(pct * 10) / 10)}%`
  const parts = rows
    .flatMap((r) => r.moments.map((m) => ({ r, m })))
    .sort((a, b) => ORDER[a.m.kind] - ORDER[b.m.kind])
    .map(({ r, m }) => pushWord(tickerOf(r.symbol), m, r.pct))
  const named = new Set(parts.map((p) => p.split(' ')[0]))
  const movers = rows
    .filter((r) => r.pct !== null && !named.has(tickerOf(r.symbol)))
    .sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0))
    .map((r) => `${tickerOf(r.symbol)} ${pctWord(r.pct ?? 0)}`)
  return { title, body: [...parts, ...movers].slice(0, 3).join(' · ') }
}

const HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: OWNER_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
})
const AT = 21.5 * 3_600_000

/** 21:30 of the local day that starts at `start`, across a clock change. */
function eveningOn(start: number): number {
  const t = start + AT
  return t + (21 - Number(HOUR.format(t))) * 3_600_000
}

/** The next 21:30 on his wall clock strictly after `now`: always after
    the US close (21:00 Lisbon, 20:00 the week the clocks differ). */
export function nextEvening(now: number): number {
  const today = eveningOn(dayStart(now))
  if (today > now) return today
  return eveningOn(dayStart(dayStart(now) + DAY + 2 * 3_600_000))
}

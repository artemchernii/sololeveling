import { money } from './currency'
import { between } from './priceChart'
import { callOf } from './insightsMine'
import { signals, verdict } from './indicators'
import type { Call, Reading } from './indicators'
import { dayStart } from './remindAt'

/* N3 (22 Oct; spec docs/specs/2026-10-22-n3-investment-alerts.md, mockup
   design/notifications-mockup/n3.html). What rings the phone at 09:00
   for a share he holds, from its stored closes — A its results two days
   away or its first close after them, B its call changed with the newest
   close, C the newest close 5% or more from the one before. Pure, so it
   is tested. */

const DAY = 86_400_000
/** C rings at this move or more, either way. */
export const BIG_PCT = 5
/** A rings this many days before a results day. */
export const SOON_DAYS = 2

export type Close = { asOf: number; price: number }
export type Words = { title: string; body: string }

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

const day = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Lisbon',
  })
const arrow = (pct: number) => (pct < 0 ? '▼' : '▲')
const pctWord = (pct: number) =>
  `${arrow(pct)} ${Math.abs(Math.round(pct * 10) / 10)}%`

const sorted = (closes: ReadonlyArray<Close>) =>
  [...closes].sort((a, b) => a.asOf - b.asOf)

/** A close counts on the first morning after it only: a weekend's
    mornings see Friday's close once. */
export const fresh = (c: Close | undefined, now: number) =>
  c !== undefined && now - c.asOf < DAY

/** C: the newest close and the one before, when 5% or more apart. */
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

export function bigWords(
  company: string,
  b: { from: Close; to: Close; pct: number },
  currency: string,
): Words {
  return {
    title: `${company} ${pctWord(b.pct)}`,
    body: `${money(b.from.price, currency)} · ${day(b.from.asOf)} → ${money(b.to.price, currency)} · ${day(b.to.asOf)}`,
  }
}

/** B: the call of every close against the call without the newest. */
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

export function callWords(
  company: string,
  t: { was: Call; now: Call; why: Array<string> },
): Words {
  const up = (c: Call) => c.toUpperCase()
  return {
    title: `${company} · ${up(t.was)} → ${up(t.now)}`,
    body: [...t.why, `was ${up(t.was)}`].join(' · '),
  }
}

/** Lisbon days from today to `at`. */
const daysTo = (at: number, now: number) =>
  Math.round((dayStart(at) - dayStart(now)) / DAY)

/** A soon: the next results day is exactly two days away. */
export const earnSoon = (next: number | null, now: number) =>
  next !== null && daysTo(next, now) === SOON_DAYS

export function soonWords(company: string, symbol: string, next: number) {
  return {
    title: `${company} · earnings ${day(next)}`,
    body: `In ${SOON_DAYS} days · ${symbol}`,
  }
}

/**
 * A reported: the newest close is the first stored after the report,
 * fresh, with the stored close before the report. A close stored before
 * the report's time is "before" — a report after the bell counts its
 * own day's close.
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

export function reportWords(
  company: string,
  r: { from: Close; to: Close; pct: number },
  currency: string,
): Words {
  return {
    title: `${company} reported · ${pctWord(r.pct)}`,
    body: `Was ${money(r.from.price, currency)} · ${day(r.from.asOf)} · now ${money(r.to.price, currency)} · ${day(r.to.asOf)}`,
  }
}

import { callOf } from './insightsMine'
import { signals, yearRange } from './indicators'
import type { Call, Reading } from './indicators'

/* The watchlist (1 Nov, docs/specs/2026-11-01-watchlist.md, mockup
   watchlist.html): a name not owned, its closes stored like a held
   one's. What its row says is read from those closes by the rules a
   position's chart already uses — nothing stored, nothing new. */

/** Names on the list at most (31 Oct, "yes to all"). */
export const WATCH_MAX = 20

type Close = { asOf: number; price: number }

export type WatchFacts = {
  low: number
  high: number
  /** The latest close against the year's high, `between()`'s %. */
  vsHigh: number
  call: Call | null
  bull: number
  bear: number
}

/** A row's 52W, VS HIGH and SIGNAL from a year of stored closes. */
export function factsOf(
  closes: ReadonlyArray<Close>,
  reading: Reading | null,
  now: number,
): WatchFacts | null {
  const pts = [...closes]
    .sort((a, b) => a.asOf - b.asOf)
    .map((c) => ({ t: c.asOf, v: c.price }))
  const yr = yearRange(pts)
  if (yr === null) return null
  const said = signals(pts, null)
  return {
    low: yr.low.v,
    high: yr.high.v,
    vsHigh: yr.fromHigh.pct,
    call: callOf(closes, reading, now),
    bull: said.filter((s) => s.way === 'up').length,
    bear: said.filter((s) => s.way === 'down').length,
  }
}

export type Side = 'up' | 'down'

/** Which way the alert waits: a price above the latest rings on the way
    up (≥), one below on the way down (≤). */
export const sideOf = (price: number, at: number): Side =>
  at >= price ? 'up' : 'down'

/** Whether a stored close reached the alert. */
export const hitOf = (alert: { at: number; side: Side }, close: number) =>
  alert.side === 'up' ? close >= alert.at : close <= alert.at

export const signOf = (side: Side) => (side === 'up' ? '≥' : '≤')

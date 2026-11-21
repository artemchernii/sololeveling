/* MINE · THIS WEEK on MARKET (31 Oct, part 5 of
   design/treasury-mockup/market-world.html; his words: "keep my companies
   but show CURRENT WHAT HAPPEND this week that really influenced my
   holdings"). A card per held company that moved 5% or more since the
   close a week ago, or had news in the week: results out, a manager's
   trade, a big fund's 13F move. The week's move is two fetched closes,
   both on the card; WAS € is the same shares at the older close. Pure:
   nothing is stored. */

import { NEWS_MOVE, moveOf as fundMove } from './bigFunds'
import type { FundMove } from './bigFunds'
import type { CompanyRow } from './companies'

/** A week's move that makes a card on its own, in percent. */
export const BIG_WEEK = 5
const WEEK_DAYS = 7

export type WeekClose = {
  symbol: string
  base: number
  baseAt: number
  price: number
  at: number
  currency: string | null
  change: number
}

export type HeldNow = { symbol: string; name: string; valueEur: number | null }

export type Reason =
  | { kind: 'results'; day: string; actual: number; expected: number | null }
  | {
      kind: 'insider'
      who: string
      side: 'BUY' | 'SELL'
      usd: number
      day: string
    }
  | { kind: 'fund'; move: FundMove }

export type WeekCard = {
  symbol: string
  name: string
  close: WeekClose | null
  nowEur: number | null
  /** The same shares at the close a week back. */
  wasEur: number | null
  reasons: Array<Reason>
}

/** "Alphabet Inc." → "Alphabet", "DoorDash, Inc." → "DoorDash". */
export const plainName = (n: string) =>
  n.replace(
    /,? (Inc|Corp|Corporation|Incorporated|N\.V|S\.A|AG|SE|plc|Ltd|Limited)\.?$/i,
    '',
  )

const within = (day: string, now: number) =>
  now - Date.parse(`${day}T12:00:00Z`) <= WEEK_DAYS * 86_400_000

/**
 * The cards, biggest move first: a held company with a week's close
 * moving BIG_WEEK or more, or results out or an insider trade in the last
 * seven days; a fund's shares moved NEWS_MOVE or more is a line on it.
 */
export function weekCards(
  held: ReadonlyArray<HeldNow>,
  closes: ReadonlyMap<string, WeekClose>,
  rows: ReadonlyArray<CompanyRow>,
  funds: ReadonlyArray<FundMove>,
  now: number,
): Array<WeekCard> {
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]))
  const fundOf = new Map(funds.map((f) => [f.symbol, f]))
  const cards = held.flatMap((h): Array<WeekCard> => {
    const close = closes.get(h.symbol) ?? null
    const r = bySymbol.get(h.symbol)
    const reasons: Array<Reason> = []
    if (r?.results?.actual != null && within(r.results.day, now))
      reasons.push({
        kind: 'results',
        day: r.results.day,
        actual: r.results.actual,
        expected: r.results.expected,
      })
    if (r?.insider && within(r.insider.day, now))
      reasons.push({ kind: 'insider', ...r.insider })
    const big = close !== null && Math.abs(close.change) >= BIG_WEEK
    if (!big && reasons.length === 0) return []
    /* A 13F is a quarter old: a line on a card, never a card alone (31 Oct,
       it made 13 of 22 holdings cards). */
    const f = fundOf.get(h.symbol)
    if (f && Math.abs(fundMove(f)) >= NEWS_MOVE)
      reasons.push({ kind: 'fund', move: f })
    return [
      {
        symbol: h.symbol,
        name: plainName(h.name),
        close,
        nowEur: h.valueEur,
        wasEur:
          close && h.valueEur !== null && close.price > 0
            ? Math.round((h.valueEur * close.base) / close.price)
            : null,
        reasons,
      },
    ]
  })
  return cards.sort(
    (a, b) => Math.abs(b.close?.change ?? 0) - Math.abs(a.close?.change ?? 0),
  )
}

import type { Board } from './ideasRead'
import type { Mover, Movers } from './ideasBoard'

/* The four questions ASK offers beside the board (29 Oct, his "in chat
   suggestions are kinda weak"): asked of his own plan and his own
   movers, not the market at large — the biggest ADD, PROTECT's mix, the
   cash KEEP holds back, and the held company that moved most today. */

export type SuggestKind = 'keep' | 'protect' | 'add' | 'new' | 'mover'
export type Suggest = { kind: SuggestKind; label: string; q: string }

const eur = (n: number) => `€${Math.round(n).toLocaleString('en-GB')}`
const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`

export function ideasSuggested(
  b: Board | null,
  movers: Movers | null,
  held: ReadonlySet<string>,
  idle: number | null,
): Array<Suggest> {
  const out: Array<Suggest> = []
  const all: Array<Mover> = [
    ...(movers?.losers ?? []),
    ...(movers?.gainers ?? []),
    ...(movers?.trending ?? []),
  ]
  const mine = all
    .filter((m) => held.has(m.symbol.toUpperCase()))
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))[0] as
    Mover | undefined
  if (b) {
    const add = b.lines
      .filter((l) => l.part === 'add' && l.eur > 0)
      .sort((x, y) => y.eur - x.eur)[0] as (typeof b.lines)[number] | undefined
    if (add)
      out.push({
        kind: 'add',
        label: `ADD · ${add.ticker}`,
        q: `Why ${eur(add.eur)} into ${add.ticker} now, and not all at once?`,
      })
    if (b.parts.protect > 0)
      out.push({
        kind: 'protect',
        label: `PROTECT · ${eur(b.parts.protect)}`,
        q: `Why ${eur(b.parts.protect)} in PROTECT — bonds, gold or cash that pays?`,
      })
    if (b.parts.keep > 0)
      out.push({
        kind: 'keep',
        label: `KEEP · ${eur(b.parts.keep)}`,
        q: `Is ${eur(b.parts.keep)} of cash too much or too little to keep?`,
      })
    const fresh = b.lines.find((l) => l.part === 'new' && l.eur > 0)
    if (fresh && !mine)
      out.push({
        kind: 'new',
        label: `NEW · ${fresh.ticker}`,
        q: `What could go wrong with ${fresh.ticker}?`,
      })
  } else if (idle !== null) {
    out.push({
      kind: 'keep',
      label: `CASH · ${eur(idle)}`,
      q: `What should I do with ${eur(idle)} of idle cash?`,
    })
    out.push({
      kind: 'protect',
      label: 'PROTECT',
      q: 'Bonds, gold or cash that pays — which now, and why?',
    })
  }
  if (mine)
    out.push({
      kind: 'mover',
      label: `MINE · ${mine.symbol} ${pct(mine.change)}`,
      q: `${mine.symbol} ${pct(mine.change)} today: add, hold or wait?`,
    })
  else if (all[0])
    out.push({
      kind: 'mover',
      label: `MOVER · ${all[0].symbol} ${pct(all[0].change)}`,
      q: `${all[0].symbol} ${pct(all[0].change)} today: worth a look?`,
    })
  return out.slice(0, 4)
}

import type { BoardLine } from './ideasRead'
import type { Fact, MarketNumbers } from './marketRead'

/* READ, about his money (29 Oct; spec docs/specs/2026-10-29-read-personal.md,
   mockup design/treasury-mockup/read-personal.html, his "Go"). What a read
   line means for his money in €: one of his numbers times one fetched rate,
   with both printed after the result ("−€1,743 · 3.8% of €45,858"), never
   stored as a number of its own. Each is a fact the model may name; the
   app prints it. Labels are plain words (his "I dont understand LLM style
   of text"). Pure. */

/** Portugal taxes a gain at 28% when it is sold (CIRS art. 72). */
export const PT_GAINS_TAX = 28

const eur = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('en-GB')}`
const signed = (n: number) => `${n < 0 ? '−' : '+'}${eur(n)}`
const pc = (n: number) => `${Math.abs(n).toFixed(1)}%`

export type MineInput = {
  /** Free cash and broker cash, in euros. Null while not read. */
  cash: { idle: number; banks: number; broker: number } | null
  invested: number | null
  rates: MarketNumbers['rates']
  markets: MarketNumbers['markets']
  /** MINE's allocation lines: his % and the world's. */
  alloc: ReadonlyArray<{
    id: string
    mine: number | null
    world: number | null
  }> | null
  /** Each thing held: what it cost and what it is worth now. */
  owned: ReadonlyArray<{
    symbol: string
    name: string
    paid: number | null
    valueEur: number | null
  }> | null
}

const AREA_WORD: Record<string, string> = {
  tech: 'Tech',
  us: 'US',
  europe: 'Europe',
  world: 'World funds',
  health: 'Health',
  gold: 'Gold',
}

export function readMine(i: MineInput): Array<Fact> {
  const out: Array<Fact> = []
  const add = (
    key: string,
    label: string,
    value: string,
    tone: Fact['tone'] = null,
  ) => out.push({ key, label, value, tone })

  const hicp = i.rates.find((r) => r.id === 'eu-hicp')
  const ecb = i.rates.find((r) => r.id === 'ecb')
  if (i.cash) {
    add('me-cash', 'Cash', `${eur(i.cash.idle)} · banks and broker`)
    if (hicp?.reached && hicp.value !== null && i.cash.idle > 0)
      add(
        'me-cash-lost',
        'Lost to prices in a year',
        `${signed(-(i.cash.idle * hicp.value) / 100)} · ${pc(hicp.value)} of ${eur(i.cash.idle)}`,
        'bad',
      )
    if (ecb?.reached && ecb.value !== null && i.cash.idle > 0)
      add(
        'me-cash-ecb',
        'Cash at the ECB rate, a year',
        `${signed((i.cash.idle * ecb.value) / 100)} · ${pc(ecb.value)} of ${eur(i.cash.idle)}`,
        'good',
      )
  }
  if (hicp?.reached && hicp.value !== null)
    add(
      'me-prices',
      'Euro area prices, a year',
      hicp.prev !== null
        ? `${pc(hicp.value)} · was ${pc(hicp.prev)}`
        : pc(hicp.value),
    )
  if (ecb?.reached && ecb.value !== null)
    add('me-ecb', 'ECB rate', `${ecb.value.toFixed(2)}% · for euro cash`)
  if (i.invested !== null) add('me-invested', 'Investments', eur(i.invested))

  for (const a of i.alloc ?? []) {
    if (a.mine === null) continue
    const word = AREA_WORD[a.id] ?? a.id
    add(
      `me-alloc-${a.id}`,
      `${word} in investments`,
      a.world !== null
        ? `${Math.round(a.mine)}% · world ${Math.round(a.world)}%`
        : `${Math.round(a.mine)}%`,
    )
  }

  /* The dollar: what his US part gained or lost in euros over the month.
     EUR/USD up is a weaker dollar, so a US share is worth fewer euros. */
  const us = i.alloc?.find((a) => a.id === 'us')?.mine ?? null
  const fx = i.markets.find((m) => m.id === 'eurusd')?.move ?? null
  if (us !== null && i.invested !== null && i.invested > 0) {
    const usEur = (i.invested * us) / 100
    add(
      'me-us-eur',
      'Investments in the US',
      `${eur(usEur)} · ${Math.round(us)}% of ${eur(i.invested)}`,
    )
    if (fx) {
      const moved = usEur * (1 / (1 + fx.change / 100) - 1)
      add(
        'me-dollar',
        'From the dollar this month',
        `${signed(moved)} · €1 ${fx.change > 0 ? '▲' : '▼'} ${pc(fx.change)} in dollars on ${eur(usEur)}`,
        moved > 0 ? 'good' : moved < 0 ? 'bad' : null,
      )
    }
  }

  /* A sale today: the gain and Portugal's 28% on it. */
  for (const o of i.owned ?? []) {
    if (o.paid === null || o.valueEur === null) continue
    const gain = o.valueEur - o.paid
    if (gain <= 0) continue
    add(
      `me-tax-${o.symbol.toUpperCase()}`,
      `Tax if ${o.name} is sold today`,
      `${signed(-(gain * PT_GAINS_TAX) / 100)} · ${PT_GAINS_TAX}% of ${eur(gain)} profit`,
      'bad',
    )
  }
  return out
}

/** The IDEAS lines a read line may point at: one fact per line with an
    amount, so the model names a move and the app takes the words, part
    and € from the board. */
export function ideaFacts(lines: ReadonlyArray<BoardLine> | null) {
  return (lines ?? [])
    .filter((l) => l.call === 'add' && l.eur > 0)
    .map((l): Fact => ({
      key: `idea-${l.ticker.toUpperCase()}`,
      label: `IDEAS · ${l.name}`,
      value: `${eur(l.eur)} · ${l.part}`,
      tone: null,
    }))
}

/** The move a read line points at, on the board as it is now. */
export function ideaOf(
  ticker: string | undefined,
  lines: ReadonlyArray<BoardLine> | null,
): BoardLine | null {
  if (!ticker) return null
  return (
    (lines ?? []).find(
      (l) =>
        l.ticker.toUpperCase() === ticker.toUpperCase() &&
        l.call === 'add' &&
        l.eur > 0,
    ) ?? null
  )
}

/** A move in words, as the button says it. */
export function moveWords(
  l: Pick<BoardLine, 'part' | 'name' | 'ticker' | 'eur'>,
) {
  const amount = eur(l.eur)
  if (l.part === 'protect') return `Move ${amount} to ${l.ticker}`
  if (l.part === 'add') return `Buy ${l.name} for ${amount}`
  return `Put ${amount} into ${l.name} (${l.ticker})`
}

/** A fact as a box: the number first, then what it is. */
export function boxOf(f: Fact) {
  const [v, ...rest] = f.value.split(' · ')
  return { label: f.label, value: v, note: rest.join(' · ') }
}

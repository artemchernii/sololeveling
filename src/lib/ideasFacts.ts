import { STRIP, tickerFactLines } from './ideasBoard'
import type { Cell, Movers, TickerFacts } from './ideasBoard'
import type { Fact } from './marketRead'

/* The facts the IDEAS read is given (29 Oct): the app's own numbers —
   cash, spending, holdings, each ticker's fetched price and signals, the
   strip and the movers. Each has a key; a NUMBERS row of the model's names
   one and the app prints it. Pure. */

const DAY_MS = 86_400_000
const eur = (n: number) =>
  `€${Math.round(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0

export type Cash = {
  /** Free cash and broker cash, in euros: what is not invested. */
  idle: number
  banks: number
  broker: number
  /** Everything: cash and investments. */
  worth: number
}

type Bill = {
  kind: 'expense' | 'income'
  amount: number
  cadence: 'monthly' | 'yearly'
  everyMonths?: number
  everyWeeks?: number
}

/** A month of spending as Flow reads it: bills at their monthly size and
    the rest — spending that is not a bill — over the whole past months. */
export function spendOf(a: {
  bills: Array<Bill>
  rest: Array<{ sum: number; partial: Array<unknown> }>
}): { bills: number; rest: number } {
  const bills = a.bills
    .filter((b) => b.kind === 'expense')
    .reduce((t, b) => {
      const each = Math.abs(b.amount)
      if (b.everyWeeks) return t + (each * 52) / 12 / b.everyWeeks
      if (b.cadence === 'yearly') return t + each / 12
      return t + each / (b.everyMonths ?? 1)
    }, 0)
  const whole = a.rest.filter((r) => r.partial.length === 0 && r.sum !== 0)
  const rest =
    whole.length === 0
      ? 0
      : whole.reduce((t, r) => t + Math.abs(r.sum), 0) / whole.length
  return { bills: Math.round(bills), rest: Math.round(rest) }
}

export type Holding = {
  symbol: string
  name: string
  valueEur: number | null
}

/** Each holding's share of MINE, in percent, by symbol. */
export function shareOfMine(held: ReadonlyArray<Holding>) {
  const total = held.reduce((t, h) => t + (h.valueEur ?? 0), 0)
  return new Map(
    held.map((h) => [
      h.symbol.toUpperCase(),
      h.valueEur === null || total <= 0
        ? null
        : Math.round((h.valueEur / total) * 1000) / 10,
    ]),
  )
}

export function ideasFacts(i: {
  cash: Cash
  spend: { bills: number; rest: number } | null
  held: ReadonlyArray<Holding>
  tickers: ReadonlyArray<TickerFacts>
  strip: ReadonlyArray<{
    id: string
    cell: Pick<Cell, 'price' | 'change'> | null
  }>
  movers: Movers | null
  /** The room's own: allocation (alloc-) and results days (earn-). */
  extra: ReadonlyArray<Fact>
}): Array<Fact> {
  const out: Array<Fact> = []
  const add = (key: string, label: string, value: string) =>
    out.push({ key, label, value, tone: null })
  const c = i.cash
  add(
    'cash-idle',
    'CASH · NOT INVESTED',
    `${eur(c.idle)} · ${pct(c.idle, c.worth)}% of ${eur(c.worth)}`,
  )
  add('cash-banks', 'IN BANKS', eur(c.banks))
  add('cash-broker', 'BROKER CASH', eur(c.broker))
  if (i.spend) {
    add(
      'spend-month',
      'SPENDING A MONTH',
      `${eur(i.spend.bills + i.spend.rest)} (bills ${eur(i.spend.bills)} · day-to-day ${eur(i.spend.rest)})`,
    )
  }
  const share = shareOfMine(i.held)
  const mine = i.held.reduce((t, h) => t + (h.valueEur ?? 0), 0)
  add('mine', 'MINE', `${eur(mine)} in ${i.held.length} holdings`)
  for (const h of i.held) {
    const s = share.get(h.symbol.toUpperCase())
    add(
      `pos-${h.symbol.toUpperCase()}`,
      `${h.name} ${h.symbol}`,
      h.valueEur === null
        ? 'no price'
        : `${eur(h.valueEur)} · ${s ?? 0}% of MINE`,
    )
  }
  for (const t of i.tickers)
    add(
      `tk-${t.symbol.toUpperCase()}`,
      t.symbol,
      tickerFactLines(t).join(' · '),
    )
  for (const s of i.strip) {
    const def = STRIP.find((x) => x.id === s.id)
    if (!def || !s.cell) continue
    const v =
      def.unit === 'yield'
        ? `${s.cell.price.toFixed(2)}% (${s.cell.change > 0 ? '+' : ''}${s.cell.change.toFixed(2)} pts today)`
        : `${s.cell.price.toLocaleString('en-GB', { maximumFractionDigits: 2 })} (${s.cell.change > 0 ? '+' : ''}${s.cell.change}% today)`
    add(`mk-${s.id}`, def.name, v)
  }
  for (const [list, rows] of Object.entries(i.movers ?? {}))
    if (rows && rows.length)
      add(
        `mv-${list}`,
        `US ${list.toUpperCase()} TODAY`,
        rows
          .map((m) => `${m.symbol} ${m.change > 0 ? '+' : ''}${m.change}%`)
          .join(', '),
      )
  out.push(...i.extra)
  return out
}

/** A read older than this asks to be read again (his "once a day"). */
export const OLD_MS = DAY_MS

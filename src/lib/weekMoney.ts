import { companyOf } from './marketWeek'
import type { WeekKind } from './marketWeek'
import type { RegionTag } from './tags'

/* YOUR MONEY under a story of THE WEEK (30 Oct; spec
   docs/specs/2026-10-30-market.md, mockup market-story.html): what he has
   in the story, from his own accounts — never the model's. Each kind maps
   to a set of holdings: rates → cash in euros, earn → held companies that
   reported (YOUR COMPANIES' results), eu → European holdings and euro
   cash, gold → gold, em → emerging holdings, mkt → all investments. A
   share is the holdings' euros over all valued euros, as ALLOCATION
   counts it. Nothing held → a grey row. Pure. */

export type MoneyHeld = {
  symbol: string
  name: string
  kind: 'stock' | 'etf' | 'gold' | 'crypto'
  valueEur: number | null
  /** Portfolio's region tag; null when not read. */
  region: RegionTag | null
}
export type MoneyInput = {
  held: ReadonlyArray<MoneyHeld> | null
  /** Cash in euros, banks and broker; null while not read. */
  cash: number | null
  /** Held companies with results out in the window, by ticker. */
  reported: ReadonlySet<string>
}
export type MoneyChip = {
  /** The ticker for its logo; null for cash or a total. */
  symbol: string | null
  name: string
  eur: number
  /** Percent of valued investments, when it is a part of them. */
  share: number | null
}
export type Money = { chips: Array<MoneyChip>; total: string; zero: boolean }

const eur = (n: number) => `€${Math.round(n).toLocaleString('en-GB')}`
const base = (s: string) => s.split('.')[0].toUpperCase()

/** What he has in a story, or null where a story touches nothing of his
    (a none story) or his money is not read yet. */
export function weekMoney(
  kind: WeekKind,
  factKeys: ReadonlyArray<string>,
  i: MoneyInput,
): Money | null {
  if (kind === 'none' || i.held === null) return null
  const valued = i.held.filter((h) => (h.valueEur ?? 0) > 0)
  const total = valued.reduce((s, h) => s + (h.valueEur ?? 0), 0)
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const chipsOf = (hs: ReadonlyArray<MoneyHeld>): Array<MoneyChip> =>
    [...hs]
      .sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0))
      .map((h) => ({
        symbol: h.symbol,
        name: h.name,
        eur: h.valueEur ?? 0,
        share: share(h.valueEur ?? 0),
      }))
  const sum = (hs: ReadonlyArray<MoneyHeld>) =>
    hs.reduce((s, h) => s + (h.valueEur ?? 0), 0)
  const cash: Array<MoneyChip> =
    i.cash !== null && i.cash > 0
      ? [{ symbol: null, name: 'Cash in euros', eur: i.cash, share: null }]
      : []

  /* The Fed moves his US shares; the ECB his euro cash (31 Oct: "why
     we show this"). */
  if (kind === 'rates') {
    const us = factKeys.some((k) => /^(fed|us-|mkt-us10y)/.test(k))
    const eu = factKeys.some((k) => k.startsWith('ecb'))
    const hs = us ? valued.filter((h) => h.region === 'us') : []
    if (us && hs.length > 0 && !eu)
      return {
        chips: chipsOf(hs).slice(0, 4),
        total: `${eur(sum(hs))} · ${share(sum(hs))}% of investments in the US`,
        zero: false,
      }
    return cash.length > 0
      ? { chips: cash, total: 'follows the ECB rate', zero: false }
      : null
  }

  /* A story of companies: the ones of them he holds. */
  if (kind === 'crash') {
    const named = new Set(factKeys.flatMap((k) => companyOf(k) ?? []).map(base))
    const hs = valued.filter((h) => named.has(base(h.symbol)))
    return hs.length > 0
      ? {
          chips: chipsOf(hs),
          total: `${eur(sum(hs))} in these companies`,
          zero: false,
        }
      : { chips: [], total: 'none held', zero: true }
  }

  if (kind === 'earn') {
    const hs = valued.filter((h) => i.reported.has(base(h.symbol)))
    return hs.length > 0
      ? {
          chips: chipsOf(hs),
          total: `${eur(sum(hs))} in companies that reported`,
          zero: false,
        }
      : { chips: [], total: 'no company held reported', zero: true }
  }

  if (kind === 'eu') {
    const hs = valued.filter((h) => h.region === 'europe')
    return {
      chips: [...chipsOf(hs), ...cash],
      total: `${share(sum(hs))}% of investments in Europe`,
      zero: hs.length === 0 && cash.length === 0,
    }
  }

  if (kind === 'gold') {
    const hs = valued.filter((h) => h.kind === 'gold')
    return hs.length > 0
      ? {
          chips: chipsOf(hs),
          total: `${share(sum(hs))}% of investments in gold`,
          zero: false,
        }
      : { chips: [], total: 'nothing in gold · 0% of investments', zero: true }
  }

  if (kind === 'em') {
    const hs = valued.filter((h) => h.region === 'emerging')
    if (hs.length > 0)
      return {
        chips: chipsOf(hs),
        total: `${share(sum(hs))}% in emerging markets`,
        zero: false,
      }
    const place = factKeys.includes('reg-brazil')
      ? 'Brazil'
      : factKeys.includes('reg-china')
        ? 'China'
        : 'emerging markets'
    return {
      chips: [],
      total:
        place === 'emerging markets'
          ? 'nothing in emerging markets · 0% of investments'
          : `nothing in ${place} · 0% in emerging markets`,
      zero: true,
    }
  }

  /* mkt: all investments, and the US part of them. */
  if (total === 0) return null
  const us = valued.filter((h) => h.region === 'us')
  return {
    chips: [{ symbol: null, name: 'Investments', eur: total, share: null }],
    total: `${share(sum(us))}% in the US`,
    zero: false,
  }
}

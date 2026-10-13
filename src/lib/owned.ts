import { kindOf } from './logo'
import type { Kind } from './logo'

/* Everything owned, one row a thing (12 Oct: "portfolio + a page for one
   ticker"). The same company at two brokers was two rows; here it is one,
   with the accounts under it. Sums only of what the rows already carry —
   and a gain only where every part's cost is known, never against zero. */

export type Held = {
  accountId: string
  instrumentId: string
  symbol: string
  name: string
  type: string
  shares: number
  paid: number | null
  valueEur: number | null
  staked: number
}

export type Owned<T extends Held = Held> = {
  instrumentId: string
  symbol: string
  name: string
  type: string
  kind: Kind
  shares: number
  /** Null when any account's cost is not known. */
  paid: number | null
  /** Null when any account's part has no value yet. */
  valueEur: number | null
  staked: number
  /** What the staked coins are worth, at the same price as the rest. */
  stakedEur: number | null
  at: ReadonlyArray<T>
}

const cents = (n: number) => Math.round(n * 100) / 100

/* One company or fund is one row, whichever exchange it was bought on
   (13 Oct: Novo Nordisk showed as three — Frankfurt, New York and
   Copenhagen): the same name and the same kind of thing. */
const sameThing = (r: Held) => `${r.type}|${r.name.trim().toLowerCase()}`

export function combine<T extends Held>(
  rows: ReadonlyArray<T>,
): Array<Owned<T>> {
  const by = new Map<string, Array<T>>()
  for (const r of rows) {
    const key = sameThing(r)
    const list = by.get(key)
    if (list) list.push(r)
    else by.set(key, [r])
  }
  return [...by.values()].map((parts) => {
    /* The listing worth the most leads: its code, its price, its page. */
    const lead = [...parts].sort(
      (a, b) => (b.valueEur ?? -1) - (a.valueEur ?? -1),
    )[0].instrumentId
    const at = [
      ...parts.filter((r) => r.instrumentId === lead),
      ...parts.filter((r) => r.instrumentId !== lead),
    ]
    const first = at[0]
    const shares = at.reduce((t, r) => t + r.shares, 0)
    const staked = at.reduce((t, r) => t + r.staked, 0)
    const valueEur = at.some((r) => r.valueEur === null)
      ? null
      : cents(at.reduce((t, r) => t + (r.valueEur ?? 0), 0))
    const paid = at.some((r) => r.paid === null)
      ? null
      : cents(at.reduce((t, r) => t + (r.paid ?? 0), 0))
    return {
      instrumentId: first.instrumentId,
      symbol: first.symbol,
      name: first.name,
      type: first.type,
      kind: kindOf(first),
      shares: Number(shares.toFixed(8)),
      paid,
      valueEur,
      staked,
      stakedEur:
        staked > 0 && valueEur !== null && shares > 0
          ? cents((valueEur / shares) * staked)
          : null,
      at,
    }
  })
}

/** Worth against what was paid; null where either is not known. */
export function gainOf(o: Pick<Owned, 'paid' | 'valueEur'>) {
  if (o.paid === null || o.valueEur === null) return null
  const eur = cents(o.valueEur - o.paid)
  return { eur, pct: o.paid > 0 ? (eur / o.paid) * 100 : 0 }
}

export type Order = 'worth' | 'up' | 'down'

/** Biggest first, or by gain in percent; one with no gain known is last. */
export function ordered<T extends Owned>(
  list: ReadonlyArray<T>,
  by: Order,
): Array<T> {
  const worth = (o: T) => o.valueEur ?? -1
  return [...list].sort((a, b) => {
    if (by === 'worth') return worth(b) - worth(a)
    const ga = gainOf(a)
    const gb = gainOf(b)
    if (ga === null || gb === null)
      return ga === gb ? worth(b) - worth(a) : ga === null ? 1 : -1
    return by === 'up' ? gb.pct - ga.pct : ga.pct - gb.pct
  })
}

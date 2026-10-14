/* A position's buys and sells cut where it was held at zero (14 Oct,
   mockup position-rounds.html). His iShares Physical Gold: bought and
   sold out in 2023, bought again from 16 Apr 2026 — PAID and its
   counts speak of the round now held, and each closed round keeps its
   own BUY and SELL sums in the list. Log sums over a stated period
   (CLAUDE.md, source 1): each round says its first and last day. */

type Trade = {
  occurredAt: number
  side: 'buy' | 'sell'
  shares: number
  priceEur: number
  /** Staking or a split: shares in, no money. */
  reward?: boolean
  split?: boolean
}

export type Round<T extends Trade> = {
  /** Still held at its end: the round now. */
  open: boolean
  from: number
  to: number
  /** Its trades, newest first. */
  trades: Array<T>
  buys: number
  sells: number
  buyEur: number
  sellEur: number
}

/** Below this, what is held is zero (rounding in the files). */
const ZERO = 1e-6
const cents = (n: number) => Math.round(n * 100) / 100

/** The rounds, newest first; the first is open when anything is held. */
export function rounds<T extends Trade>(
  all: ReadonlyArray<T>,
): Array<Round<T>> {
  const out: Array<Round<T>> = []
  let now: Array<T> = []
  let held = 0
  const close = (open: boolean) => {
    if (now.length === 0) return
    const paid = now.filter((t) => !t.reward && !t.split)
    const buys = paid.filter((t) => t.side === 'buy')
    const sells = paid.filter((t) => t.side === 'sell')
    out.push({
      open,
      from: now[0].occurredAt,
      to: now[now.length - 1].occurredAt,
      trades: [...now].reverse(),
      buys: buys.length,
      sells: sells.length,
      buyEur: cents(buys.reduce((s, t) => s + t.shares * t.priceEur, 0)),
      sellEur: cents(sells.reduce((s, t) => s + t.shares * t.priceEur, 0)),
    })
    now = []
  }
  for (const t of [...all].sort((a, b) => a.occurredAt - b.occurredAt)) {
    now.push(t)
    held += t.side === 'sell' ? -t.shares : t.shares
    if (t.side === 'sell' && held <= ZERO) {
      close(false)
      held = 0
    }
  }
  close(true)
  return out.reverse()
}

/* Targets (31 Oct, docs/specs/2026-10-31-targets.md, mockup
   targets.html). His own euros per bucket — "up to 2k max, 3-5k gold, 5k
   bonds, and rest are stocks"; stocks got its own range the same night,
   "rest is a bit weird") — against what each holds now, and the cash to
   place split by one rule: buckets under their min, in proportion to what
   each misses; what is left stays cash. Pure, so it is tested; nothing
   here is stored. */

import { kindOf } from './logo'

export type Bucket = 'stocks' | 'gold' | 'bonds' | 'crypto'
export type Target = { bucket: Bucket; min: number; max: number }

export const BUCKETS: ReadonlyArray<Bucket> = [
  'stocks',
  'gold',
  'bonds',
  'crypto',
]

/* A fund of bonds says so in its name. */
const BOND =
  /\b(bonds?|treasury|treasuries|govt|government|aggregate|gilts?)\b/i

/** Which bucket a position counts in: every fund that is not bonds or
    gold is with the stocks. */
export function bucketOf(p: {
  symbol: string
  type: string
  name: string
}): Bucket {
  const kind = kindOf(p)
  if (kind === 'crypto' || kind === 'gold') return kind
  if (kind === 'etf' && BOND.test(p.name)) return 'bonds'
  return 'stocks'
}

/** The euros each bucket holds now: its valued positions' sum. */
export function nowBy(
  rows: ReadonlyArray<{
    symbol: string
    type: string
    name: string
    valueEur: number | null
  }>,
): Record<Bucket, number> {
  const sum: Record<Bucket, number> = {
    stocks: 0,
    gold: 0,
    bonds: 0,
    crypto: 0,
  }
  for (const r of rows) if (r.valueEur !== null) sum[bucketOf(r)] += r.valueEur
  return sum
}

export type Mark =
  { kind: 'in' } | { kind: 'add'; eur: number } | { kind: 'above'; max: number }

/** A bucket's badge: inside its range, what is to add, or above it. */
export function markOf(now: number, t: Target): Mark {
  if (now < t.min) return { kind: 'add', eur: t.min - now }
  if (now > t.max) return { kind: 'above', max: t.max }
  return { kind: 'in' }
}

/** Cash waiting: free cash (banks and cash) and cash at brokers. */
export function toPlace(free: number, atBrokers: number) {
  return Math.max(0, free + atBrokers)
}

export type Put = { bucket: Bucket | 'cash'; eur: number; misses: number }

/** The cash split by the rule, in whole euros that add up to it; what no
    bucket misses stays cash. */
export function split(
  cash: number,
  now: Record<Bucket, number>,
  targets: ReadonlyArray<Target>,
): Array<Put> {
  const whole = Math.floor(cash)
  if (whole <= 0) return []
  const missing = targets
    .map((t) => ({
      bucket: t.bucket,
      misses: Math.max(0, t.min - now[t.bucket]),
    }))
    .filter((m) => m.misses > 0)
  const total = missing.reduce((s, m) => s + m.misses, 0)
  const toTargets = Math.min(whole, Math.floor(total))
  const puts: Array<Put> = missing.map((m) => ({
    ...m,
    eur: total > 0 ? Math.floor((toTargets * m.misses) / total) : 0,
  }))
  /* What flooring left over goes to the bucket that misses most. */
  const short = toTargets - puts.reduce((s, p) => s + p.eur, 0)
  if (short > 0)
    puts.reduce((a, b) => (b.misses > a.misses ? b : a)).eur += short
  if (whole > toTargets)
    puts.push({ bucket: 'cash', eur: whole - toTargets, misses: 0 })
  return puts.filter((p) => p.eur > 0)
}

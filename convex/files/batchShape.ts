import { v } from 'convex/values'

import { sumCheckValue } from '../rowBalance'
import { sharesValue } from '../sharesCheck'
import { totalValue } from '../holdingsTotal'
import { transferValue } from '../transferMatch'
import type { Doc } from '../_generated/dataModel'
import { tickerBase } from '../../src/lib/market'
import { completePosition } from '../../src/lib/intake'

/* The shapes a batch review returns, and the small helpers gatherBatch
   (batch.ts) reads a drop with. Split from batch.ts on 21 Nov, when it
   passed 890 lines. */

const monthState = v.union(
  v.literal('none'),
  v.literal('had'),
  v.literal('add'),
  v.literal('hole'),
)

export const reading = v.object({ asOf: v.number(), value: v.number() })

export const batchAsk = v.union(
  /* Read, but nothing on it says whose — a screenshot, mostly. */
  v.object({
    kind: v.literal('whose'),
    intakeId: v.id('intakes'),
    name: v.string(),
    image: v.boolean(),
    /* What it found, so he can tell which it is. */
    what: v.union(
      v.literal('transactions'),
      v.literal('holdings'),
      v.literal('trades'),
    ),
    rows: v.number(),
    from: v.union(v.number(), v.null()),
    to: v.union(v.number(), v.null()),
    investedEur: v.union(v.number(), v.null()),
    cashEur: v.union(v.number(), v.null()),
    seen: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal('hole'),
    accountId: v.id('accounts'),
    month: v.string(),
  }),
  v.object({
    kind: v.literal('oneSide'),
    intakeId: v.id('intakes'),
    index: v.number(),
    accountId: v.id('accounts'),
    amount: v.number(),
    occurredAt: v.number(),
    merchant: v.string(),
    /* The account it trades money with most — offered first. */
    likely: v.union(v.id('accounts'), v.null()),
  }),
  v.object({
    kind: v.literal('gap'),
    key: v.string(),
    accountId: v.id('accounts'),
    from: v.number(),
    to: v.number(),
    gap: v.number(),
  }),
  /* A broker screen with positions the app cannot complete on its own —
     checked on the screen that can. */
  v.object({
    kind: v.literal('holdings'),
    intakeId: v.id('intakes'),
    name: v.string(),
    accountId: v.id('accounts'),
    missing: v.number(),
    positions: v.number(),
  }),
  v.object({
    kind: v.literal('failed'),
    intakeId: v.id('intakes'),
    name: v.string(),
    image: v.boolean(),
    error: v.string(),
    retryable: v.boolean(),
  }),
)

export const batchAccount = v.object({
  /* His account — or null for a bank the app knows that he has not added:
     the block shows what the files say, and one tap keeps it. */
  accountId: v.union(v.id('accounts'), v.null()),
  product: v.union(
    v.object({
      id: v.string(),
      name: v.string(),
      accountTail: v.union(v.string(), v.null()),
      holder: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  leftOut: v.boolean(),
  files: v.array(
    v.object({
      intakeId: v.id('intakes'),
      name: v.string(),
      kind: v.union(
        v.literal('transactions'),
        v.literal('holdings'),
        v.literal('trades'),
      ),
      image: v.boolean(),
      /* Rows the bank itself sent: no file was read. */
      bank: v.boolean(),
    }),
  ),
  fresh: v.number(),
  had: v.number(),
  /* The file prints a balance the account does not hold yet. */
  balanceNews: v.boolean(),
  /* Does it add up (11 Oct): null when the account holds no balance. */
  check: v.union(sumCheckValue, v.null()),
  /* Rows that are one side of a transfer between two of his accounts
     (12 Oct, convex/transferMatch.ts). */
  transfers: v.array(transferValue),
  /* It does not, and he has not said what to do: apply leaves it. */
  held: v.boolean(),
  trades: v.number(),
  /* A trading history against the account's shares (11 Oct). */
  shares: v.union(sharesValue, v.null()),
  holdings: v.union(
    v.object({
      positions: v.number(),
      investedEur: v.number(),
      cashEur: v.union(v.number(), v.null()),
      totalEur: v.union(v.number(), v.null()),
      complete: v.boolean(),
      /* The positions and the cash against the printed total (11 Oct). */
      total: totalValue,
    }),
    v.null(),
  ),
  first: v.union(reading, v.null()),
  last: v.union(reading, v.null()),
  months: v.array(monthState),
  gaps: v.number(),
  /* Pending rows that explain the last balance (an app's "Pending −1,205"
     already taken off what it shows). */
  pending: v.number(),
  rows: v.array(
    v.object({
      occurredAt: v.number(),
      merchant: v.string(),
      amount: v.number(),
      kind: v.union(v.literal('spend'), v.literal('income'), v.literal('move')),
      category: v.union(v.string(), v.null()),
      had: v.boolean(),
      pending: v.boolean(),
    }),
  ),
})

/** Signed as the account sees it: money out is negative. */
export function signedLog(l: Doc<'logs'>): number {
  const value = l.value ?? 0
  return l.kind === 'expense' ? -value : value
}

export const isImage = (i: Doc<'intakes'>) =>
  (i.files ?? []).some((f) => f.contentType.startsWith('image/'))

/* What a broker's screens in one drop show together: Trading 212 puts
   the positions on one screen and the cash on another (3 Oct). */
export function mergedHoldings(list: ReadonlyArray<Doc<'intakes'>>) {
  const screens = list.filter((i) => i.kind === 'holdings')
  if (screens.length === 0) return null
  /* Two scrolls of one list overlap (3 Oct: IMG_9239 and IMG_9250 both
     show the six ETFs): one position per fund, the later reading's. */
  const byFund = new Map<
    string,
    NonNullable<Doc<'intakes'>['positions']>[number]
  >()
  for (const i of [...screens].sort(
    (a, b) => (a.readAt ?? a._creationTime) - (b.readAt ?? b._creationTime),
  ))
    for (const p of i.positions ?? []) {
      const c =
        p.preferred !== undefined && p.preferred >= 0
          ? p.candidates[p.preferred]
          : undefined
      byFund.set(c ? tickerBase(c.symbol) : `name:${p.name}`, p)
    }
  const positions = [...byFund.values()]
  const rows = positions.map((p) => {
    const c = completePosition(p, p.todayPriceEur)
    /* -1: no listing's price fits what the screen printed — asked, not
       filed under the first search hit. */
    const pick =
      p.preferred === undefined
        ? p.candidates.at(0)
        : p.preferred >= 0
          ? p.candidates[p.preferred]
          : undefined
    const paid =
      p.valueEur !== undefined &&
      p.changePct !== undefined &&
      p.changePct > -100
        ? Math.round((p.valueEur / (1 + p.changePct / 100)) * 100) / 100
        : undefined
    return pick !== undefined && c.shares !== undefined && c.shares > 0
      ? {
          candidate: pick,
          isin: p.isin,
          shares: c.shares,
          paidEur: paid,
          sharesCalculated: c.sharesCalculated || undefined,
        }
      : null
  })
  const cash = screens.find((i) => i.cashEur !== undefined)?.cashEur
  /* One screen's total may be the positions alone (212's list: €2,014),
     another the whole account (its summary: €15,008): the account's is
     the larger. */
  const totals = screens.flatMap((i) =>
    i.totalEur === undefined ? [] : [i.totalEur],
  )
  const total = totals.length ? Math.max(...totals) : undefined
  return {
    screens,
    rows,
    cashEur: cash ?? null,
    totalEur: total ?? null,
    /* Each position as printed, for the check against the total. */
    values: positions.map((p) => p.valueEur),
    lines: positions.map((p) => {
      const c = p.candidates.at(p.preferred ?? 0)
      return {
        name: p.name,
        symbol: c?.symbol ?? null,
        type: c?.type ?? null,
        valueEur: p.valueEur ?? null,
      }
    }),
    investedEur:
      Math.round(positions.reduce((t, p) => t + (p.valueEur ?? 0), 0) * 100) /
      100,
    missing: rows.filter((r) => r === null).length,
  }
}

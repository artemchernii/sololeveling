import { movedSince, tradedSince } from './moves'
import { v } from 'convex/values'
import { brokerCashKey, hasBrokerCash } from '../accounts'
import { balanceSeries } from '../../src/lib/cashHistory'
import type { Move } from '../../src/lib/cashHistory'
import { closeLooks, heldDays } from '../../src/lib/worthHistory'
import { ownMoves } from '../../src/lib/accountLines'
import type { Close, Holding, Rate } from '../../src/lib/worthHistory'
import { lookFamily, notSeenSince, reconcile } from '../../src/lib/holdings'
import { soldPart } from '../../src/lib/sold'
import type { LedgerTrade, Observation } from '../../src/lib/holdings'
import { readLedgerTrades } from '../ledgers'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

/* The money reads behind aggregate.ts: positions, balances, cash and
   invested history. Plain helpers, no registered functions; the queries
   that call them stay in aggregate.ts (PLAN.md §1). */

/* Accounts and holdings are few; these bound the reads generously. */
const ACCOUNT_ROWS = 50

/* His Revolut export alone is 3,595 trades since 2020 (27 Sep). */
export const TRADE_ROWS = 6000

/* A screen of 15 positions a month for years. */
const HOLDING_ROWS = 3000

/**
 * Each live account's FREE CASH, and the total (Finances F2) — money not
 * in shares; what its positions are worth is `worth`'s other half.
 *
 * Each balance is source 2, the latest `balance:<id>` state. The total is
 * a sum of those latest states, allowed on 26 Sep on the sum rule's
 * conditions (PLAN.md §1): euros only, and never shown without
 * `oldestAt`, the reading furthest back in it, so a total made partly of a
 * month-old number cannot look fresh. An account with no reading yet is
 * counted in `unread` and added to nothing.
 *
 * Since 27 Sep ("adding money"), a pocket is its latest reading PLUS the
 * money that moved in it after that reading — its logs (spending, money
 * in, both sides of a transfer) and, in a broker's euro pocket, what its
 * buys cost and its sells brought (`trades`, never an `opening` one). That
 * is source 2 plus a source-1 sum over rows that open: `moved` and
 * `movedRows` say how much and how many, so the number is never a bare
 * one. The reading always wins over what came before it — a statement
 * that disagrees resets the pocket.
 */
export const pocket = v.object({
  currency: v.string(),
  /** As read plus what moved since, in its own currency. */
  value: v.union(v.number(), v.null()),
  recordedAt: v.union(v.number(), v.null()),
  /** The reading alone, and what moved in the pocket after it. */
  read: v.union(v.number(), v.null()),
  moved: v.number(),
  movedRows: v.number(),
  /** In euros at the latest stored ECB rate; null without a reading or a
      rate — never guessed. */
  eur: v.union(v.number(), v.null()),
  rateAsOf: v.union(v.number(), v.null()),
  /** Where the reading came from, and when he gave it — which may be long
      after the day it is true for (an August statement read today). */
  source: v.union(
    v.literal('typed'),
    v.literal('statement'),
    v.literal('screenshot'),
    v.literal('sync'),
    v.null(),
  ),
  writtenAt: v.union(v.number(), v.null()),
})

/* Pence: London quotes in GBp, a hundredth of the pound the rate is for. */
export function quoteToRate(currency: string): {
  base: string
  divide: number
} {
  return currency === 'GBp' || currency === 'GBX'
    ? { base: 'GBP', divide: 100 }
    : { base: currency, divide: 1 }
}

/* One position as the room reads it. */
export const positionRow = {
  accountId: v.id('accounts'),
  instrumentId: v.id('instruments'),
  symbol: v.string(),
  name: v.string(),
  type: v.string(),
  currency: v.string(),
  shares: v.number(),
  paid: v.union(v.number(), v.null()),
  /** What he paid in dollars, at each day's ECB rate (10 Oct). */
  paidUsd: v.union(v.number(), v.null()),
  status: v.union(
    v.literal('trades'),
    v.literal('match'),
    v.literal('screen'),
    v.literal('gap'),
    v.literal('over'),
  ),
  seenAt: v.union(v.number(), v.null()),
  gap: v.number(),
  /** A later screen of the account left it out. */
  notSeen: v.boolean(),
  price: v.union(v.number(), v.null()),
  priceAsOf: v.union(v.number(), v.null()),
  rate: v.union(v.number(), v.null()),
  rateAsOf: v.union(v.number(), v.null()),
  valueEur: v.union(v.number(), v.null()),
  /** Coins given for holding it (staking), in its own units. */
  staked: v.number(),
}

export async function readBalances(ctx: QueryCtx, ownerId: string) {
  const accounts = (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(ACCOUNT_ROWS)
  ).filter((a) => a.retiredAt === undefined)

  const rates = new Map<string, { rate: number; asOf: number } | null>()
  async function rateFor(currency: string) {
    if (currency === 'EUR') return { rate: 1, asOf: null as number | null }
    if (!rates.has(currency)) {
      const row = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q.eq('ownerId', ownerId).eq('currency', currency),
        )
        .order('desc')
        .first()
      rates.set(
        currency,
        row === null ? null : { rate: row.rate, asOf: row.asOf },
      )
    }
    const r = rates.get(currency) ?? null
    return r === null ? null : { rate: r.rate, asOf: r.asOf as number | null }
  }

  let cents = 0
  let oldestAt: number | null = null
  let unread = 0
  const out = []
  for (const account of accounts) {
    const pockets = []
    let accountCents = 0
    for (const currency of account.currencies) {
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', `balance:${account._id}:${currency}`),
        )
        .order('desc')
        .first()
      const read = row?.value ?? null
      const since =
        row === null
          ? { cents: 0, rows: 0 }
          : await movedSince(ctx, ownerId, account, currency, row.recordedAt)
      const value =
        read === null ? null : (Math.round(read * 100) + since.cents) / 100
      const rate = await rateFor(currency)
      const eur =
        value === null || rate === null
          ? null
          : Math.round(value * rate.rate * 100) / 100
      if (eur === null || row === null) {
        unread++
      } else {
        accountCents += Math.round(eur * 100)
        oldestAt =
          oldestAt === null
            ? row.recordedAt
            : Math.min(oldestAt, row.recordedAt)
      }
      pockets.push({
        currency,
        value,
        recordedAt: row?.recordedAt ?? null,
        read,
        moved: since.cents / 100,
        movedRows: since.rows,
        eur,
        rateAsOf: rate?.asOf ?? null,
        source: row?.source ?? null,
        writtenAt: row?._creationTime ?? null,
      })
    }
    cents += accountCents
    let brokerCash = null
    if (hasBrokerCash(account)) {
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ownerId).eq('key', brokerCashKey(account._id)),
        )
        .order('desc')
        .first()
      if (row === null) {
        unread++
        brokerCash = { eur: null, recordedAt: null, moved: 0, movedRows: 0 }
      } else {
        const since = await tradedSince(ctx, ownerId, account, row.recordedAt)
        const now = Math.round((row.value ?? 0) * 100) + since.cents
        cents += now
        oldestAt =
          oldestAt === null
            ? row.recordedAt
            : Math.min(oldestAt, row.recordedAt)
        brokerCash = {
          eur: now / 100,
          recordedAt: row.recordedAt,
          moved: since.cents / 100,
          movedRows: since.rows,
        }
      }
    }
    out.push({
      accountId: account._id,
      name: account.name,
      kinds: account.kinds,
      domain: account.domain ?? null,
      pockets,
      cashEur: accountCents / 100,
      brokerCash,
    })
  }
  return { accounts: out, total: cents / 100, oldestAt, unread }
}

export async function readCashHistory(
  ctx: QueryCtx,
  ownerId: string,
  dayEnds: ReadonlyArray<number>,
) {
  const accounts = (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(ACCOUNT_ROWS)
  ).filter((a) => a.retiredAt === undefined)
  const out = []
  const total: Array<number | null> = dayEnds.map(() => null)
  const live = new Set(accounts.map((a) => a._id))
  /* Lines first read inside the range (20 Oct: the Revolut broker cash,
     read on the 20th, made Today's worth ▲€17k since Sep 30). */
  const starts: Array<{
    accountId: Id<'accounts'>
    at: number
    value: number
  }> = []
  const startAt = (
    accountId: Id<'accounts'>,
    series: ReadonlyArray<number | null>,
    from: number,
    rate: number,
  ) => {
    const k = series.findIndex((x, i) => x !== null && dayEnds[i] >= from)
    if (k <= 0) return
    starts.push({
      accountId,
      at: dayEnds[k],
      value: Math.round((series[k] ?? 0) * rate * 100) / 100,
    })
  }
  /* Rows of money moving between his own accounts, for the chart's lane
     (src/lib/accountLines, ownMoves). */
  const moveRows: Array<{
    at: number
    accountId: Id<'accounts'>
    value: number
    otherAccountId: Id<'accounts'> | null
  }> = []
  for (const account of accounts) {
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', account._id),
      )
      .take(HISTORY_ROWS)
    for (const l of logs) {
      const other = l.meta?.otherAccountId
      if (l.kind !== 'move' || l.value === undefined || other === undefined)
        continue
      if (!live.has(other)) continue
      moveRows.push({
        at: l.occurredAt,
        accountId: account._id,
        value: l.value,
        otherAccountId: other,
      })
    }
    /* A bank that is also a broker keeps its trades to its broker cash,
       read below from its first reading on. */
    const trades =
      account.kinds.includes('broker') && !hasBrokerCash(account)
        ? await ctx.db
            .query('trades')
            .withIndex('by_owner_account', (q) =>
              q.eq('ownerId', ownerId).eq('accountId', account._id),
            )
            .take(TRADE_ROWS)
        : []
    const values: Array<number | null> = dayEnds.map(() => null)
    for (const currency of account.currencies) {
      const readings = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', `balance:${account._id}:${currency}`),
        )
        .take(500)
      if (readings.length === 0) continue
      const rate =
        currency === 'EUR'
          ? 1
          : ((
              await ctx.db
                .query('fxRates')
                .withIndex('by_owner_currency_time', (q) =>
                  q.eq('ownerId', ownerId).eq('currency', currency),
                )
                .order('desc')
                .first()
            )?.rate ?? null)
      if (rate === null) continue
      const moves = pocketMoves(logs, trades, currency)
      const series = balanceSeries(
        dayEnds,
        readings.map((r) => ({ at: r.recordedAt, value: r.value ?? 0 })),
        moves,
        account.kinds.includes('cash') && !account.kinds.includes('bank'),
      )
      startAt(account._id, series, -Infinity, rate)
      for (const [i, x] of series.entries()) {
        if (x === null) continue
        values[i] = Math.round(((values[i] ?? 0) + x * rate) * 100) / 100
      }
    }
    if (hasBrokerCash(account)) {
      /* Its broker cash, from the day it was first read (10 Oct). */
      const readings = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ownerId).eq('key', brokerCashKey(account._id)),
        )
        .take(500)
      const first = Math.min(...readings.map((r) => r.recordedAt))
      /* Only the trades after its first reading (18 Oct): a day before it
         is not drawn, and on any later day a trade at or before the
         reading it starts from is already in that reading — so the 3,700
         older Revolut trades never changed a point, and were read on
         every run of the worth chart. */
      const brokerTrades =
        readings.length === 0
          ? []
          : await ctx.db
              .query('trades')
              .withIndex('by_owner_account_time', (q) =>
                q
                  .eq('ownerId', ownerId)
                  .eq('accountId', account._id)
                  .gt('occurredAt', first),
              )
              .take(TRADE_ROWS)
      const series =
        readings.length === 0
          ? []
          : balanceSeries(
              dayEnds,
              readings.map((r) => ({ at: r.recordedAt, value: r.value ?? 0 })),
              pocketMoves([], brokerTrades, 'EUR'),
              false,
            )
      startAt(account._id, series, first, 1)
      for (const [i, x] of series.entries()) {
        if (x === null || dayEnds[i] < first) continue
        values[i] = Math.round(((values[i] ?? 0) + x) * 100) / 100
      }
    }
    for (const [i, x] of values.entries())
      if (x !== null) total[i] = Math.round(((total[i] ?? 0) + x) * 100) / 100
    out.push({ accountId: account._id, values })
  }
  const first = dayEnds[0] ?? 0
  const moves = ownMoves(moveRows).filter(
    (m) => m.at > first - 86_400_000 && m.at <= (dayEnds.at(-1) ?? 0),
  )
  return { total, accounts: out, moves, starts }
}

type Slot = {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
  trades: Array<LedgerTrade>
  looks: Array<Observation>
}

/* Positions as the trades and holdings screens say, and where a close (or
   a rate) is looked up: only on days the instrument was held, every day of
   the last month and a week apart before it — coarser when that is more
   than PRICE_LOOKS (closeLooks). A rate, on the days anything quoted in it
   was held. One list per instrument (`ids`), then one per rate (`bases`). */
export async function investedInputs(
  ctx: QueryCtx,
  ownerId: string,
  dayEnds: ReadonlyArray<number>,
) {
  const live = new Set(
    (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(ACCOUNT_ROWS)
    )
      .filter((a) => a.retiredAt === undefined)
      .map((a) => a._id),
  )
  const trades = (await readLedgerTrades(ctx, ownerId)).trades.filter((t) =>
    live.has(t.accountId),
  )
  const looks = (
    await ctx.db
      .query('holdings')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(HOLDING_ROWS)
  ).filter((h) => live.has(h.accountId))

  const slots = new Map<string, Slot>()
  const slot = (accountId: Id<'accounts'>, instrumentId: Id<'instruments'>) => {
    const key = `${accountId}:${instrumentId}`
    let p = slots.get(key)
    if (p === undefined) {
      p = { accountId, instrumentId, trades: [], looks: [] }
      slots.set(key, p)
    }
    return p
  }
  for (const t of trades) slot(t.accountId, t.instrumentId).trades.push(t)
  for (const h of looks)
    slot(h.accountId, h.instrumentId).looks.push({
      shares: h.shares,
      paidEur: h.paidEur,
      asOf: h.asOf,
    })

  const instruments = new Map(
    (
      await Promise.all(
        [...new Set([...slots.values()].map((p) => p.instrumentId))].map((id) =>
          ctx.db.get(id),
        ),
      )
    )
      .filter(
        (x): x is Doc<'instruments'> => x !== null && x.ownerId === ownerId,
      )
      .map((x) => [x._id, x]),
  )
  const ids = [...instruments.keys()]
  const bases = [
    ...new Set(
      [...instruments.values()]
        .map((x) => quoteToRate(x.currency).base)
        .filter((b) => b !== 'EUR'),
    ),
  ]
  const heldOf = ids.map((id) =>
    heldDays(
      dayEnds,
      [...slots.values()].filter((p) => p.instrumentId === id),
    ),
  )
  const looksOf = closeLooks(
    dayEnds,
    [
      ...heldOf,
      ...bases.map((base) =>
        dayEnds.map((_, i) =>
          ids.some(
            (id, k) =>
              heldOf[k][i] &&
              quoteToRate(instruments.get(id)!.currency).base === base,
          ),
        ),
      ),
    ],
    PRICE_LOOKS,
  )
  return { slots: [...slots.values()], instruments, ids, bases, looksOf }
}

/* The latest close (or rate) at or before a day's end, through the index:
   one row. */
export const closeAtEnd =
  (ctx: QueryCtx, ownerId: string, id: Id<'instruments'>) =>
  async (end: number): Promise<Close | null> => {
    const r = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', id).lte('asOf', end),
      )
      .order('desc')
      .first()
    return r === null ? null : { asOf: r.asOf, price: r.price }
  }

export const rateAtEnd =
  (ctx: QueryCtx, ownerId: string, base: string) =>
  async (end: number): Promise<Rate | null> => {
    const r = await ctx.db
      .query('fxRates')
      .withIndex('by_owner_currency_time', (q) =>
        q.eq('ownerId', ownerId).eq('currency', base).lte('asOf', end),
      )
      .order('desc')
      .first()
    return r === null ? null : { asOf: r.asOf, rate: r.rate }
  }

/** A close (or rate) still the day's at `end`. */
export const fresh = (r: { asOf: number }, end: number) =>
  r.asOf >= end - STALE_CLOSE_MS - 7 * 86_400_000

/* Every close and rate is looked up at once, not one after another
   (9 Oct): the same ~80 one-row reads a position, but in sequence they
   took 6 s — and Convex holds every update on screen until each open
   query has caught up, so a save froze the whole app for those 6 s.
   What was found, by its time; a row too old for its look is left out. */
export async function latestAt<T extends { asOf: number }>(
  ends: ReadonlyArray<number>,
  read: (end: number) => Promise<T | null>,
) {
  const found = new Map<number, T>()
  for (const [k, r] of (await Promise.all(ends.map(read))).entries())
    if (r !== null && fresh(r, ends[k])) found.set(r.asOf, r)
  return found
}

export const sorted = <T extends { asOf: number }>(found: Map<number, T>) =>
  [...found.values()].sort((a, b) => a.asOf - b.asOf)

export function holdingsOf(
  slots: ReadonlyArray<Slot>,
  instruments: Map<Id<'instruments'>, Doc<'instruments'>>,
  closesOf: Map<Id<'instruments'>, Array<Close>>,
  ratesOf: Map<string, Array<Rate>>,
) {
  const holdings: Array<Holding<Id<'accounts'>>> = []
  for (const p of slots) {
    const instrument = instruments.get(p.instrumentId)
    if (instrument === undefined) continue
    const { base, divide } = quoteToRate(instrument.currency)
    holdings.push({
      accountId: p.accountId,
      trades: p.trades,
      looks: p.looks,
      closes: closesOf.get(p.instrumentId) ?? [],
      divide,
      rates: base === 'EUR' ? null : (ratesOf.get(base) ?? []),
    })
  }
  return holdings
}

const HISTORY_ROWS = 5000

/** Closes and rates one worthHistory may look up: Convex stops a query at
    4,096 reads, and the cash side needs its share. */
const PRICE_LOOKS = 3200

/** A close or rate this old is no longer the day's: the point is unpriced. */
const STALE_CLOSE_MS = 14 * 86_400_000

/* One pocket's rows as signed cents: spending out, money in, a move's own
   side; in a broker's euro pocket, buys out and sells in. */
export function pocketMoves(
  logs: ReadonlyArray<Doc<'logs'>>,
  trades: ReadonlyArray<Doc<'trades'>>,
  currency: string,
): Array<Move> {
  const unit = currency.toLowerCase()
  const moves: Array<Move> = []
  for (const l of logs) {
    if (l.area !== 'money' || l.unit !== unit || l.value === undefined) continue
    const signed =
      l.kind === 'expense'
        ? -l.value
        : l.kind === 'income' || l.kind === 'move'
          ? l.value
          : 0
    if (signed !== 0)
      moves.push({
        at: l.occurredAt,
        cents: Math.round(signed * 100),
        fromFile: l.meta?.intakeId !== undefined,
      })
  }
  if (currency === 'EUR')
    for (const t of trades) {
      /* No cash side: opening holdings, and coins whose money the bank
         statement already shows leaving (noCash). */
      if (t.opening === true || t.noCash === true) continue
      const cost = Math.round(t.shares * t.priceEur * 100)
      moves.push({
        at: t.occurredAt,
        cents: t.side === 'buy' ? -cost : cost,
        fromFile: false,
      })
    }
  return moves
}

export async function readPositions(ctx: QueryCtx, ownerId: string) {
  /* A deleted account with history is retired, not erased — and what it
     held leaves every total with it (27 Sep: his deleted test accounts
     still counted in the hero). */
  const live = new Set(
    (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(ACCOUNT_ROWS)
    )
      .filter((a) => a.retiredAt === undefined)
      .map((a) => a._id),
  )
  const ledger = await readLedgerTrades(ctx, ownerId)
  const trades = ledger.trades.filter((t) => live.has(t.accountId))

  const looks = (
    await ctx.db
      .query('holdings')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(HOLDING_ROWS)
  ).filter((h) => live.has(h.accountId))

  const held = new Map<
    string,
    {
      accountId: Id<'accounts'>
      instrumentId: Id<'instruments'>
      trades: Array<LedgerTrade>
      staked: number
      looks: Array<Observation>
    }
  >()
  const slot = (accountId: Id<'accounts'>, instrumentId: Id<'instruments'>) => {
    const key = `${accountId}:${instrumentId}`
    let p = held.get(key)
    if (p === undefined) {
      p = { accountId, instrumentId, trades: [], looks: [], staked: 0 }
      held.set(key, p)
    }
    return p
  }
  for (const t of trades) {
    const p = slot(t.accountId, t.instrumentId)
    p.trades.push(t)
    if (t.reward) p.staked += t.shares
  }
  for (const h of looks)
    slot(h.accountId, h.instrumentId).looks.push({
      shares: h.shares,
      paidEur: h.paidEur,
      asOf: h.asOf,
    })
  /* Every instrument once, side by side. */
  const instruments = new Map(
    await Promise.all(
      [...new Set([...held.values()].map((p) => p.instrumentId))].map(
        async (id) => [id, await ctx.db.get(id)] as const,
      ),
    ),
  )
  /* The latest look of each kind of file an account had (10 Oct: a gold
     file is not a look at his coins). */
  const lookKey = (accountId: Id<'accounts'>, id: Id<'instruments'>) => {
    const i = instruments.get(id)
    return `${accountId}:${i ? lookFamily(i) : 'security'}`
  }
  const lastLook = new Map<string, number>()
  for (const h of looks) {
    const k = lookKey(h.accountId, h.instrumentId)
    lastLook.set(k, Math.max(lastLook.get(k) ?? 0, h.asOf))
  }

  const rates = new Map<string, { rate: number; asOf: number } | null>()
  async function rateFor(base: string) {
    if (base === 'EUR') return { rate: 1, asOf: null }
    if (!rates.has(base)) {
      const row = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q.eq('ownerId', ownerId).eq('currency', base),
        )
        .order('desc')
        .first()
      rates.set(base, row === null ? null : { rate: row.rate, asOf: row.asOf })
    }
    const r = rates.get(base) ?? null
    return r === null ? null : { rate: r.rate, asOf: r.asOf as number | null }
  }

  /* The dollar rate of each day he traded or a screen saw a cost (10
     Oct): what he paid, in dollars on the day — Revolut's own view. Read
     side by side, one row a day. */
  const usdOn = new Map<number, number | null>()
  const dayOf = (at: number) => Math.floor(at / 86_400_000)
  const days = new Set<number>()
  for (const p of held.values()) {
    for (const t of p.trades) days.add(dayOf(t.occurredAt))
    for (const o of p.looks)
      if (o.paidEur !== undefined) days.add(dayOf(o.asOf))
  }
  await Promise.all(
    [...days].map(async (d) => {
      const r = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('currency', 'USD')
            .lte('asOf', (d + 1) * 86_400_000),
        )
        .order('desc')
        .first()
      usdOn.set(d, r === null ? null : r.rate)
    }),
  )
  const inDollars = (p: {
    trades: Array<LedgerTrade>
    looks: Array<Observation>
  }) => {
    const rateAt = (at: number) => usdOn.get(dayOf(at)) ?? null
    if (p.trades.some((t) => rateAt(t.occurredAt) === null)) return null
    const r = reconcile(
      p.trades.map((t) => ({
        ...t,
        priceEur: t.priceEur / (rateAt(t.occurredAt) as number),
      })),
      p.looks.map((o) => {
        const rate = rateAt(o.asOf)
        return {
          ...o,
          paidEur:
            o.paidEur === undefined || rate === null
              ? undefined
              : o.paidEur / rate,
        }
      }),
    )
    return r.paid
  }

  const rows = []
  const gone = []
  let pricesFetchedAt: number | null = null
  for (const p of held.values()) {
    const r = reconcile(p.trades, p.looks)
    const shares = r.shares
    const instrument = instruments.get(p.instrumentId) ?? null
    if (instrument === null || instrument.ownerId !== ownerId) continue
    const price = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', p.instrumentId),
      )
      .order('desc')
      .first()
    const { base, divide } = quoteToRate(instrument.currency)
    const rate = await rateFor(base)
    const valueEur =
      price === null || rate === null
        ? null
        : Math.round(((shares * price.price) / divide) * rate.rate * 100) / 100
    /* Sold out, or dust left by a sale — 0.06 XLM, €0.01 — is not a
       position (10 Oct: Revolut does not list it either). It goes under
       "sold" when a sale or a later screen says so. */
    if (shares <= 0 || (valueEur !== null && valueEur < 1)) {
      const s = soldPart(p.trades, p.looks)
      if (s !== null)
        gone.push({
          accountId: p.accountId,
          instrumentId: p.instrumentId,
          symbol: instrument.symbol,
          name: instrument.name,
          type: instrument.type,
          currency: instrument.currency,
          shares: 0,
          paid: s.boughtFor,
          paidUsd: null,
          status: r.status,
          seenAt: r.seenAt,
          gap: 0,
          notSeen: false,
          price: price?.price ?? null,
          priceAsOf: price?.asOf ?? null,
          rate: rate?.rate ?? null,
          rateAsOf: rate?.asOf ?? null,
          valueEur: 0,
          staked: 0,
          soldFor: s.soldFor,
          soldAt: s.soldAt,
        })
      continue
    }
    if (price) pricesFetchedAt = Math.max(pricesFetchedAt ?? 0, price.fetchedAt)
    rows.push({
      accountId: p.accountId,
      instrumentId: p.instrumentId,
      symbol: instrument.symbol,
      name: instrument.name,
      type: instrument.type,
      currency: instrument.currency,
      shares,
      paid: r.paid,
      paidUsd: r.paid === null ? null : inDollars(p),
      status: r.status,
      seenAt: r.seenAt,
      gap: r.gap,
      notSeen: notSeenSince(
        r.seenAt,
        lastLook.get(lookKey(p.accountId, p.instrumentId)) ?? null,
      ),
      price: price?.price ?? null,
      priceAsOf: price?.asOf ?? null,
      rate: rate?.rate ?? null,
      rateAsOf: rate?.asOf ?? null,
      valueEur,
      staked: Math.round(p.staked * 1e6) / 1e6,
    })
  }
  rows.sort((a, b) => (b.valueEur ?? b.paid ?? 0) - (a.valueEur ?? a.paid ?? 0))
  let cents = 0
  let oldestPriceAsOf: number | null = null
  let unvalued = 0
  for (const r of rows) {
    if (r.valueEur === null || r.priceAsOf === null) {
      unvalued++
      continue
    }
    cents += Math.round(r.valueEur * 100)
    oldestPriceAsOf =
      oldestPriceAsOf === null
        ? r.priceAsOf
        : Math.min(oldestPriceAsOf, r.priceAsOf)
  }
  /* Sold in one account and owned in another is owned. */
  const owned = new Set(rows.map((r) => r.instrumentId))
  return {
    rows,
    sold: gone
      .filter((g) => !owned.has(g.instrumentId))
      .sort((a, b) => b.soldAt - a.soldAt),
    totalEur: cents / 100,
    oldestPriceAsOf,
    pricesFetchedAt,
    unvalued,
    complete: ledger.complete && looks.length < HOLDING_ROWS,
    usdRate: (await rateFor('USD'))?.rate ?? null,
  }
}

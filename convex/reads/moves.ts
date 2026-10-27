import { balanceKey, brokerCashKey, hasBrokerCash } from '../accounts'
import { HISTORY_GRACE_MS } from '../../src/lib/cashHistory'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { TRADE_ROWS, quoteToRate } from './positions'

/* Moves since a time: cash moved, trades made, what arrived from the bank
   and what changed at a broker. Helpers shared by aggregate.ts, bank.ts,
   intake.ts and the undo and balance checks. */

const MOVED_ROWS = 2000

/**
 * What moved in one pocket after its reading: signed, in cents of the
 * pocket's currency. Spending out, money in, a transfer's own side; in the
 * euro pocket of an account with trades, buys out and sells in.
 */
export async function movedSince(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  currency: string,
  readAt: number,
  /** Up to and including this moment; now when absent. */
  until?: number,
  /** As if this file had never been saved (undoFile.ts). */
  skip?: Id<'intakes'>,
): Promise<{ cents: number; rows: number }> {
  const unit = currency.toLowerCase()
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) => {
      const from = q
        .eq('ownerId', ownerId)
        .eq('accountId', account._id)
        .gt('occurredAt', readAt)
      return until === undefined ? from : from.lte('occurredAt', until)
    })
    .take(MOVED_ROWS)
  let cents = 0
  let rows = 0
  for (const l of logs) {
    if (l.area !== 'money' || l.unit !== unit || l.value === undefined) continue
    if (skip !== undefined && l.meta?.intakeId === skip) continue
    /* A statement's rows are stamped at noon of their day, and its
       closing balance can be confirmed at 2 am on its closing day: a row
       read off a file counts after a reading only from the next day on. */
    if (
      l.meta?.intakeId !== undefined &&
      l.occurredAt <= readAt + HISTORY_GRACE_MS
    )
      continue
    const signed =
      l.kind === 'expense'
        ? -l.value
        : l.kind === 'income' || l.kind === 'move'
          ? l.value
          : 0
    if (signed === 0) continue
    cents += Math.round(signed * 100)
    rows++
  }
  /* A bank that is also a broker pays for shares from its broker cash,
     not from these euros (10 Oct). */
  if (
    currency === 'EUR' &&
    account.kinds.includes('broker') &&
    !hasBrokerCash(account)
  ) {
    const traded = await tradedSince(ctx, ownerId, account, readAt, skip)
    cents += traded.cents
    rows += traded.rows
  }
  return { cents, rows }
}

/* What an account's buys cost and its sells brought after a reading, as
   signed cents: the trades side of a broker's cash. */
export async function tradedSince(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  readAt: number,
  skip?: Id<'intakes'>,
): Promise<{ cents: number; rows: number }> {
  /* Only the trades after the reading (18 Oct): Revolut's 3,700 trades
     were read on every run of balances, worth, ahead and weekReview to
     keep the few after its last cash reading. */
  const trades = await ctx.db
    .query('trades')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', account._id)
        .gt('occurredAt', readAt),
    )
    .take(TRADE_ROWS)
  let cents = 0
  let rows = 0
  for (const t of trades) {
    if (t.opening === true || t.noCash === true) continue
    if (skip !== undefined && t.importId === skip) continue
    const cost = Math.round(t.shares * t.priceEur * 100)
    cents += t.side === 'buy' ? -cost : cost
    rows++
  }
  return { cents, rows }
}

/**
 * What a bank's own rows brought (11 Oct, the card's arrived block): how
 * many were saved, what went out and came in — sums over those logged rows
 * (source 1: one currency, from the day of `was`, only rows a bank reading
 * wrote, each opening in the account's rows) — between the balance held
 * before the first of them (`was`, state) and the account's balance now
 * (state). Null until a reading of them has been saved.
 */
export async function arrivedFromBank(
  ctx: QueryCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  intakeIds: ReadonlyArray<Id<'intakes'>>,
) {
  let first: NonNullable<Doc<'intakes'>['landed']> | null = null
  let rows = 0
  let outCents = 0
  let inCents = 0
  for (const id of intakeIds) {
    const intake = await ctx.db.get(id)
    if (
      intake === null ||
      intake.ownerId !== ownerId ||
      intake.status !== 'done' ||
      intake.landed === undefined
    )
      continue
    first ??= intake.landed
    const unit = first.currency.toLowerCase()
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_intake', (q) =>
        q.eq('ownerId', ownerId).eq('meta.intakeId', id),
      )
      .take(300)
    for (const l of logs) {
      if (l.accountId !== accountId || l.unit !== unit) continue
      const signed =
        l.kind === 'expense'
          ? -(l.value ?? 0)
          : l.kind === 'income' || l.kind === 'move'
            ? (l.value ?? 0)
            : 0
      if (signed === 0) continue
      rows++
      if (signed < 0) outCents -= Math.round(signed * 100)
      else inCents += Math.round(signed * 100)
    }
  }
  if (first === null || rows === 0) return null
  const { currency } = first
  const now = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q.eq('ownerId', ownerId).eq('key', balanceKey(accountId, currency)),
    )
    .order('desc')
    .first()
  if (now?.value === undefined) return null
  return {
    rows,
    currency,
    was: first.was,
    wasAt: first.wasAt,
    out: outCents / 100,
    in: inCents / 100,
    now: now.value,
  }
}

/**
 * What Trading 212's answers changed since the look at `at`, as the card
 * says it (12 Oct, docs/specs/2026-10-12-trading-212.md): per company the
 * shares then and now (state, kept on the link) and what they are worth —
 * shares × the stored price (external reading) of that day, and of now.
 * Null euros where no price is stored. Free cash: the balance it had and
 * the balance stored now (state).
 */
export async function changedAtBroker(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  changed: NonNullable<Doc<'bankLinks'>['changed']>,
) {
  const worthOf = async (
    inst: Doc<'instruments'>,
    shares: number,
    at?: number,
  ) => {
    if (shares === 0) return 0
    const { base, divide } = quoteToRate(inst.currency)
    const price = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) => {
        const mine = q.eq('ownerId', ownerId).eq('instrumentId', inst._id)
        return at === undefined ? mine : mine.lte('asOf', at)
      })
      .order('desc')
      .first()
    const rate =
      base === 'EUR'
        ? 1
        : (
            await ctx.db
              .query('fxRates')
              .withIndex('by_owner_currency_time', (q) => {
                const mine = q.eq('ownerId', ownerId).eq('currency', base)
                return at === undefined ? mine : mine.lte('asOf', at)
              })
              .order('desc')
              .first()
          )?.rate
    return price === null || rate === undefined
      ? null
      : Math.round(((shares * price.price) / divide) * rate * 100) / 100
  }
  const lines: Array<{
    symbol: string
    name: string
    type: string
    was: number
    now: number
    wasEur: number | null
    nowEur: number | null
  }> = []
  for (const l of changed.lines) {
    const inst = await ctx.db.get(l.instrumentId)
    if (inst === null || inst.ownerId !== ownerId) continue
    lines.push({
      symbol: inst.symbol,
      name: inst.name,
      type: inst.type,
      was: l.was,
      now: l.now,
      wasEur: await worthOf(inst, l.was, changed.at),
      nowEur: await worthOf(inst, l.now),
    })
  }
  const move = (l: (typeof lines)[number]) =>
    Math.abs((l.nowEur ?? 0) - (l.wasEur ?? 0))
  lines.sort((a, b) => move(b) - move(a))
  const currency = account.currencies[0] ?? 'EUR'
  const cashNow =
    changed.cashWas === undefined
      ? undefined
      : (
          await ctx.db
            .query('stateSnapshots')
            .withIndex('by_owner_key_time', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq(
                  'key',
                  hasBrokerCash(account)
                    ? brokerCashKey(account._id)
                    : balanceKey(account._id, currency),
                ),
            )
            .order('desc')
            .first()
        )?.value
  return {
    at: changed.at,
    cash:
      changed.cashWas === undefined || cashNow === undefined
        ? null
        : { currency, was: changed.cashWas, now: cashNow },
    lines,
  }
}

/* ---------------------------------------------------------------------------
   The week, for Review (15 Oct, mockup design/review-mockup/real.html) — on
   what the app gets by itself: bank rows, commits, a weight reading, and
   the hand logs beside four weeks of them so a quiet week is not a screen
   of zeros. Source 1 (log counts and sums, commits counted as Projects
   counts them), source 2 (the latest weight) and source 3 (live projects,
   done tasks). Counted in src/lib/review.ts; nothing stored.
   ------------------------------------------------------------------------ */

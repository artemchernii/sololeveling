import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* A position's trades, kept compact for the screens that read them all
   (18 Oct, "keep in mind spending"): positions, worth, worthPast and the
   price reading's tickers each re-read every trade — 3,800 rows, 1.5 MB —
   on every run. A ledger is the same rows, in the same order, as four
   arrays: about 30 bytes a trade instead of 400. Nothing in it is summed.

   It is rebuilt from `trades` by every mutation that writes one
   (syncLedgers), for the positions it touched. Reads go through
   readLedgerTrades, which falls back to the trades themselves for an
   owner with no ledger yet (before `ledgers:build` has run). */

/** Rows a ledger part holds: four arrays of 8,192 values at most. */
export const LEDGER_PART = 2000
/* A position's trades read to rebuild it; Revolut's whole export is 3,700. */
const SLOT_TRADES = 20_000
const LEDGER_DOCS = 2000
/* The same bound the old read had (aggregate.ts, TRADE_ROWS). */
const TRADE_ROWS = 6000
const SELL = 1
const REWARD = 2

type Slot = { accountId: Id<'accounts'>; instrumentId: Id<'instruments'> }

/** What the ledger keeps of a trade: what positions and worth read. */
export type LedgerRow = Slot & {
  side: 'buy' | 'sell'
  shares: number
  priceEur: number
  occurredAt: number
  reward?: boolean
}

const same = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/** Rebuilds the ledger of each position from its trades. Call it in the
    same mutation as any insert, delete or patch of a trade, with the
    position before and after. Writes only the parts that changed. */
export async function syncLedgers(
  ctx: MutationCtx,
  ownerId: string,
  slots: Iterable<Slot>,
) {
  /* The first write after the deploy builds every ledger, so a screen
     never reads some positions from ledgers and the rest not at all. */
  const built = await ctx.db
    .query('ledgers')
    .withIndex('by_owner_account_instrument_part', (q) =>
      q.eq('ownerId', ownerId),
    )
    .first()
  const todo = built === null ? await everySlot(ctx, ownerId) : [...slots]
  const seen = new Set<string>()
  for (const s of todo) {
    const key = `${s.accountId}:${s.instrumentId}`
    if (seen.has(key)) continue
    seen.add(key)
    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_account_instrument_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('accountId', s.accountId)
          .eq('instrumentId', s.instrumentId),
      )
      .take(SLOT_TRADES)
    const had = await ctx.db
      .query('ledgers')
      .withIndex('by_owner_account_instrument_part', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('accountId', s.accountId)
          .eq('instrumentId', s.instrumentId),
      )
      .take(SLOT_TRADES / LEDGER_PART + 1)
    const parts = Math.ceil(trades.length / LEDGER_PART)
    for (let part = 0; part < parts; part++) {
      const rows = trades.slice(part * LEDGER_PART, (part + 1) * LEDGER_PART)
      const next = {
        at: rows.map((t) => t.occurredAt),
        shares: rows.map((t) => t.shares),
        priceEur: rows.map((t) => t.priceEur),
        flags: rows.map(
          (t) => (t.side === 'sell' ? SELL : 0) | (t.reward ? REWARD : 0),
        ),
      }
      const old = had.find((l) => l.part === part)
      if (old === undefined)
        await ctx.db.insert('ledgers', { ownerId, ...s, part, ...next })
      else if (
        !same(old.at, next.at) ||
        !same(old.shares, next.shares) ||
        !same(old.priceEur, next.priceEur) ||
        !same(old.flags, next.flags)
      )
        await ctx.db.patch(old._id, next)
    }
    for (const l of had) if (l.part >= parts) await ctx.db.delete(l._id)
  }
}

async function everySlot(ctx: MutationCtx, ownerId: string) {
  const trades = await ctx.db
    .query('trades')
    .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
    .take(SLOT_TRADES)
  return [
    ...new Map(
      slotsOf(trades).map((s) => [`${s.accountId}:${s.instrumentId}`, s]),
    ).values(),
  ]
}

/** The positions of a list of trades, for syncLedgers. */
export const slotsOf = (trades: Iterable<Slot>) =>
  [...trades].map((t) => ({
    accountId: t.accountId,
    instrumentId: t.instrumentId,
  }))

/** Every trade of an owner as positions and worth read them: oldest
    first, as the `by_owner_time` index gives them. `complete` is false
    where the old read would have stopped at TRADE_ROWS. */
export async function readLedgerTrades(
  ctx: QueryCtx,
  ownerId: string,
): Promise<{ trades: Array<LedgerRow>; complete: boolean }> {
  const ledgers = await ctx.db
    .query('ledgers')
    .withIndex('by_owner_account_instrument_part', (q) =>
      q.eq('ownerId', ownerId),
    )
    .take(LEDGER_DOCS)
  if (ledgers.length === 0) {
    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .take(TRADE_ROWS)
    return { trades, complete: trades.length < TRADE_ROWS }
  }
  const trades: Array<LedgerRow> = []
  for (const l of ledgers)
    for (let i = 0; i < l.at.length; i++)
      trades.push({
        accountId: l.accountId,
        instrumentId: l.instrumentId,
        side: l.flags[i] & SELL ? 'sell' : 'buy',
        shares: l.shares[i],
        priceEur: l.priceEur[i],
        occurredAt: l.at[i],
        ...(l.flags[i] & REWARD ? { reward: true } : {}),
      })
  /* Stable: one position's rows keep their own order on a shared time. */
  trades.sort((a, b) => a.occurredAt - b.occurredAt)
  return {
    trades,
    complete: trades.length < TRADE_ROWS && ledgers.length < LEDGER_DOCS,
  }
}

/** Every ledger of one owner rebuilt from its trades, and a ledger
    whose position has none left taken away. */
export async function rebuildLedgers(ctx: MutationCtx, ownerId: string) {
  const had = await ctx.db
    .query('ledgers')
    .withIndex('by_owner_account_instrument_part', (q) =>
      q.eq('ownerId', ownerId),
    )
    .take(LEDGER_DOCS)
  const slots = [...slotsOf(had), ...(await everySlot(ctx, ownerId))]
  await syncLedgers(ctx, ownerId, slots)
  return new Set(slots.map((s) => `${s.accountId}:${s.instrumentId}`)).size
}

/** Builds every ledger of one owner from its trades — once, after the
    deploy that adds them (`npx convex run ledgers:build '{"ownerId":…}'`);
    safe to run again. Until then screens read the trades themselves. */
export const build = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({ positions: v.number() }),
  handler: async (ctx, args) => ({
    positions: await rebuildLedgers(ctx, args.ownerId),
  }),
})

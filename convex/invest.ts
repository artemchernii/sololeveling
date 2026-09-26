import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount, writeBalance } from './accounts'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  IMPORT_MODEL_NAME,
  IMPORT_WINDOW_MS,
  IMPORTS_PER_WINDOW,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_IMAGES,
} from '../src/lib/market'

/* Investments (Finances F4, 26 Sep): tickers, trades, and a broker
   screenshot turned into trades he confirms. The value of what he holds is
   read in aggregate.positions; the prices it uses are stored by market.ts.

   A trade is what the broker confirmed: shares and the price per share in
   euros. Nothing here computes a return. */

const MAX_TRADES = 2000

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

/* One row per owner and symbol; a new one is read at once, so a position
   has its price the moment it exists. */
async function upsertInstrument(
  ctx: MutationCtx,
  ownerId: string,
  c: { symbol: string; name: string; exchange: string; type: string },
  isin?: string,
): Promise<Id<'instruments'>> {
  const symbol = c.symbol.trim()
  if (symbol.length === 0 || symbol.length > 24) {
    throw new ConvexError('That is not a ticker.')
  }
  const found = await ctx.db
    .query('instruments')
    .withIndex('by_owner_symbol', (q) =>
      q.eq('ownerId', ownerId).eq('symbol', symbol),
    )
    .first()
  if (found !== null) return found._id
  const id = await ctx.db.insert('instruments', {
    ownerId,
    symbol,
    name: c.name.slice(0, 120),
    exchange: c.exchange.slice(0, 40),
    /* Learned from the first price reading (market.storePrices). */
    currency: '',
    type: c.type,
    isin,
  })
  await ctx.scheduler.runAfter(0, internal.market.readOne, { instrumentId: id })
  return id
}

function checkTrade(shares: number, priceEur: number) {
  if (!Number.isFinite(shares) || shares <= 0 || shares > 1e9) {
    throw new ConvexError('That is not a number of shares.')
  }
  if (!Number.isFinite(priceEur) || priceEur <= 0 || priceEur > 1e7) {
    throw new ConvexError('That is not a price in euros.')
  }
}

async function heldShares(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  instrumentId: Id<'instruments'>,
): Promise<number> {
  const rows = await ctx.db
    .query('trades')
    .withIndex('by_owner_instrument', (q) =>
      q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
    )
    .take(MAX_TRADES)
  return rows
    .filter((t) => t.accountId === accountId)
    .reduce((n, t) => n + (t.side === 'buy' ? t.shares : -t.shares), 0)
}

/** A buy or a sell, as the broker confirmed it. */
export const addTrade = mutation({
  args: {
    accountId: v.id('accounts'),
    candidate,
    side: v.union(v.literal('buy'), v.literal('sell')),
    shares: v.number(),
    priceEur: v.number(),
    occurredAt: v.number(),
  },
  returns: v.id('trades'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    checkTrade(args.shares, args.priceEur)
    if (args.occurredAt > Date.now() + 5 * 60_000) {
      throw new ConvexError('A trade is something that happened.')
    }
    const instrumentId = await upsertInstrument(ctx, ownerId, args.candidate)
    if (args.side === 'sell') {
      const held = await heldShares(ctx, ownerId, args.accountId, instrumentId)
      if (args.shares > held + 1e-9) {
        throw new ConvexError(
          `There are only ${Math.round(held * 1e6) / 1e6} shares of that here to sell.`,
        )
      }
    }
    return await ctx.db.insert('trades', {
      ownerId,
      accountId: args.accountId,
      instrumentId,
      side: args.side,
      shares: args.shares,
      priceEur: Math.round(args.priceEur * 10000) / 10000,
      occurredAt: args.occurredAt,
    })
  },
})

export const removeTrade = mutation({
  args: { tradeId: v.id('trades') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const trade = await ctx.db.get(args.tradeId)
    if (trade === null || trade.ownerId !== ownerId) {
      throw new Error('No such trade')
    }
    await ctx.db.delete(args.tradeId)
    return null
  },
})

/** One position's trades, newest first — what its number is made of. */
export const trades = query({
  args: { accountId: v.id('accounts'), instrumentId: v.id('instruments') },
  returns: v.array(schema.doc('trades')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('trades')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', args.instrumentId),
      )
      .take(MAX_TRADES)
    return rows
      .filter((t) => t.accountId === args.accountId)
      .sort((a, b) => b.occurredAt - a.occurredAt)
  },
})

/**
 * A ticker's stored closes over a period, oldest first, with where they
 * came from — source 4 read as a series, on the same condition as the
 * weight line (PLAN.md §1): the stored points and nothing between them.
 */
export const priceLine = query({
  args: { instrumentId: v.id('instruments'), since: v.number() },
  returns: v.array(v.object({ asOf: v.number(), price: v.number() })),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('instrumentId', args.instrumentId)
          .gte('asOf', args.since),
      )
      .take(400)
    return rows.map((r) => ({ asOf: r.asOf, price: r.price }))
  },
})

/* ---- Screenshot import -------------------------------------------------- */

/**
 * Screenshots of a broker's positions, read once by Claude Haiku 4.5 into
 * rows he confirms (convex/ai/portfolio.ts). At most IMPORTS_PER_WINDOW in
 * 30 days, counted from the import rows themselves.
 */
export const startImport = mutation({
  args: {
    accountId: v.id('accounts'),
    files: v.array(
      v.object({
        storageId: v.id('_storage'),
        contentType: v.string(),
        size: v.number(),
      }),
    ),
  },
  /* A refusal is returned, not thrown: a throw would roll back the delete
     of the files it refuses, and leave them stored for nothing. */
  returns: v.union(
    v.object({ ok: v.literal(true), importId: v.id('portfolioImports') }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    const refuse = async (error: string) => {
      for (const f of args.files) await ctx.storage.delete(f.storageId)
      return { ok: false as const, error }
    }
    if (args.files.length === 0) return await refuse('Choose a screenshot.')
    if (args.files.length > MAX_IMPORT_IMAGES) {
      return await refuse(`At most ${MAX_IMPORT_IMAGES} screenshots at once.`)
    }
    if (
      args.files.some(
        (f) =>
          !['image/png', 'image/jpeg', 'image/webp'].includes(f.contentType) ||
          f.size > MAX_IMPORT_BYTES,
      )
    ) {
      return await refuse('Screenshots are PNG, JPG or WebP, 10 MB at most.')
    }
    const now = Date.now()
    const recent = await ctx.db
      .query('portfolioImports')
      .withIndex('by_owner', (q) =>
        q.eq('ownerId', ownerId).gte('_creationTime', now - IMPORT_WINDOW_MS),
      )
      .take(IMPORTS_PER_WINDOW + 1)
    if (recent.length >= IMPORTS_PER_WINDOW) {
      return await refuse(
        `That's ${IMPORTS_PER_WINDOW} screenshots read in 30 days — the most this reads.`,
      )
    }
    const id = await ctx.db.insert('portfolioImports', {
      ownerId,
      accountId: args.accountId,
      storageIds: args.files.map((f) => f.storageId),
      status: 'reading',
      rows: [],
    })
    await ctx.scheduler.runAfter(0, internal.ai.portfolio.readScreenshots, {
      importId: id,
    })
    return { ok: true as const, importId: id }
  },
})

/** The imports not yet confirmed or thrown away, newest first. */
export const openImports = query({
  args: {},
  returns: v.array(schema.doc('portfolioImports')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('portfolioImports')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(20)
    return rows.filter((r) => r.status !== 'done')
  },
})

/**
 * He checked the rows. A screenshot is what the account held at that
 * moment (26 Sep, "like its going to be smart"): so confirming it REPLACES
 * the account's holdings up to now — every earlier trade in that account
 * goes, and each confirmed row becomes one buy at his average price. A
 * position missing from the new screenshot is gone because it is gone from
 * the broker. Trades typed after the screenshot still count on top.
 *
 * The free cash read off the same screen, if he kept it, becomes the
 * account's balance — so one screenshot of 212 updates both halves.
 * The screenshots go; the rows he kept are the record.
 */
export const confirmImport = mutation({
  args: {
    importId: v.id('portfolioImports'),
    occurredAt: v.number(),
    /** Local midnight today, for the cash reading (accounts.writeBalance). */
    dayStart: v.number(),
    rows: v.array(
      v.object({
        candidate,
        isin: v.optional(v.string()),
        shares: v.number(),
        priceEur: v.number(),
      }),
    ),
    cashEur: v.optional(v.number()),
  },
  returns: v.object({ positions: v.number(), replaced: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const imp = await ctx.db.get(args.importId)
    if (imp === null || imp.ownerId !== ownerId) {
      throw new Error('No such import')
    }
    if (imp.status !== 'ready') {
      throw new ConvexError('That screenshot is not ready to confirm.')
    }
    if (args.rows.length === 0 && args.cashEur === undefined) {
      throw new ConvexError('Keep at least one row, or the cash.')
    }
    if (args.occurredAt > Date.now() + 5 * 60_000) {
      throw new ConvexError('A trade is something that happened.')
    }
    for (const row of args.rows) checkTrade(row.shares, row.priceEur)
    const symbols = args.rows.map((r) => r.candidate.symbol)
    if (new Set(symbols).size !== symbols.length) {
      throw new ConvexError('Two rows are the same ticker — keep one.')
    }

    const before = await ctx.db
      .query('trades')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', imp.accountId),
      )
      .take(MAX_TRADES)
    let replaced = 0
    for (const t of before) {
      if (t.occurredAt <= args.occurredAt) {
        await ctx.db.delete(t._id)
        replaced++
      }
    }

    for (const row of args.rows) {
      const instrumentId = await upsertInstrument(
        ctx,
        ownerId,
        row.candidate,
        row.isin,
      )
      await ctx.db.insert('trades', {
        ownerId,
        accountId: imp.accountId,
        instrumentId,
        side: 'buy',
        shares: row.shares,
        priceEur: Math.round(row.priceEur * 10000) / 10000,
        occurredAt: args.occurredAt,
        importId: imp._id,
      })
    }
    if (args.cashEur !== undefined) {
      await writeBalance(
        ctx,
        ownerId,
        imp.accountId,
        args.cashEur,
        args.dayStart,
      )
    }
    for (const id of imp.storageIds) await ctx.storage.delete(id)
    await ctx.db.patch(imp._id, { status: 'done', storageIds: [] })
    return { positions: args.rows.length, replaced }
  },
})

/** Throw an import away, screenshots and all. */
export const discardImport = mutation({
  args: { importId: v.id('portfolioImports') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const imp = await ctx.db.get(args.importId)
    if (imp === null || imp.ownerId !== ownerId) {
      throw new Error('No such import')
    }
    for (const id of imp.storageIds) await ctx.storage.delete(id)
    await ctx.db.delete(imp._id)
    return null
  },
})

export const forImport = internalQuery({
  args: { importId: v.id('portfolioImports') },
  handler: async (ctx, args) => {
    const imp = await ctx.db.get(args.importId)
    if (imp === null || imp.status !== 'reading') return null
    const files = []
    for (const storageId of imp.storageIds) {
      const meta = await ctx.db.system.get(storageId)
      if (meta !== null) {
        files.push({ storageId, contentType: meta.contentType ?? '' })
      }
    }
    return { files }
  },
})

export const finishImport = internalMutation({
  args: {
    importId: v.id('portfolioImports'),
    rows: v.array(
      v.object({
        name: v.string(),
        isin: v.optional(v.string()),
        shares: v.optional(v.number()),
        priceEur: v.optional(v.number()),
        valueEur: v.optional(v.number()),
        candidates: v.array(candidate),
      }),
    ),
    cashEur: v.optional(v.number()),
    totalEur: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const imp = await ctx.db.get(args.importId)
    if (imp === null || imp.status !== 'reading') return null
    await ctx.db.patch(args.importId, {
      status: 'ready',
      rows: args.rows,
      cashEur: args.cashEur,
      totalEur: args.totalEur,
      model: IMPORT_MODEL_NAME,
      readAt: Date.now(),
    })
    return null
  },
})

export const failImport = internalMutation({
  args: { importId: v.id('portfolioImports'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const imp = await ctx.db.get(args.importId)
    if (imp === null || imp.status !== 'reading') return null
    await ctx.db.patch(args.importId, { status: 'failed', error: args.error })
    return null
  },
})

import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { transferPair } from './logs'
import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import { isCurrency } from '../src/lib/currency'
import { productById } from '../src/lib/institutions'

/* Where his money sits (Finances F2, 26 Sep; reworked 27 Sep for the
   Treasury). An account is his — added, edited, deleted from the page —
   and is any of bank, broker, cash. It holds one or more currencies, and
   each currency's balance is its own state (`balanceKey`), typed like a
   weigh-in or read off a statement. The numbers are read in aggregate.ts
   (`balances`, `worth`). */

const MAX_ACCOUNTS = 50
const MAX_NAME = 40
const MAX_CURRENCIES = 8

const kind = v.union(v.literal('bank'), v.literal('broker'), v.literal('cash'))

/** The stateSnapshots key one currency of one account is stored under. */
export function balanceKey(
  accountId: Id<'accounts'>,
  currency: string,
): string {
  return `balance:${accountId}:${currency}`
}

export async function ownedAccount(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
): Promise<Doc<'accounts'>> {
  const account = await ctx.db.get(accountId)
  if (account === null || account.ownerId !== ownerId) {
    throw new Error('No such account')
  }
  return account
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new ConvexError('An account needs a name.')
  if (trimmed.length > MAX_NAME) {
    throw new ConvexError('That name is too long.')
  }
  return trimmed
}

function cleanKinds(kinds: Array<Doc<'accounts'>['kinds'][number]>) {
  const out = [...new Set(kinds)]
  if (out.length === 0) {
    throw new ConvexError('Say what it is — a bank, a broker, or cash.')
  }
  return out
}

function cleanCurrencies(currencies: Array<string>): Array<string> {
  const out = [...new Set(currencies.map((c) => c.trim().toUpperCase()))]
  if (out.length === 0) throw new ConvexError('It holds at least one currency.')
  if (out.length > MAX_CURRENCIES) {
    throw new ConvexError('That is a lot of currencies.')
  }
  for (const c of out) {
    if (!isCurrency(c)) {
      throw new ConvexError(`${c} has no daily euro rate to show it by.`)
    }
  }
  return out
}

/* "revolut.com" from whatever he typed — a URL, a name with a dot. */
function cleanDomain(domain: string | undefined): string | undefined {
  const d = domain
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
  if (!d) return undefined
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || d.length > 80) {
    throw new ConvexError('That is not a website — like revolut.com.')
  }
  return d
}

/* "0120", "•• 2789" → "0120": four digits, at most four of each. */
function cleanTails(tails: Array<string> | undefined): Array<string> {
  const out = [
    ...new Set((tails ?? []).map((t) => t.replace(/\D/g, '')).filter(Boolean)),
  ]
  for (const t of out) {
    if (t.length !== 4) {
      throw new ConvexError('An ending is the last four digits — like 0120.')
    }
  }
  if (out.length > 4) throw new ConvexError('Four endings is plenty.')
  return out
}

function cleanInstitution(id: string | undefined): string | undefined {
  if (id === undefined) return undefined
  const product = productById(id)
  if (!product) throw new ConvexError('That bank is not one the app knows.')
  return product.institution
}

async function ownAccounts(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('accounts')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .take(MAX_ACCOUNTS)
}

/* A currency other than the euro needs its rate stored before a total can
   include it; ask for it now rather than at the next nightly read. */
async function readRatesFor(
  ctx: MutationCtx,
  ownerId: string,
  currencies: Array<string>,
) {
  for (const currency of currencies) {
    if (currency === 'EUR') continue
    await ctx.scheduler.runAfter(0, internal.market.readRateFor, {
      ownerId,
      currency,
    })
  }
}

/** His live accounts, in his order. */
export const list = query({
  args: {},
  returns: v.array(schema.doc('accounts')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ownAccounts(ctx, ownerId)
    return rows.filter((a) => a.retiredAt === undefined)
  },
})

const fields = {
  name: v.string(),
  kinds: v.array(kind),
  currencies: v.array(v.string()),
  domain: v.optional(v.string()),
  /** A product id from src/lib/institutions.ts ('trade-republic'). */
  product: v.optional(v.string()),
  ibanTails: v.optional(v.array(v.string())),
  cardTails: v.optional(v.array(v.string())),
}

export const create = mutation({
  args: fields,
  returns: v.id('accounts'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const name = cleanName(args.name)
    const rows = await ownAccounts(ctx, ownerId)
    if (rows.length >= MAX_ACCOUNTS) {
      throw new ConvexError('That is a lot of accounts — delete one first.')
    }
    if (
      rows.some(
        (a) =>
          a.retiredAt === undefined &&
          a.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ConvexError(`There is already an account called ${name}.`)
    }
    const currencies = cleanCurrencies(args.currencies)
    const order = rows.reduce((max, a) => Math.max(max, a.order), -1) + 1
    const id = await ctx.db.insert('accounts', {
      ownerId,
      name,
      kinds: cleanKinds(args.kinds),
      currencies,
      domain: cleanDomain(args.domain),
      institution: cleanInstitution(args.product),
      ibanTails: cleanTails(args.ibanTails),
      cardTails: cleanTails(args.cardTails),
      order,
    })
    await readRatesFor(ctx, ownerId, currencies)
    return id
  },
})

/** Name, what it is, currencies, logo. A currency taken off keeps its old
    readings (they happened) but stops being shown or added. */
export const update = mutation({
  args: { accountId: v.id('accounts'), ...fields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    const name = cleanName(args.name)
    const rows = await ownAccounts(ctx, ownerId)
    if (
      rows.some(
        (a) =>
          a._id !== account._id &&
          a.retiredAt === undefined &&
          a.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ConvexError(`There is already an account called ${name}.`)
    }
    const currencies = cleanCurrencies(args.currencies)
    await ctx.db.patch(args.accountId, {
      name,
      kinds: cleanKinds(args.kinds),
      currencies,
      domain: cleanDomain(args.domain),
      institution:
        args.product === undefined
          ? account.institution
          : cleanInstitution(args.product),
      ibanTails:
        args.ibanTails === undefined
          ? account.ibanTails
          : cleanTails(args.ibanTails),
      cardTails:
        args.cardTails === undefined
          ? account.cardTails
          : cleanTails(args.cardTails),
    })
    await readRatesFor(
      ctx,
      ownerId,
      currencies.filter((c) => !account.currencies.includes(c)),
    )
    return null
  },
})

/**
 * One balance reading — typed, or read off a statement or a screenshot. A
 * reading already written today for the same currency is replaced, like a
 * weigh-in, so a corrected typo leaves no false point on the line.
 *
 * `asOf` is the moment the number is true at: now for one he typed, the
 * end of the closing day for a statement. Money that moved after it is
 * added on top (aggregate.ts, readBalances); money before it is already in
 * it. A reading as of an earlier day replaces only that day's readings.
 */
export async function writeBalance(
  ctx: MutationCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  currency: string,
  value: number,
  dayStart: number,
  asOf?: number,
) {
  if (!account.currencies.includes(currency)) {
    throw new ConvexError(`${account.name} does not hold ${currency}.`)
  }
  if (!Number.isFinite(value) || Math.abs(value) > 1e10) {
    throw new ConvexError('That is not an amount.')
  }
  const now = Date.now()
  const at = asOf === undefined ? now : Math.min(asOf, now)
  /* The day the reading is for: today's local midnight from the client, or
     the midnight before an earlier as-of (a day is at most 25 hours). */
  const from = at >= dayStart ? dayStart : startOfDayNear(at, dayStart)
  const key = balanceKey(account._id, currency)
  const sameDay = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('key', key)
        .gte('recordedAt', from)
        .lt('recordedAt', from + 86_400_000),
    )
    .take(20)
  for (const row of sameDay) await ctx.db.delete(row._id)
  await ctx.db.insert('stateSnapshots', {
    ownerId,
    area: 'money',
    key,
    value: Math.round(value * 100) / 100,
    unit: currency.toLowerCase(),
    recordedAt: at,
  })
}

/* Local midnight of an earlier moment, from today's local midnight: whole
   days back, so it holds across the server's own time zone. */
function startOfDayNear(at: number, dayStart: number): number {
  const days = Math.ceil((dayStart - at) / 86_400_000)
  const guess = dayStart - days * 86_400_000
  return guess > at ? guess - 86_400_000 : guess
}

/** What one currency of the account holds now, as he read it. */
export const setBalance = mutation({
  args: {
    accountId: v.id('accounts'),
    currency: v.string(),
    value: v.number(),
    /** Local midnight today, from the client — the server does not know
        where "today" starts for him. */
    dayStart: v.number(),
    /** When it was true, if not now — "as of Sep 25". */
    asOf: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    await writeBalance(
      ctx,
      ownerId,
      account,
      args.currency,
      args.value,
      args.dayStart,
      args.asOf,
    )
    return null
  },
})

/**
 * Delete, as he means it (27 Sep): the account leaves every list and
 * total. If nothing hangs off it — no trades, bills or transactions — it
 * goes for good with its readings (a typo'd "Revoult"). Otherwise it is
 * retired: gone from view, while what it paid and earned stays in his
 * history, because that happened.
 */
export const remove = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.union(v.literal('deleted'), v.literal('retired')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    const trade = await ctx.db
      .query('trades')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .first()
    const log = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .first()
    const bills = await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(100)
    if (
      trade !== null ||
      log !== null ||
      bills.some((b) => b.accountId === args.accountId)
    ) {
      await ctx.db.patch(args.accountId, { retiredAt: Date.now() })
      return 'retired'
    }
    for (const currency of account.currencies) {
      const readings = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', balanceKey(args.accountId, currency)),
        )
        .take(1000)
      for (const r of readings) await ctx.db.delete(r._id)
    }
    await ctx.db.delete(args.accountId)
    return 'deleted'
  },
})

const ERASE_ROWS = 4000

/** Deleted accounts whose history still counts, with how much of it there
    is — what an erase would take away. */
export const retired = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      name: v.string(),
      domain: v.optional(v.string()),
      rows: v.number(),
      trades: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const gone = (await ownAccounts(ctx, ownerId)).filter(
      (a) => a.retiredAt !== undefined,
    )
    return Promise.all(
      gone.map(async (a) => ({
        accountId: a._id,
        name: a.name,
        domain: a.domain,
        rows: (
          await ctx.db
            .query('logs')
            .withIndex('by_owner_account_time', (q) =>
              q.eq('ownerId', ownerId).eq('accountId', a._id),
            )
            .take(ERASE_ROWS)
        ).length,
        trades: (
          await ctx.db
            .query('trades')
            .withIndex('by_owner_account', (q) =>
              q.eq('ownerId', ownerId).eq('accountId', a._id),
            )
            .take(ERASE_ROWS)
        ).length,
      })),
    )
  },
})

/**
 * Delete with its history (27 Sep): for an account that should never have
 * existed — a test, or a statement read into the wrong place, which then
 * counts twice. Its rows, trades and readings go. What happened elsewhere
 * stays: a transfer's other side is still money that left or reached his
 * other account, so it keeps its row and loses only the link; a bill paid
 * from it stays a bill, from no account.
 */
export const erase = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .take(ERASE_ROWS)
    if (logs.length === ERASE_ROWS) {
      throw new ConvexError('Too much history to erase at once.')
    }
    const erased = new Set(logs.map((l) => l._id))
    for (const log of logs) {
      if (log.kind === 'move') {
        const other = await transferPair(ctx, ownerId, log)
        if (other !== null && !erased.has(other._id) && other.meta) {
          await ctx.db.patch(other._id, {
            meta: {
              ...other.meta,
              pairOf: undefined,
              otherAccountId: undefined,
            },
          })
        }
      }
    }
    for (const log of logs) await ctx.db.delete(log._id)

    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .take(ERASE_ROWS)
    for (const t of trades) await ctx.db.delete(t._id)

    const bills = await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(100)
    for (const b of bills)
      if (b.accountId === args.accountId)
        await ctx.db.patch(b._id, { accountId: undefined })

    const intakes = await ctx.db
      .query('intakes')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(200)
    for (const i of intakes)
      if (i.accountId === args.accountId)
        await ctx.db.patch(i._id, { accountId: undefined })

    for (const currency of account.currencies) {
      const readings = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', balanceKey(args.accountId, currency)),
        )
        .take(1000)
      for (const r of readings) await ctx.db.delete(r._id)
    }
    await ctx.db.delete(args.accountId)
    return null
  },
})

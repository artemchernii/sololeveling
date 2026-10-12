import { ConvexError, v } from 'convex/values'

import { lookFamily, reconcile } from '../src/lib/holdings'
import { UNPRICED } from '../src/lib/market'
import {
  T212,
  cashOf,
  heldAs,
  mergeChanged,
  tickerOf,
  whatChanged,
} from '../src/lib/t212'
import {
  balanceKey,
  brokerCashKey,
  hasBrokerCash,
  writeBalance,
} from './accounts'
import { requireUser } from './auth'
import { CHECK_LOST_MS } from './bankRows'
import { SAME_LOOK_MS, writeScreenPrice } from './intake'
import { upsertInstrument } from './invest'
import { searchYahoo } from './market'
import { T212Fail, t212Api } from './t212Api'
import { internal } from './_generated/api'
import { action, internalMutation, mutation } from './_generated/server'
import type { ActionCtx, MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* Trading 212 connected (12 Oct, docs/specs/2026-10-12-trading-212.md):
   its free cash and its positions, read from Trading 212 itself and stored.

   Free cash is an external reading (PLAN.md §1 source 4): a `stateSnapshots`
   row with source 'sync', as of the moment Trading 212 answered. Positions
   are a look, like a broker screen — one `holdings` row each, all of one
   moment — and a company that left the list is a look of 0 shares, because
   this list is whole where a screenshot may be half. What the shares are
   worth stays shares × the app's stored price; Trading 212's own price is
   stored only for a share no market prices.

   The whole answer or none: both calls are made before a thing is written,
   and `arrive` is one step. */

const ROWS = 2000
const SOURCE = 'Trading 212'

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

const position = v.object({
  ticker: v.string(),
  name: v.string(),
  isin: v.optional(v.string()),
  shares: v.number(),
  valueEur: v.optional(v.number()),
  paidEur: v.optional(v.number()),
  /* What the market calls it, for one the account never held. */
  candidate: v.optional(candidate),
  /* The holding it is, when the market lists it under that ticker too. */
  held: v.optional(v.string()),
})

async function linkOf(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
) {
  return await ctx.db
    .query('bankLinks')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .unique()
}

/* The shares the account holds now, by instrument: its trades and its
   looks, merged as every other reader merges them. */
async function sharesHeld(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
) {
  const looks = await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .take(ROWS)
  const trades = await ctx.db
    .query('trades')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .take(ROWS)
  const ids = new Set([...looks, ...trades].map((r) => r.instrumentId))
  const held: Array<{ inst: Doc<'instruments'>; shares: number }> = []
  for (const id of ids) {
    const inst = await ctx.db.get(id)
    /* Trading 212 lists shares and funds: a coin or a metal is not its. */
    if (inst === null || lookFamily(inst) !== 'security') continue
    held.push({
      inst,
      shares: reconcile(
        trades.filter((t) => t.instrumentId === id),
        looks.filter((h) => h.instrumentId === id),
      ).shares,
    })
  }
  return { held, looks }
}

/** A look begins: the account is his and is Trading 212, no other look is
    running — and which companies it holds already, to know the new ones. */
export const begin = internalMutation({
  args: {
    ownerId: v.string(),
    accountId: v.id('accounts'),
    connect: v.boolean(),
  },
  returns: v.union(
    v.object({ status: v.literal('busy') }),
    v.object({
      status: v.literal('go'),
      uid: v.string(),
      known: v.array(
        v.object({
          symbol: v.string(),
          name: v.string(),
          isin: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId)
    if (
      account === null ||
      account.ownerId !== args.ownerId ||
      account.retiredAt
    )
      throw new ConvexError('No such account.')
    if (account.institution !== T212 || !account.kinds.includes('broker'))
      throw new ConvexError(`${account.name} is not Trading 212.`)
    /* One key for the whole backend, and it is one person's (12 Oct,
       docs/specs/2026-09-26-later-sharing.md point 6): it answers only for
       the user who connected first. Anyone else would be shown that
       person's cash and positions. */
    const first = await ctx.db
      .query('bankLinks')
      .withIndex('by_via', (q) => q.eq('via', 't212'))
      .first()
    if (first !== null && first.ownerId !== args.ownerId)
      throw new ConvexError(
        'The Trading 212 key here belongs to another user. Nothing changed.',
      )
    const now = Date.now()
    let link = await linkOf(ctx, args.ownerId, args.accountId)
    if (link === null) {
      if (!args.connect) throw new ConvexError('This account is not connected.')
      const id = await ctx.db.insert('bankLinks', {
        ownerId: args.ownerId,
        accountId: args.accountId,
        status: 'linked',
        via: 't212',
        uids: [{ uid: 't212', currency: 'EUR' }],
        startedAt: now,
      })
      link = await ctx.db.get(id)
    }
    if (link === null || link.via !== 't212' || link.uids === undefined)
      throw new ConvexError(`${account.name} is not Trading 212.`)
    if (link.checking !== undefined && now - link.checking < CHECK_LOST_MS)
      return { status: 'busy' as const }
    await ctx.db.patch(link._id, { checking: now })
    const { held } = await sharesHeld(ctx, args.ownerId, args.accountId)
    return {
      status: 'go' as const,
      uid: link.uids[0].uid,
      known: held.map(({ inst }) => ({
        symbol: inst.symbol,
        name: inst.name,
        ...(inst.isin !== undefined ? { isin: inst.isin } : {}),
      })),
    }
  },
})

/** Trading 212 gave nothing: the look is over and nothing was written. A
    link that never worked is removed; one that did keeps why. */
export const fail = internalMutation({
  args: {
    ownerId: v.string(),
    accountId: v.id('accounts'),
    why: v.union(v.literal('refused'), v.literal('down')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await linkOf(ctx, args.ownerId, args.accountId)
    if (link === null) return null
    if (link.checkedAt === undefined) await ctx.db.delete(link._id)
    else
      await ctx.db.patch(link._id, {
        checking: undefined,
        failed: { at: Date.now(), why: args.why },
      })
    return null
  },
})

/** Trading 212 answered, whole: the cash and every position are laid
    against what the account holds, and only what differs is written. */
export const arrive = internalMutation({
  args: {
    ownerId: v.string(),
    accountId: v.id('accounts'),
    dayStart: v.number(),
    cash: v.object({ currency: v.string(), value: v.number() }),
    positions: v.array(position),
  },
  returns: v.object({ same: v.number(), changed: v.number() }),
  handler: async (ctx, args) => {
    const { ownerId } = args
    const link = await linkOf(ctx, ownerId, args.accountId)
    const account = await ctx.db.get(args.accountId)
    if (
      link === null ||
      link.via !== 't212' ||
      account === null ||
      account.ownerId !== ownerId
    )
      throw new ConvexError('This account is not connected.')
    const at = Date.now()
    const { held, looks } = await sharesHeld(ctx, ownerId, account._id)

    const was = new Map(held.map((h) => [h.inst._id, h.shares]))
    const now = new Map<Id<'instruments'>, number>()
    const paid = new Map<Id<'instruments'>, number>()
    const insts = held.map((h) => h.inst)
    for (const p of args.positions) {
      const byListing =
        p.held === undefined ? -1 : insts.findIndex((i) => i.symbol === p.held)
      const k = byListing >= 0 ? byListing : heldAs(p, insts)
      let id: Id<'instruments'>
      if (k >= 0) {
        id = insts[k]._id
        if (p.isin !== undefined && insts[k].isin === undefined)
          await ctx.db.patch(id, { isin: p.isin })
      } else {
        id = await upsertInstrument(
          ctx,
          ownerId,
          p.candidate ?? {
            symbol: tickerOf(p.ticker),
            name: p.name,
            exchange: SOURCE,
            type: UNPRICED,
          },
          p.isin,
        )
        const inst = await ctx.db.get(id)
        if (inst !== null) insts.push(inst)
      }
      now.set(id, (now.get(id) ?? 0) + p.shares)
      if (p.paidEur !== undefined) paid.set(id, (paid.get(id) ?? 0) + p.paidEur)
      /* Only Trading 212 says what a share no market prices is worth. */
      const inst = insts.find((i) => i._id === id)
      if (inst?.type === UNPRICED && p.valueEur !== undefined)
        await writeScreenPrice(ctx, ownerId, id, account, {
          priceEur: p.valueEur / p.shares,
          asOf: at,
          source: SOURCE,
        })
    }

    const lines = whatChanged(was, now)
    /* A file saved since this link's last look may have left a company
       out: the whole list is written again, so nothing reads as missing. */
    const lastLook = Math.max(0, ...looks.map((h) => h.asOf))
    const write =
      lines.length > 0 || link.lookAt === undefined || lastLook > link.lookAt
    if (write)
      for (const id of new Set([...now.keys(), ...lines.map((l) => l.id)])) {
        for (const h of looks)
          if (h.instrumentId === id && at - h.asOf < SAME_LOOK_MS)
            await ctx.db.delete(h._id)
        const cost = paid.get(id)
        await ctx.db.insert('holdings', {
          ownerId,
          accountId: account._id,
          instrumentId: id,
          shares: Math.round((now.get(id) ?? 0) * 1e6) / 1e6,
          ...(cost !== undefined
            ? { paidEur: Math.round(cost * 100) / 100 }
            : {}),
          asOf: at,
        })
      }

    const pocket = hasBrokerCash(account) ? 'broker' : 'free'
    const cashWas = (
      await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq(
              'key',
              pocket === 'broker'
                ? brokerCashKey(account._id)
                : balanceKey(account._id, args.cash.currency),
            ),
        )
        .order('desc')
        .first()
    )?.value
    const cashMoved =
      cashWas === undefined || Math.abs(cashWas - args.cash.value) >= 0.005
    /* Written on every answer, the same amount or not (12 Oct: connected,
       and the check-in still called its balance nine days old): the cash
       is as fresh as Trading 212's last answer. One reading a day is kept. */
    await writeBalance(
      ctx,
      ownerId,
      account,
      args.cash.currency,
      args.cash.value,
      args.dayStart,
      at,
      'sync',
      pocket,
    )

    /* The first answer shows its block too (12 Oct, his "i dont get if it
       works or not"): what differs from the last file, as of that file. */
    const open = link.changed
    const merged = mergeChanged(
      (open?.lines ?? []).map((l) => ({ ...l, id: l.instrumentId })),
      lines,
    )
    const startCash =
      open !== undefined ? open.cashWas : cashMoved ? cashWas : undefined
    const cashLine =
      startCash !== undefined && Math.abs(startCash - args.cash.value) >= 0.005
    await ctx.db.patch(link._id, {
      checking: undefined,
      failed: undefined,
      checkedAt: at,
      lookAt: write ? at : link.lookAt,
      changed:
        merged.length === 0 && !cashLine
          ? undefined
          : {
              at: open?.at ?? link.checkedAt ?? (lastLook || at),
              ...(cashLine ? { cashWas: startCash } : {}),
              lines: merged.map(({ id, was: w, now: n }) => ({
                instrumentId: id,
                was: w,
                now: n,
              })),
            },
    })
    const kept = [...now.keys()].filter((id) => !lines.some((l) => l.id === id))
    return {
      same: kept.length + (cashMoved ? 0 : 1),
      changed: lines.length + (cashMoved ? 1 : 0),
    }
  },
})

export type Looked =
  | { status: 'checked'; same: number; changed: number }
  | { status: 'busy' | 'refused' | 'down' }

/* Ask Trading 212 and lay its answer against the account. */
async function pull(
  ctx: ActionCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  dayStart: number,
  connect: boolean,
): Promise<Looked> {
  const start = await ctx.runMutation(internal.t212.begin, {
    ownerId,
    accountId,
    connect,
  })
  if (start.status === 'busy') return start
  try {
    const api = t212Api(start.uid)
    const cash = await api.summary()
    const positions = []
    for (const p of await api.positions()) {
      /* A company the account never held: what the market calls it, by
         its ISIN. None found — it is kept at Trading 212's own price. */
      const listings =
        heldAs(p, start.known) >= 0 ||
        p.isin === undefined ||
        process.env.E2E === '1'
          ? []
          : await searchYahoo(p.isin)
      /* One fund is listed in several places under several tickers (12
         Oct: VHYD in London is the VHYL the account held from Amsterdam,
         and it was saved as a second fund). A listing the account holds
         already is that holding. */
      const held = start.known.find((k) =>
        listings.some((c) => c.symbol === k.symbol),
      )?.symbol
      const found = listings.find(
        (c) => c.type === 'EQUITY' || c.type === 'ETF',
      )
      positions.push({
        ...p,
        ...(held ? { held } : found ? { candidate: found } : {}),
      })
    }
    const done: { same: number; changed: number } = await ctx.runMutation(
      internal.t212.arrive,
      {
        ownerId,
        accountId,
        dayStart,
        cash: { currency: cash.currency, value: cashOf(cash) },
        positions,
      },
    )
    return { status: 'checked', ...done }
  } catch (e) {
    const why = e instanceof T212Fail ? e.why : 'down'
    await ctx.runMutation(internal.t212.fail, { ownerId, accountId, why })
    if (e instanceof T212Fail) return { status: why }
    throw e
  }
}

/** CONNECT pressed: Trading 212 is asked once, and the card is set by its
    answer. There is no page to visit — the key is on the backend. */
export const connect = action({
  args: { accountId: v.id('accounts'), dayStart: v.number() },
  returns: v.object({ same: v.number(), changed: v.number() }),
  handler: async (ctx, args): Promise<{ same: number; changed: number }> => {
    const ownerId = await requireUser(ctx)
    /* No key: said before a link is kept. */
    t212Api('t212')
    const got = await pull(ctx, ownerId, args.accountId, args.dayStart, true)
    if (got.status === 'checked')
      return { same: got.same, changed: got.changed }
    throw new ConvexError(
      got.status === 'refused'
        ? 'Trading 212 did not accept the key. Nothing changed.'
        : got.status === 'down'
          ? 'Trading 212 did not answer. Nothing changed.'
          : 'Trading 212 is being asked already.',
    )
  },
})

/** Finances was opened and the last answer is old, or TRY AGAIN: ask. */
export const check = action({
  args: { accountId: v.id('accounts'), dayStart: v.number() },
  returns: v.union(
    v.literal('checked'),
    v.literal('busy'),
    v.literal('refused'),
    v.literal('down'),
  ),
  handler: async (ctx, args): Promise<Looked['status']> => {
    const ownerId = await requireUser(ctx)
    return (await pull(ctx, ownerId, args.accountId, args.dayStart, false))
      .status
  },
})

/** ✕ on the card's changed block: seen. What was saved stays. */
export const close = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const link = await linkOf(ctx, ownerId, args.accountId)
    if (link === null || link.via !== 't212')
      throw new ConvexError('This account is not connected.')
    await ctx.db.patch(link._id, { changed: undefined })
    return null
  },
})

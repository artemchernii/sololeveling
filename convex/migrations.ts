import { v } from 'convex/values'

import { upsertInstrument } from './invest'
import { transferPair } from './logs'
import { internalMutation } from './_generated/server'
import { productIn } from '../src/lib/institutions'
import { ownMoney, storedDuplicates } from '../src/lib/intake'

/* One owner's money rows, moved into the "adding money" shape (27 Sep):
   run once per owner (`npx convex run migrations:addingMoney`), safe to
   run again — each step looks before it writes.

   1. An account learns its institution from its name or its logo's site.
   2. A "<bank> Invest" account (split off by this migration's first
      version, reversed the same day: "REVOLUT IS BANK AND BROKER") is
      joined back into its bank — its trades and rows move over, the
      Invest side of a bank → Invest transfer goes, and the bank is a
      broker too.
   3. Positions read off a first screenshot are marked `opening`: they
      were held before the app saw the account, and their cost never left
      its cash.
   4. A transfer written as one row gets its other side, so both balances
      know about it. */

export const addingMoney = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({
    institutions: v.number(),
    joined: v.number(),
    opening: v.number(),
    paired: v.number(),
  }),
  handler: async (ctx, { ownerId }) => {
    const done = { institutions: 0, joined: 0, opening: 0, paired: 0 }
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)

    for (const a of accounts) {
      if (a.institution !== undefined) continue
      const product = productIn(a.name) ?? productIn(a.domain)
      if (product) {
        await ctx.db.patch(a._id, { institution: product.institution })
        done.institutions++
      }
    }

    /* "<bank> Invest" back into its bank: one account, bank and broker.
       Read again — step 1 just taught them their institutions. */
    const known = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const inv of known) {
      if (!inv.name.endsWith(' Invest')) continue
      const bank = known.find(
        (x) =>
          x._id !== inv._id &&
          (x.institution === undefined
            ? false
            : x.institution === inv.institution) &&
          x.kinds.includes('bank'),
      )
      if (bank === undefined) continue
      const trades = await ctx.db
        .query('trades')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', inv._id),
        )
        .take(2000)
      for (const t of trades) await ctx.db.patch(t._id, { accountId: bank._id })
      const logs = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', inv._id),
        )
        .take(5000)
      for (const l of logs) {
        /* The Invest side of a bank → Invest transfer goes; the bank side
           stays as money into its own stocks. */
        if (l.kind === 'move' && l.meta?.otherAccountId === bank._id) {
          const pair = await transferPair(ctx, ownerId, l)
          if (pair !== null) {
            await ctx.db.patch(pair._id, {
              meta: {
                ...pair.meta,
                otherAccountId: bank._id,
                pairOf: undefined,
              },
            })
          }
          await ctx.db.delete(l._id)
          continue
        }
        await ctx.db.patch(l._id, { accountId: bank._id })
      }
      const pointing = await ctx.db
        .query('logs')
        .withIndex('by_owner_area_time', (q) =>
          q.eq('ownerId', ownerId).eq('area', 'money'),
        )
        .take(5000)
      for (const l of pointing) {
        if (l.meta?.otherAccountId === inv._id) {
          await ctx.db.patch(l._id, {
            meta: { ...l.meta, otherAccountId: bank._id },
          })
        }
      }
      for (const currency of inv.currencies) {
        const readings = await ctx.db
          .query('stateSnapshots')
          .withIndex('by_owner_key_time', (q) =>
            q
              .eq('ownerId', ownerId)
              .eq('key', `balance:${inv._id}:${currency}`),
          )
          .take(1000)
        for (const r of readings) await ctx.db.delete(r._id)
      }
      const fresh = await ctx.db.get(bank._id)
      if (fresh && !fresh.kinds.includes('broker')) {
        await ctx.db.patch(bank._id, { kinds: [...fresh.kinds, 'broker'] })
      }
      await ctx.db.delete(inv._id)
      done.joined++
    }

    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .take(2000)
    for (const t of trades) {
      if (t.importId !== undefined && t.opening === undefined) {
        await ctx.db.patch(t._id, { opening: true })
        done.opening++
      }
    }

    const moves = (
      await ctx.db
        .query('logs')
        .withIndex('by_owner_area_time', (q) =>
          q.eq('ownerId', ownerId).eq('area', 'money'),
        )
        .take(5000)
    ).filter((l) => l.kind === 'move')
    for (const l of moves) {
      const otherId = l.meta?.otherAccountId
      if (otherId === undefined || l.meta?.pairOf !== undefined) continue
      if ((await transferPair(ctx, ownerId, l)) !== null) continue
      const other = await ctx.db.get(otherId)
      const unit = l.unit ?? 'eur'
      if (
        other === null ||
        other.ownerId !== ownerId ||
        other._id === l.accountId ||
        !other.currencies.includes(unit.toUpperCase())
      )
        continue
      await ctx.db.insert('logs', {
        ownerId,
        kind: 'move',
        area: 'money',
        occurredAt: l.occurredAt,
        value: -(l.value ?? 0),
        unit,
        text: l.text,
        accountId: other._id,
        meta: {
          merchant: l.meta?.merchant,
          raw: l.meta?.raw,
          intakeId: l.meta?.intakeId,
          otherAccountId: l.accountId,
          pairOf: l._id,
        },
      })
      done.paired++
    }
    return done
  },
})

/* His own money, re-filed (1 Oct): rows stored as income or spending
   before `ownMoney` existed — "TRF. P/O ARTEM CHERNII" +€400 counted as
   money in, a typed "withdraw" +€20 in Cash. Each becomes a move, signed
   as its account sees it. `names` are his, as statements print them.
   Run once per owner; safe to run again — a move is never touched. */
export const ownMoneyMoves = internalMutation({
  args: { ownerId: v.string(), names: v.array(v.string()) },
  returns: v.object({ income: v.number(), spending: v.number() }),
  handler: async (ctx, { ownerId, names }) => {
    const done = { income: 0, spending: 0 }
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q.eq('ownerId', ownerId).eq('area', 'money'),
      )
      .take(8000)
    for (const l of rows) {
      if (l.kind !== 'income' && l.kind !== 'expense') continue
      const amount = l.kind === 'income' ? (l.value ?? 0) : -(l.value ?? 0)
      const said = {
        amount,
        merchant: l.meta?.merchant ?? l.text ?? '',
        raw: l.meta?.raw,
      }
      if (!ownMoney(said, names)) continue
      const { category: _c, recurringId: _r, ...meta } = l.meta ?? {}
      await ctx.db.patch(l._id, { kind: 'move', value: amount, meta })
      if (l.kind === 'income') done.income++
      else done.spending++
    }
    return done
  },
})

/**
 * One-off (3 Oct): his first bulk drop wrote some rows twice — the
 * September statement named them "DD PAYPAL EUROPE…", last week's file
 * "PayPal Europe" — before duplicates were matched by the bank's own line.
 * Per account, spending and money in only (a transfer is a pair, handled
 * apart), the later-written of each duplicate goes. `remove` names rows
 * no rule can find (an invented row; one he typed that a file now
 * brings). Dry run by default: it lists, and writes only with apply.
 */
export const dedupeMoney = internalMutation({
  args: {
    ownerId: v.string(),
    apply: v.boolean(),
    remove: v.optional(v.array(v.id('logs'))),
  },
  returns: v.array(
    v.object({
      id: v.id('logs'),
      account: v.string(),
      day: v.string(),
      amount: v.number(),
      text: v.string(),
      why: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', args.ownerId))
      .take(50)
    const out = []
    for (const a of accounts) {
      const logs = (
        await ctx.db
          .query('logs')
          .withIndex('by_owner_account_time', (q) =>
            q.eq('ownerId', args.ownerId).eq('accountId', a._id),
          )
          .take(5000)
      ).filter((l) => l.kind === 'expense' || l.kind === 'income')
      const twice = new Set(
        storedDuplicates(
          logs.map((l) => ({
            id: l._id,
            written: l._creationTime,
            occurredAt: l.occurredAt,
            amount: l.kind === 'expense' ? -(l.value ?? 0) : (l.value ?? 0),
            merchant: l.meta?.merchant ?? l.text ?? '',
            raw: l.meta?.raw,
            file: l.meta?.intakeId,
          })),
        ),
      )
      for (const l of logs) {
        const named = (args.remove ?? []).includes(l._id)
        if (!twice.has(l._id) && !named) continue
        out.push({
          id: l._id,
          account: a.name,
          day: new Date(l.occurredAt).toISOString().slice(0, 10),
          amount: l.kind === 'expense' ? -(l.value ?? 0) : (l.value ?? 0),
          text: l.meta?.merchant ?? l.text ?? '',
          why: named ? 'named' : 'written twice',
        })
        if (args.apply) await ctx.db.delete(l._id)
      }
    }
    return out
  },
})

/* A position filed under the wrong listing (3 Oct): Trading 212's "SHLD"
   is iShares Digital Security, SHLD.L — the reader took Yahoo's US
   defence ETF, and his investments read €2,885 for €2,014. Moves every
   holding and trade on `from` to `to`; lists first, writes only with
   apply. The new listing's prices are read as it is made. */
export const relist = internalMutation({
  args: {
    ownerId: v.string(),
    from: v.string(),
    to: v.object({
      symbol: v.string(),
      name: v.string(),
      exchange: v.string(),
      type: v.string(),
    }),
    apply: v.boolean(),
  },
  returns: v.object({
    holdings: v.array(v.object({ shares: v.number(), day: v.string() })),
    trades: v.number(),
  }),
  handler: async (ctx, args) => {
    const from = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', args.ownerId).eq('symbol', args.from),
      )
      .first()
    if (from === null) return { holdings: [], trades: 0 }
    const holdings = await ctx.db
      .query('holdings')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', args.ownerId).eq('instrumentId', from._id),
      )
      .take(500)
    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', args.ownerId).eq('instrumentId', from._id),
      )
      .take(5000)
    if (args.apply) {
      const to = await upsertInstrument(ctx, args.ownerId, args.to)
      for (const h of holdings) await ctx.db.patch(h._id, { instrumentId: to })
      for (const t of trades) await ctx.db.patch(t._id, { instrumentId: to })
    }
    return {
      holdings: holdings.map((h) => ({
        shares: h.shares,
        day: new Date(h.asOf).toISOString().slice(0, 10),
      })),
      trades: trades.length,
    }
  },
})

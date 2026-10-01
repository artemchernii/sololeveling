import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount } from './accounts'
import { checkTrade, heldShares, upsertInstrument } from './invest'
import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { ownMoney } from '../src/lib/intake'

/* Money he types (27 Sep, "adding money"): one line or several —
   `in 2900 salary`, `out 1200 laptop revolut`, `bpi → tr 2000`,
   `bought 3 msft 402 tr` — parsed in src/lib/money-lines.ts, checked in
   the same list a statement fills, and written here in one go. Every
   movement is from → to: money in comes from outside, money out goes
   outside, a transfer is between two of his accounts (a row in each), a
   buy moves a broker's cash into a position and a sell moves it back.
   Small spending still comes in by the batch, from statements. */

const FUTURE_GRACE_MS = 5 * 60_000
const MAX_LINES = 50

function checkAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    throw new ConvexError('That is not an amount.')
  }
  return Math.round(amount * 100) / 100
}

function checkWhen(occurredAt: number) {
  if (occurredAt > Date.now() + FUTURE_GRACE_MS) {
    throw new ConvexError('It has to have happened.')
  }
}

function cleanNote(note: string | undefined) {
  const n = note?.trim()
  if (n && n.length > 200) throw new ConvexError('That note is too long.')
  return n || undefined
}

function cleanCategory(category: string) {
  const c = category.trim().toLowerCase()
  if (c.length === 0 || c.length > 24) throw new ConvexError('Say what it was.')
  return c
}

function holds(account: Doc<'accounts'>, currency: string) {
  if (!account.currencies.includes(currency)) {
    throw new ConvexError(`${account.name} does not hold ${currency}.`)
  }
}

/**
 * A transfer between two of his accounts: a row in each, signed — out of
 * one, into the other — so both balances move and neither is spending or
 * income. The arriving row names the leaving one (`pairOf`).
 */
export async function writeTransfer(
  ctx: MutationCtx,
  ownerId: string,
  t: {
    from: Doc<'accounts'>
    to: Doc<'accounts'>
    amount: number
    currency: string
    occurredAt: number
    text: string
    raw?: string
    intakeId?: Id<'intakes'>
  },
): Promise<Id<'logs'>> {
  const base = {
    ownerId,
    kind: 'move' as const,
    area: 'money',
    occurredAt: t.occurredAt,
    unit: t.currency.toLowerCase(),
    text: t.text,
  }
  const out = await ctx.db.insert('logs', {
    ...base,
    value: -t.amount,
    accountId: t.from._id,
    meta: {
      merchant: t.text,
      raw: t.raw,
      intakeId: t.intakeId,
      otherAccountId: t.to._id,
    },
  })
  await ctx.db.insert('logs', {
    ...base,
    value: t.amount,
    accountId: t.to._id,
    meta: {
      merchant: t.text,
      raw: t.raw,
      intakeId: t.intakeId,
      otherAccountId: t.from._id,
      pairOf: out,
    },
  })
  return out
}

/* Euros per one of `currency`, from the latest stored ECB rate — how a
   price typed in dollars becomes the euros a trade is kept in. */
export async function euroRate(
  ctx: MutationCtx,
  ownerId: string,
  currency: string,
): Promise<number> {
  if (currency === 'EUR') return 1
  const row = await ctx.db
    .query('fxRates')
    .withIndex('by_owner_currency_time', (q) =>
      q.eq('ownerId', ownerId).eq('currency', currency),
    )
    .order('desc')
    .first()
  if (row === null) {
    throw new ConvexError(`There is no ${currency} rate yet — type it in €.`)
  }
  return row.rate
}

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

const line = v.union(
  v.object({
    kind: v.union(v.literal('in'), v.literal('out')),
    accountId: v.id('accounts'),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    note: v.optional(v.string()),
    occurredAt: v.number(),
  }),
  v.object({
    kind: v.literal('transfer'),
    fromAccountId: v.id('accounts'),
    toAccountId: v.id('accounts'),
    amount: v.number(),
    currency: v.string(),
    note: v.optional(v.string()),
    occurredAt: v.number(),
  }),
  v.object({
    kind: v.union(v.literal('buy'), v.literal('sell')),
    accountId: v.id('accounts'),
    candidate,
    shares: v.number(),
    /** Per share, in `priceCurrency`. */
    price: v.number(),
    priceCurrency: v.string(),
    occurredAt: v.number(),
  }),
)

/**
 * The lines he checked, all or nothing: one that cannot be written (an
 * account that is not his, more shares sold than held) refuses the lot,
 * and the list stays as it was for him to fix.
 */
export const record = mutation({
  args: { lines: v.array(line) },
  returns: v.object({ written: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (args.lines.length === 0) throw new ConvexError('Nothing to add.')
    if (args.lines.length > MAX_LINES) {
      throw new ConvexError(`At most ${MAX_LINES} lines at once.`)
    }
    for (const l of args.lines) {
      checkWhen(l.occurredAt)
      /* By shape: TypeScript narrows a union on `in`, not on a kind that is
         itself two literals. */
      if ('category' in l) {
        const account = await ownedAccount(ctx, ownerId, l.accountId)
        holds(account, l.currency)
        const category = cleanCategory(l.category)
        const note = cleanNote(l.note)
        const text = note ?? (l.kind === 'out' ? 'Purchase' : category)
        const amount = checkAmount(l.amount)
        /* "withdraw 20" into Cash is his own money arriving from a bank,
           not income (1 Oct): a move, signed as this account sees it. */
        const signed = l.kind === 'out' ? -amount : amount
        if (ownMoney({ amount: signed, merchant: `${text} ${category}` }, [])) {
          await ctx.db.insert('logs', {
            ownerId,
            kind: 'move',
            area: 'money',
            occurredAt: l.occurredAt,
            value: signed,
            unit: l.currency.toLowerCase(),
            text,
            accountId: account._id,
            meta: { merchant: text },
          })
          continue
        }
        await ctx.db.insert('logs', {
          ownerId,
          kind: l.kind === 'out' ? 'expense' : 'income',
          area: 'money',
          occurredAt: l.occurredAt,
          value: amount,
          unit: l.currency.toLowerCase(),
          text,
          accountId: account._id,
          meta: { category, merchant: text },
        })
      } else if (l.kind === 'transfer') {
        const from = await ownedAccount(ctx, ownerId, l.fromAccountId)
        const to = await ownedAccount(ctx, ownerId, l.toAccountId)
        if (from._id === to._id) {
          throw new ConvexError('From and to are the same account.')
        }
        holds(from, l.currency)
        holds(to, l.currency)
        await writeTransfer(ctx, ownerId, {
          from,
          to,
          amount: checkAmount(l.amount),
          currency: l.currency,
          occurredAt: l.occurredAt,
          text: cleanNote(l.note) ?? `${from.name} → ${to.name}`,
        })
      } else {
        const account = await ownedAccount(ctx, ownerId, l.accountId)
        if (!account.kinds.includes('broker')) {
          throw new ConvexError(`${account.name} is not a broker.`)
        }
        const priceEur =
          l.price * (await euroRate(ctx, ownerId, l.priceCurrency))
        checkTrade(l.shares, priceEur)
        const instrumentId = await upsertInstrument(ctx, ownerId, l.candidate)
        if (l.kind === 'sell') {
          const held = await heldShares(ctx, ownerId, account._id, instrumentId)
          if (l.shares > held + 1e-9) {
            throw new ConvexError(
              `${account.name} holds only ${Math.round(held * 1e6) / 1e6} ${l.candidate.symbol} to sell.`,
            )
          }
        }
        await ctx.db.insert('trades', {
          ownerId,
          accountId: account._id,
          instrumentId,
          side: l.kind,
          shares: l.shares,
          priceEur: Math.round(priceEur * 10000) / 10000,
          occurredAt: l.occurredAt,
        })
      }
    }
    return { written: args.lines.length }
  },
})

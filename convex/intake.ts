import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount, writeBalance } from './accounts'
import { checkTrade, heldShares, upsertInstrument } from './invest'
import { transferPair } from './logs'
import { writeTransfer } from './money'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import {
  INTAKE_MODEL_NAME,
  INTAKE_WINDOW_MS,
  INTAKES_PER_WINDOW,
  MAX_INTAKE_BYTES,
  MAX_INTAKE_FILES,
  findDuplicates,
  findRecurring,
  matchAccount,
  merchantKey,
  readableFile,
} from '../src/lib/intake'
import { dueDay } from '../src/lib/bills'

/* The intake (Treasury, 27 Sep): what he drops on + becomes a list he
   checks. `start` stores the files and asks the reader (ai/intake.ts);
   `review` is the smart part — it lays the rows against what he already
   has: duplicates, moves between his own accounts, merchants he taught,
   bills that match, things that come round; `confirmTransactions` and
   `confirmHoldings` write only what he kept. Nothing is a log, a trade or
   a balance before that. */

const MAX_TRADES = 2000
const HISTORY_ROWS = 3000
const DAY_MS = 86_400_000

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

async function ownedIntake(
  ctx: { db: { get: (id: Id<'intakes'>) => Promise<Doc<'intakes'> | null> } },
  ownerId: string,
  intakeId: Id<'intakes'>,
): Promise<Doc<'intakes'>> {
  const row = await ctx.db.get(intakeId)
  if (row === null || row.ownerId !== ownerId) throw new Error('No such intake')
  return row
}

/**
 * Files he dropped. A refusal is returned, not thrown: a throw would roll
 * back the delete of the files it refuses and leave them stored for
 * nothing. The account is optional — the reader names the bank, and the
 * review matches it to one of his.
 */
export const start = mutation({
  args: {
    accountId: v.optional(v.id('accounts')),
    files: v.array(
      v.object({
        storageId: v.id('_storage'),
        contentType: v.string(),
        name: v.string(),
        size: v.number(),
      }),
    ),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), intakeId: v.id('intakes') }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (args.accountId) await ownedAccount(ctx, ownerId, args.accountId)
    const refuse = async (error: string) => {
      for (const f of args.files) await ctx.storage.delete(f.storageId)
      return { ok: false as const, error }
    }
    if (args.files.length === 0) return await refuse('Choose a file.')
    if (args.files.length > MAX_INTAKE_FILES) {
      return await refuse(`At most ${MAX_INTAKE_FILES} files at once.`)
    }
    for (const f of args.files) {
      if (readableFile(f.contentType, f.name) === null) {
        return await refuse(`${f.name} is not a PDF, a CSV or a screenshot.`)
      }
      if (f.size > MAX_INTAKE_BYTES)
        return await refuse(`${f.name} is over 10 MB.`)
    }
    const now = Date.now()
    const recent = await ctx.db
      .query('intakes')
      .withIndex('by_owner', (q) =>
        q.eq('ownerId', ownerId).gte('_creationTime', now - INTAKE_WINDOW_MS),
      )
      .take(INTAKES_PER_WINDOW + 1)
    if (recent.length >= INTAKES_PER_WINDOW) {
      return await refuse(
        `That's ${INTAKES_PER_WINDOW} files read in 30 days — the most this reads.`,
      )
    }
    const intakeId = await ctx.db.insert('intakes', {
      ownerId,
      accountId: args.accountId,
      storageIds: args.files.map((f) => f.storageId),
      status: 'reading',
    })
    await ctx.scheduler.runAfter(0, internal.ai.intake.read, { intakeId })
    return { ok: true as const, intakeId }
  },
})

/** What is still open — reading, ready to check, or failed. */
export const open = query({
  args: {},
  returns: v.array(schema.doc('intakes')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('intakes')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(20)
    return rows.filter((r) => r.status !== 'done')
  },
})

/** He picks which account it is about (or corrects the guess). */
export const setAccount = mutation({
  args: { intakeId: v.id('intakes'), accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedIntake(ctx, ownerId, args.intakeId)
    await ownedAccount(ctx, ownerId, args.accountId)
    await ctx.db.patch(args.intakeId, { accountId: args.accountId })
    return null
  },
})

const reviewRow = v.object({
  index: v.number(),
  occurredAt: v.number(),
  merchant: v.string(),
  raw: v.string(),
  amount: v.number(),
  currency: v.string(),
  pending: v.boolean(),
  /** What it is, as the rules and the reader see it. */
  kind: v.union(v.literal('spend'), v.literal('income'), v.literal('move')),
  category: v.union(v.string(), v.null()),
  /** 'rule' — a merchant he taught; 'reader' — the reader's guess. */
  categorySource: v.union(v.literal('rule'), v.literal('reader'), v.null()),
  /** A move's other account, when it can tell. */
  otherAccountId: v.union(v.id('accounts'), v.null()),
  counterparty: v.union(v.string(), v.null()),
  /** Already in his history: the log it repeats. */
  duplicateOf: v.union(v.id('logs'), v.null()),
  /** The bill this pays, if it matches one on its day. */
  recurringId: v.union(v.id('recurring'), v.null()),
})

/**
 * The review — every read row laid against what he already has. Computed
 * here, from his rows, every time it is opened: a merchant he teaches in
 * one review files itself in the next.
 */
export const review = query({
  args: { intakeId: v.id('intakes') },
  returns: v.union(
    v.null(),
    v.object({
      accountId: v.union(v.id('accounts'), v.null()),
      /** The account the reader's institution matched, when he has not picked. */
      guessedAccountId: v.union(v.id('accounts'), v.null()),
      rows: v.array(reviewRow),
      recurring: v.array(
        v.object({
          merchant: v.string(),
          amount: v.number(),
          day: v.number(),
          months: v.number(),
          alreadyABill: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    if (intake.status !== 'ready' || intake.kind !== 'transactions') return null
    const read = intake.transactions ?? []

    const accounts = (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(50)
    ).filter((a) => a.retiredAt === undefined)
    const guessed =
      intake.accountId ??
      (intake.institution
        ? (matchAccount(
            intake.institution,
            accounts.map((a) => ({
              id: a._id,
              name: a.name,
              domain: a.domain,
            })),
          ) as Id<'accounts'> | null)
        : null)
    const accountId = intake.accountId ?? null
    const here = accountId ?? guessed

    /* What he has in this account over the same days, for duplicates. */
    const times = read.map((r) => r.occurredAt)
    const from = Math.min(...times) - 3 * 86_400_000
    const to = Math.max(...times) + 3 * 86_400_000
    const existing = here
      ? await ctx.db
          .query('logs')
          .withIndex('by_owner_account_time', (q) =>
            q
              .eq('ownerId', ownerId)
              .eq('accountId', here)
              .gte('occurredAt', from)
              .lte('occurredAt', to),
          )
          .take(HISTORY_ROWS)
      : []
    const existingRows = existing.map((l) => ({
      occurredAt: l.occurredAt,
      amount:
        l.kind === 'income'
          ? (l.value ?? 0)
          : l.kind === 'move'
            ? (l.value ?? 0)
            : -(l.value ?? 0),
      merchant: l.meta?.merchant ?? l.text ?? '',
    }))
    const dups = findDuplicates(read, existingRows)
    /* A transfer is the same transfer whatever each bank calls it — "To
       Trade Republic" here, "Revolut → TR" typed, "Top up" on the other
       side: its own money moving is matched by amount and days alone. */
    const taken = new Set(dups.filter((d): d is number => d !== null))
    for (const [i, r] of read.entries()) {
      if (dups[i] !== null || !r.self) continue
      const j = existing.findIndex(
        (l, k) =>
          !taken.has(k) &&
          l.kind === 'move' &&
          Math.abs((l.value ?? 0) - r.amount) < 0.005 &&
          Math.abs(l.occurredAt - r.occurredAt) <= 2 * DAY_MS + 3_600_000,
      )
      if (j >= 0) {
        dups[i] = j
        taken.add(j)
      }
    }

    const rules = new Map<string, string>()
    for (const key of new Set(read.map((r) => merchantKey(r.merchant)))) {
      const rule = await ctx.db
        .query('merchantRules')
        .withIndex('by_owner_key', (q) =>
          q.eq('ownerId', ownerId).eq('key', key),
        )
        .first()
      if (rule) rules.set(key, rule.category)
    }

    const bills = await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(100)
    const liveBills = bills.filter((b) => b.endedAt === undefined)
    const usedBill = new Set<string>()

    const others = accounts
      .filter((a) => a._id !== here)
      .map((a) => ({ id: a._id, name: a.name, domain: a.domain }))

    const rows = read.map((r, index) => {
      const move = r.self
      const kind = move
        ? ('move' as const)
        : r.amount > 0
          ? ('income' as const)
          : ('spend' as const)
      const rule = rules.get(merchantKey(r.merchant))
      const category = kind === 'spend' ? (rule ?? r.category ?? null) : null
      let recurringId: Id<'recurring'> | null = null
      if (!move && !r.pending) {
        const d = new Date(r.occurredAt)
        for (const b of liveBills) {
          const due = dueDay(b, d.getFullYear(), d.getMonth())
          const sameWay = (b.kind === 'income') === r.amount > 0
          const key = `${b._id}:${d.getFullYear()}-${d.getMonth()}`
          if (
            due !== null &&
            sameWay &&
            !usedBill.has(key) &&
            Math.abs(Math.abs(r.amount) - b.amount) <= b.amount * 0.1 &&
            Math.abs(d.getDate() - due) <= 3 &&
            (merchantKey(b.name) === merchantKey(r.merchant) ||
              Math.abs(Math.abs(r.amount) - b.amount) < 0.01)
          ) {
            recurringId = b._id
            usedBill.add(key)
            break
          }
        }
      }
      return {
        index,
        occurredAt: r.occurredAt,
        merchant: r.merchant,
        raw: r.raw,
        amount: r.amount,
        currency: r.currency,
        pending: r.pending,
        kind,
        category,
        categorySource:
          kind !== 'spend'
            ? null
            : rule
              ? ('rule' as const)
              : r.category
                ? ('reader' as const)
                : null,
        otherAccountId: move
          ? (matchAccount(
              r.counterparty ?? r.merchant,
              others,
              here ?? undefined,
            ) as Id<'accounts'> | null)
          : null,
        counterparty: r.counterparty ?? null,
        duplicateOf: dups[index] === null ? null : existing[dups[index]]._id,
        recurringId,
      }
    })

    /* Things that come round — in this file together with what he has. */
    const history = here
      ? await ctx.db
          .query('logs')
          .withIndex('by_owner_account_time', (q) =>
            q
              .eq('ownerId', ownerId)
              .eq('accountId', here)
              .gte('occurredAt', from - 70 * 86_400_000),
          )
          .take(HISTORY_ROWS)
      : []
    const pool = [
      ...read.filter((r) => !r.self && !r.pending),
      ...history
        .filter((l) => l.kind === 'expense')
        .map((l) => ({
          occurredAt: l.occurredAt,
          amount: -(l.value ?? 0),
          merchant: l.meta?.merchant ?? l.text ?? '',
        })),
    ]
    const seen = new Set<string>()
    const unique = pool.filter((r) => {
      const k = `${merchantKey(r.merchant)}:${r.amount}:${new Date(r.occurredAt).toDateString()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const recurring = findRecurring(unique).map((r) => ({
      merchant: r.merchant,
      amount: r.amount,
      day: r.day,
      months: r.months,
      alreadyABill: liveBills.some(
        (b) =>
          merchantKey(b.name) === r.key ||
          Math.abs(b.amount - Math.abs(r.amount)) < 0.01,
      ),
    }))

    return { accountId, guessedAccountId: guessed, rows, recurring }
  },
})

/**
 * A transfer already in another of his accounts that this row is the other
 * side of: a move of `amount` (signed as that account sees it) within two
 * days, with no side paired to it yet.
 */
async function openSide(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  amount: number,
  occurredAt: number,
): Promise<Doc<'logs'> | null> {
  const near = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', accountId)
        .gte('occurredAt', occurredAt - 2 * DAY_MS - 3_600_000)
        .lte('occurredAt', occurredAt + 2 * DAY_MS + 3_600_000),
    )
    .take(200)
  for (const l of near) {
    if (l.kind !== 'move' || Math.abs((l.value ?? 0) - amount) > 0.005) continue
    if (l.meta?.pairOf !== undefined) continue
    if ((await transferPair(ctx, ownerId, l)) !== null) continue
    return l
  }
  return null
}

/**
 * He checked the list. Each kept row becomes one log in the account: a
 * spend (expense), money in (income), or a move to or from another of his
 * accounts (never counted as either). Pending and duplicate rows are not
 * sent. A merchant's category is remembered for next time. The closing
 * balance, if he kept it, becomes the account's balance.
 */
export const confirmTransactions = mutation({
  args: {
    intakeId: v.id('intakes'),
    accountId: v.id('accounts'),
    dayStart: v.number(),
    rows: v.array(
      v.object({
        index: v.number(),
        kind: v.union(
          v.literal('spend'),
          v.literal('income'),
          v.literal('move'),
        ),
        category: v.optional(v.string()),
        otherAccountId: v.optional(v.id('accounts')),
        recurringId: v.optional(v.id('recurring')),
      }),
    ),
    keepBalance: v.boolean(),
  },
  returns: v.object({ written: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    if (intake.status !== 'ready' || intake.kind !== 'transactions') {
      throw new ConvexError('That is not ready to confirm.')
    }
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    const read = intake.transactions ?? []
    const seen = new Set<number>()
    let written = 0
    for (const row of args.rows) {
      const r = read[row.index] as (typeof read)[number] | undefined
      if (r === undefined || seen.has(row.index)) continue
      seen.add(row.index)
      if (r.pending) continue
      if (row.otherAccountId)
        await ownedAccount(ctx, ownerId, row.otherAccountId)
      if (row.recurringId) {
        const bill = await ctx.db.get(row.recurringId)
        if (bill === null || bill.ownerId !== ownerId)
          throw new Error('No such bill')
      }
      const category = row.category?.trim().toLowerCase() || undefined
      if (category && category.length > 24)
        throw new ConvexError('That category is too long.')
      const base = {
        ownerId,
        area: 'money',
        occurredAt: r.occurredAt,
        unit: r.currency.toLowerCase(),
        text: r.merchant,
        accountId: account._id,
      }
      if (row.kind === 'move') {
        const other = row.otherAccountId
          ? await ownedAccount(ctx, ownerId, row.otherAccountId)
          : null
        /* Both sides, unless the other account already has this transfer
           (its own statement came first) — then only this side, paired to
           it. An account that does not hold the currency gets no side. */
        const waiting =
          other === null || other._id === account._id
            ? null
            : await openSide(ctx, ownerId, other._id, -r.amount, r.occurredAt)
        if (
          other !== null &&
          other._id !== account._id &&
          waiting === null &&
          other.currencies.includes(r.currency)
        ) {
          await writeTransfer(ctx, ownerId, {
            from: r.amount < 0 ? account : other,
            to: r.amount < 0 ? other : account,
            amount: Math.abs(r.amount),
            currency: r.currency,
            occurredAt: r.occurredAt,
            text: r.merchant,
            raw: r.raw,
            intakeId: intake._id,
          })
        } else {
          /* Signed: out of this account is negative. */
          await ctx.db.insert('logs', {
            ...base,
            kind: 'move',
            value: r.amount,
            meta: {
              merchant: r.merchant,
              raw: r.raw,
              intakeId: intake._id,
              otherAccountId: row.otherAccountId,
              pairOf: waiting?._id,
            },
          })
        }
      } else {
        await ctx.db.insert('logs', {
          ...base,
          kind: row.kind === 'income' ? 'income' : 'expense',
          value: Math.abs(r.amount),
          meta: {
            merchant: r.merchant,
            raw: r.raw,
            intakeId: intake._id,
            category,
            recurringId: row.recurringId,
          },
        })
        if (row.kind === 'spend' && category) {
          const key = merchantKey(r.merchant)
          const rule = await ctx.db
            .query('merchantRules')
            .withIndex('by_owner_key', (q) =>
              q.eq('ownerId', ownerId).eq('key', key),
            )
            .first()
          if (rule === null) {
            await ctx.db.insert('merchantRules', {
              ownerId,
              key,
              category,
              updatedAt: Date.now(),
            })
          } else if (rule.category !== category) {
            await ctx.db.patch(rule._id, { category, updatedAt: Date.now() })
          }
        }
      }
      written++
    }
    if (args.keepBalance && intake.balance) {
      /* A statement's balance is true at the end of its closing day. */
      await writeBalance(
        ctx,
        ownerId,
        account,
        intake.balance.currency,
        intake.balance.value,
        args.dayStart,
        intake.balance.asOf + 12 * 3_600_000 - 1,
      )
    }
    for (const id of intake.storageIds) await ctx.storage.delete(id)
    await ctx.db.patch(intake._id, {
      status: 'done',
      storageIds: [],
      accountId: account._id,
    })
    return { written }
  },
})

/**
 * A broker screen he checked. The first one an account gets is what it
 * held when the app first saw it (`opening`): it replaces the account's
 * trades up to now, and none of it touches the cash — that money left long
 * ago. Every later one is a list of changes he ticked (src/lib/intake.ts,
 * diffHoldings): each a buy or a sell that moves the broker's cash like a
 * typed one. The free cash, if he kept it, becomes the balance — read
 * after the trades, so it already has them in it.
 */
export const confirmHoldings = mutation({
  args: {
    intakeId: v.id('intakes'),
    accountId: v.id('accounts'),
    mode: v.union(v.literal('opening'), v.literal('changes')),
    occurredAt: v.number(),
    dayStart: v.number(),
    rows: v.array(
      v.object({
        candidate,
        isin: v.optional(v.string()),
        side: v.union(v.literal('buy'), v.literal('sell')),
        shares: v.number(),
        priceEur: v.number(),
      }),
    ),
    cashEur: v.optional(v.number()),
  },
  returns: v.object({ positions: v.number(), replaced: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    if (intake.status !== 'ready' || intake.kind !== 'holdings') {
      throw new ConvexError('That is not ready to confirm.')
    }
    const account = await ownedAccount(ctx, ownerId, args.accountId)
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
    let replaced = 0
    if (args.mode === 'opening') {
      if (args.rows.some((r) => r.side === 'sell')) {
        throw new ConvexError('What an account holds has nothing to sell.')
      }
      const before = await ctx.db
        .query('trades')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', account._id),
        )
        .take(MAX_TRADES)
      for (const t of before) {
        if (t.occurredAt <= args.occurredAt) {
          await ctx.db.delete(t._id)
          replaced++
        }
      }
    }
    for (const row of args.rows) {
      const instrumentId = await upsertInstrument(
        ctx,
        ownerId,
        row.candidate,
        row.isin,
      )
      if (row.side === 'sell') {
        const held = await heldShares(ctx, ownerId, account._id, instrumentId)
        if (row.shares > held + 1e-6) {
          throw new ConvexError(
            `${account.name} holds only ${Math.round(held * 1e6) / 1e6} ${row.candidate.symbol}.`,
          )
        }
      }
      await ctx.db.insert('trades', {
        ownerId,
        accountId: account._id,
        instrumentId,
        side: row.side,
        shares: row.shares,
        priceEur: Math.round(row.priceEur * 10000) / 10000,
        occurredAt: args.occurredAt,
        importId: intake._id,
        opening: args.mode === 'opening' ? true : undefined,
      })
    }
    if (args.cashEur !== undefined) {
      if (!account.currencies.includes('EUR')) {
        throw new ConvexError(`${account.name} does not hold euros.`)
      }
      await writeBalance(
        ctx,
        ownerId,
        account,
        'EUR',
        args.cashEur,
        args.dayStart,
      )
    }
    for (const id of intake.storageIds) await ctx.storage.delete(id)
    await ctx.db.patch(intake._id, {
      status: 'done',
      storageIds: [],
      accountId: account._id,
    })
    return { positions: args.rows.length, replaced }
  },
})

/** Throw it away, files and all. */
export const discard = mutation({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    for (const id of intake.storageIds) await ctx.storage.delete(id)
    await ctx.db.delete(intake._id)
    return null
  },
})

/* ---- For the reader (ai/intake.ts) ------------------------------------ */

export const forReading = internalQuery({
  args: { intakeId: v.id('intakes') },
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    const files = []
    for (const storageId of intake.storageIds) {
      const meta = await ctx.db.system.get(storageId)
      if (meta !== null)
        files.push({ storageId, contentType: meta.contentType ?? '' })
    }
    const accounts = (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', intake.ownerId))
        .take(50)
    )
      .filter((a) => a.retiredAt === undefined)
      .map((a) => a.name)
    return { files, accounts }
  },
})

const txValidator = schema.tables.intakes.validator.fields.transactions
const posValidator = schema.tables.intakes.validator.fields.positions
const balanceValidator = schema.tables.intakes.validator.fields.balance

export const finish = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    kind: v.union(v.literal('transactions'), v.literal('holdings')),
    title: v.string(),
    institution: v.optional(v.string()),
    transactions: txValidator,
    positions: posValidator,
    balance: balanceValidator,
    cashEur: v.optional(v.number()),
    totalEur: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    const { intakeId: _id, ...rest } = args
    await ctx.db.patch(args.intakeId, {
      ...rest,
      status: 'ready',
      model: INTAKE_MODEL_NAME,
      readAt: Date.now(),
    })
    return null
  },
})

export const fail = internalMutation({
  args: { intakeId: v.id('intakes'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    await ctx.db.patch(args.intakeId, { status: 'failed', error: args.error })
    return null
  },
})

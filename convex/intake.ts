import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount, writeBalance } from './accounts'
import { checkTrade, upsertInstrument } from './invest'
import { transferPair } from './logs'
import { euroRate, writeTransfer } from './money'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { Candidate } from '../src/lib/market'
import schema from './schema'
import {
  INTAKE_MODEL_NAME,
  INTAKE_WINDOW_MS,
  INTAKES_PER_WINDOW,
  MAX_INTAKE_BYTES,
  MAX_INTAKE_FILES,
  READING_DEAD_MS,
  findDuplicates,
  findRecurring,
  hasTradeRows,
  matchAccount,
  merchantKey,
  ownMoney,
  readableFile,
  sameCompany,
} from '../src/lib/intake'
import { dueDay } from '../src/lib/bills'
import { productIn, tailsIn } from '../src/lib/institutions'

/* The intake (Treasury, 27 Sep): what he drops on + becomes a list he
   checks. `start` stores the files and asks the reader (ai/intake.ts);
   `review` is the smart part — it lays the rows against what he already
   has: duplicates, moves between his own accounts, merchants he taught,
   bills that match, things that come round; `confirmTransactions` and
   `confirmHoldings` write only what he kept. Nothing is a log, a trade or
   a balance before that. */

const MAX_TRADES = 2000
/* How far back lastRead looks for one that reached done. */
const LAST_READ_LOOK = 20
const HISTORY_ROWS = 3000
const DAY_MS = 86_400_000

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

/* Whose money is his: the name the statement printed, and the name he
   signed in with. A transfer from either is a move, never income. */
async function hisNames(
  ctx: Pick<MutationCtx, 'auth'>,
  intake: Doc<'intakes'>,
): Promise<Array<string>> {
  const identity = await ctx.auth.getUserIdentity()
  return [intake.holderName, identity?.name].filter(
    (n): n is string => typeof n === 'string' && n.trim() !== '',
  )
}

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
    /** What he says it is — optional, offered for screenshots. */
    hint: v.optional(v.string()),
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
    const files = args.files.map((f) => ({
      name: f.name.slice(0, 160),
      size: f.size,
      contentType: f.contentType,
    }))
    const fingerprint = await fingerprintOf(
      ctx,
      args.files.map((f) => f.storageId),
    )
    const hint = args.hint?.trim().slice(0, MAX_HINT) || undefined
    const base = {
      ownerId,
      accountId: args.accountId,
      hint,
      storageIds: args.files.map((f) => f.storageId),
      files,
      fingerprint,
    }

    /* The same file again: the first reading, at no cost (27 Sep — every
       test drop of his statement was paying for a second read). */
    /* Unless he said what it is: a hint is a request to read it again. */
    const before =
      fingerprint && !hint
        ? (
            await ctx.db
              .query('intakes')
              .withIndex('by_owner_fingerprint', (q) =>
                q.eq('ownerId', ownerId).eq('fingerprint', fingerprint),
              )
              .order('desc')
              .take(10)
          ).find(
            (i) =>
              (i.status === 'ready' || i.status === 'done') &&
              i.kind !== undefined &&
              /* Read before a statement's orders were split out as
                 trades (27 Sep): read it again, once. */
              !hasTradeRows(i.transactions ?? []),
          )
        : undefined
    if (before) {
      const intakeId = await ctx.db.insert('intakes', {
        ...base,
        accountId: args.accountId ?? before.accountId,
        status: 'ready',
        kind: before.kind,
        title: before.title,
        institution: before.institution,
        accountTail: before.accountTail,
        holderName: before.holderName,
        transactions: before.transactions,
        positions: before.positions,
        trades: before.trades,
        balance: before.balance,
        cashEur: before.cashEur,
        totalEur: before.totalEur,
        model: before.model,
        readAt: now,
        reusedFrom: before._id,
        costUsd: 0,
        note: before.note,
        historyTrades: before.historyTrades,
        historyTickers: before.historyTickers,
      })
      if (before.historyTrades !== undefined) {
        const rows = await ctx.db
          .query('intakeTrades')
          .withIndex('by_intake', (q) => q.eq('intakeId', before._id))
          .take(HISTORY_TRADES)
        for (const { _id, _creationTime, ...r } of rows)
          await ctx.db.insert('intakeTrades', { ...r, intakeId })
      }
      return { ok: true as const, intakeId }
    }

    const intakeId = await ctx.db.insert('intakes', {
      ...base,
      status: 'reading',
      readingSince: now,
      progress: { stage: 'opening', rows: 0, have: 0, recent: [] },
    })
    await ctx.scheduler.runAfter(0, internal.ai.intake.read, { intakeId })
    return { ok: true as const, intakeId }
  },
})

const HISTORY_TRADES = 8000
/* A hint is a sentence, not a document. */
const MAX_HINT = 200

async function fingerprintOf(
  ctx: MutationCtx,
  storageIds: ReadonlyArray<Id<'_storage'>>,
): Promise<string | undefined> {
  const hashes = []
  for (const id of storageIds) {
    const meta = await ctx.db.system.get(id)
    if (!meta?.sha256) return undefined
    hashes.push(meta.sha256)
  }
  return hashes.sort().join('|')
}

/**
 * Once more: after a failure a second try could fix, or a reading that
 * stopped without answering. The files are still there until he throws
 * them away.
 */
export const retry = mutation({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    const dead =
      intake.status === 'reading' &&
      Date.now() - (intake.readingSince ?? intake._creationTime) >
        READING_DEAD_MS
    if (intake.status !== 'failed' && !dead) {
      throw new ConvexError('That one is not stuck.')
    }
    if (intake.storageIds.length === 0) {
      throw new ConvexError('Its files are gone — drop it again.')
    }
    await ctx.db.patch(intake._id, {
      status: 'reading',
      error: undefined,
      retryable: undefined,
      readingSince: Date.now(),
      progress: { stage: 'opening', rows: 0, have: 0, recent: [] },
    })
    await ctx.scheduler.runAfter(0, internal.ai.intake.read, {
      intakeId: intake._id,
    })
    return null
  },
})

/** The screenshot being read, to show while it is read. */
export const preview = query({
  args: { intakeId: v.id('intakes') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    const i = (intake.files ?? []).findIndex((f) =>
      f.contentType.startsWith('image/'),
    )
    const id = i >= 0 ? intake.storageIds[i] : undefined
    return id ? await ctx.storage.getUrl(id) : null
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

const suggestion = v.union(
  v.null(),
  v.object({
    product: v.string(),
    name: v.string(),
    accountTail: v.union(v.string(), v.null()),
  }),
)

/* His account a set of four-digit endings points at — IBAN or card. */
function byTail(
  accounts: ReadonlyArray<Doc<'accounts'>>,
  tails: ReadonlyArray<string>,
): Id<'accounts'> | null {
  for (const t of tails) {
    const a = accounts.find(
      (x) => x.ibanTails?.includes(t) || x.cardTails?.includes(t),
    )
    if (a) return a._id
  }
  return null
}

/**
 * Which of his accounts a file is about: by the IBAN or card ending it
 * prints, then by the bank's name — the most specific product first, so a
 * Revolut Invest screen is Revolut Invest, not Revolut.
 */
function guessAccount(
  intake: Doc<'intakes'>,
  accounts: ReadonlyArray<Doc<'accounts'>>,
): Id<'accounts'> | null {
  if (intake.accountTail) {
    const hit = byTail(accounts, [intake.accountTail])
    if (hit) return hit
  }
  const product = productIn(intake.institution)
  if (product) {
    /* Holdings and trades are a broker's, whatever the bank is called. */
    const want = intake.kind === 'transactions' ? 'bank' : 'broker'
    const same = accounts.filter((a) => a.institution === product.institution)
    const fit = same.find((a) => a.kinds.includes(want)) ?? same.at(0)
    if (fit) return fit._id
  }
  if (!intake.institution) return null
  return matchAccount(
    intake.institution,
    accounts.map((a) => ({ id: a._id, name: a.name, domain: a.domain })),
  ) as Id<'accounts'> | null
}

/* A bank the app knows and he has not added: "Create Revolut?" */
function suggestFor(intake: Doc<'intakes'>) {
  const p = productIn(intake.institution)
  if (!p) return null
  return {
    product: p.id,
    name: p.name,
    accountTail: intake.accountTail ?? null,
  }
}

/** For a holdings or trades read: which account, and what to add if none. */
export const whose = query({
  args: { intakeId: v.id('intakes') },
  returns: v.object({
    guessedAccountId: v.union(v.id('accounts'), v.null()),
    suggest: suggestion,
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    const accounts = (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(50)
    ).filter((a) => a.retiredAt === undefined)
    const guessed = intake.accountId ?? guessAccount(intake, accounts)
    return {
      guessedAccountId: guessed,
      suggest: guessed === null ? suggestFor(intake) : null,
    }
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
      /** None of his accounts, but a bank the app knows: offer to add it. */
      suggest: suggestion,
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
    const guessed = intake.accountId ?? guessAccount(intake, accounts)
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
    const names = await hisNames(ctx, intake)
    const own = read.map((r) => r.self || ownMoney(r, names))
    const taken = new Set(dups.filter((d): d is number => d !== null))
    for (const [i, r] of read.entries()) {
      if (dups[i] !== null || !own[i]) continue
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
      const move = own[index]
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
          ? (byTail(
              accounts.filter((a) => a._id !== here),
              tailsIn(`${r.counterparty ?? ''} ${r.raw}`),
            ) ??
            (matchAccount(
              r.counterparty ?? r.merchant,
              others,
              here ?? undefined,
            ) as Id<'accounts'> | null))
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

    return {
      accountId,
      guessedAccountId: guessed,
      suggest: here === null ? suggestFor(intake) : null,
      rows,
      recurring,
    }
  },
})

/* Endings not yet known anywhere are kept on the account (four at most):
   the next file that prints one is matched without asking. */
async function learnTails(
  ctx: MutationCtx,
  account: Doc<'accounts'>,
  tails: ReadonlyArray<string>,
) {
  const fresh = await ctx.db.get(account._id)
  if (fresh === null) return
  const known = [...(fresh.ibanTails ?? []), ...(fresh.cardTails ?? [])]
  const add = tails.filter((t) => !known.includes(t))
  if (add.length === 0) return
  await ctx.db.patch(account._id, {
    ibanTails: [...(fresh.ibanTails ?? []), ...add].slice(-4),
  })
}

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
  returns: v.object({
    written: v.number(),
    trades: v.object({
      written: v.number(),
      skipped: v.number(),
      noTicker: v.number(),
    }),
  }),
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
        /* Answer once: the ending printed for the other side is his
           account's now, so the next statement lands it by itself. */
        if (other !== null && other._id !== account._id) {
          await learnTails(
            ctx,
            other,
            tailsIn(`${r.counterparty ?? ''} ${r.raw}`),
          )
        }
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
    /* The orders a broker's cash statement printed (splitStatement):
       into its ledger, on the ticker the reader matched. One with no
       ticker found is left out and said. */
    let trades = { written: 0, skipped: 0, noTicker: 0 }
    const orders = intake.trades ?? []
    if (orders.length > 0) {
      if (!account.kinds.includes('broker')) {
        throw new ConvexError(
          `${account.name} is not a broker — these shares were bought in one.`,
        )
      }
      const items = orders.flatMap((t, index) => {
        const c = t.candidates.at(
          t.preferred !== undefined && t.preferred >= 0 ? t.preferred : 0,
        )
        return c ? [{ index, trade: t, candidate: c }] : []
      })
      trades = {
        ...(await writeTrades(ctx, ownerId, account, intake._id, items)),
        noTicker: orders.length - items.length,
      }
    }
    if (args.keepBalance && intake.balance) {
      /* A statement's balance is true at the end of its closing day. Its
         day is noon UTC; 18:00 UTC is still that day from Lisbon to New
         York (27 Sep: +12h put Aug 31 into Sep 1 in Lisbon). */
      await writeBalance(
        ctx,
        ownerId,
        account,
        intake.balance.currency,
        intake.balance.value,
        args.dayStart,
        intake.balance.asOf + 6 * 3_600_000,
        sourceOf(intake),
      )
    }
    if (intake.accountTail) await learnTails(ctx, account, [intake.accountTail])
    for (const id of intake.storageIds) await ctx.storage.delete(id)
    await ctx.db.patch(intake._id, {
      status: 'done',
      storageIds: [],
      accountId: account._id,
    })
    return { written, trades }
  },
})

/**
 * A broker screen he checked (a screenshot or a net-worth PDF): what it
 * showed is stored as it was seen — shares per ticker on the day, and what
 * was paid where the screen printed a % since buy (R6c, 27 Sep). Nothing
 * is typed and nothing becomes a buy: a statement dropped before or after
 * explains these shares instead of adding to them (src/lib/holdings.ts).
 * A second look at a ticker the same day replaces the first. The free
 * cash, if he kept it, becomes the balance.
 */
export const confirmHoldings = mutation({
  args: {
    intakeId: v.id('intakes'),
    accountId: v.id('accounts'),
    asOf: v.number(),
    dayStart: v.number(),
    rows: v.array(
      v.object({
        candidate,
        isin: v.optional(v.string()),
        shares: v.number(),
        paidEur: v.optional(v.number()),
        sharesCalculated: v.optional(v.boolean()),
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
    if (!account.kinds.includes('broker')) {
      throw new ConvexError(`${account.name} is not a broker.`)
    }
    if (args.rows.length === 0 && args.cashEur === undefined) {
      throw new ConvexError('Keep at least one row, or the cash.')
    }
    if (args.asOf > Date.now() + 5 * 60_000) {
      throw new ConvexError('A screen shows what already is.')
    }
    for (const row of args.rows) {
      if (!Number.isFinite(row.shares) || row.shares <= 0 || row.shares > 1e9)
        throw new ConvexError('That is not a number of shares.')
      if (
        row.paidEur !== undefined &&
        (!Number.isFinite(row.paidEur) || row.paidEur <= 0 || row.paidEur > 1e9)
      )
        throw new ConvexError('That is not what was paid.')
    }
    const symbols = args.rows.map((r) => r.candidate.symbol)
    if (new Set(symbols).size !== symbols.length) {
      throw new ConvexError('Two rows are the same ticker — keep one.')
    }
    let replaced = 0
    for (const row of args.rows) {
      const instrumentId = await upsertInstrument(
        ctx,
        ownerId,
        row.candidate,
        row.isin,
      )
      const before = await ctx.db
        .query('holdings')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
      for (const h of before) {
        if (
          h.accountId === account._id &&
          Math.abs(h.asOf - args.asOf) < SAME_LOOK_MS
        ) {
          await ctx.db.delete(h._id)
          replaced++
        }
      }
      await ctx.db.insert('holdings', {
        ownerId,
        accountId: account._id,
        instrumentId,
        shares: Math.round(row.shares * 1e6) / 1e6,
        paidEur:
          row.paidEur === undefined
            ? undefined
            : Math.round(row.paidEur * 100) / 100,
        sharesCalculated: row.sharesCalculated ? true : undefined,
        asOf: args.asOf,
        importId: intake._id,
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
        undefined,
        sourceOf(intake),
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

/* Two looks at one ticker within this are the same look. */
const SAME_LOOK_MS = 20 * 3_600_000

/**
 * Buys and sells into the broker's ledger, oldest first, each with its own
 * date and price in euros at the stored rate — a trade history's, or the
 * orders a broker's cash statement printed as rows. One already stored
 * from another file is skipped, so overlapping statements add nothing.
 */
async function writeTrades(
  ctx: MutationCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  intakeId: Id<'intakes'>,
  items: Array<{
    index: number
    trade: {
      occurredAt: number
      name: string
      isin?: string
      side: 'buy' | 'sell'
      shares: number
      price: number
      currency: string
    }
    candidate: Candidate
  }>,
): Promise<{ written: number; skipped: number }> {
  const rows = [...items].sort(
    (a, b) => a.trade.occurredAt - b.trade.occurredAt,
  )
  /* What the account already holds — a screenshot's tickers — so a
     statement's "ALPHABET INC.CL.A DL-,001" lands on the same GOOGL, not
     on whatever a search returned (sameCompany). */
  const heldIds = new Set<Id<'instruments'>>()
  for (const h of await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .take(MAX_TRADES))
    heldIds.add(h.instrumentId)
  for (const x of await ctx.db
    .query('trades')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .take(MAX_TRADES))
    heldIds.add(x.instrumentId)
  const held: Array<Doc<'instruments'>> = []
  for (const id of heldIds) {
    const doc = await ctx.db.get(id)
    if (doc !== null && doc.ownerId === ownerId) held.push(doc)
  }
  let written = 0
  let skipped = 0
  const seen = new Set<number>()
  const claimed = new Set<Id<'trades'>>()
  for (const { index, trade: t, candidate: c } of rows) {
    if (seen.has(index)) continue
    seen.add(index)
    const priceEur = t.price * (await euroRate(ctx, ownerId, t.currency))
    checkTrade(t.shares, priceEur)
    const same = sameCompany({ name: t.name, isin: t.isin }, held)
    const instrumentId =
      same >= 0
        ? held[same]._id
        : await upsertInstrument(ctx, ownerId, c, t.isin)
    const near = await ctx.db
      .query('trades')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(MAX_TRADES)
    /* Already stored from another file: same side and shares, about the
       same price (5%: a dollar trade read again months later meets a
       newer rate), within two days. Each stored trade answers for one
       row only, and never for a row of this same file — two equal buys
       two days apart are two buys. */
    const twin = near.find(
      (x) =>
        !claimed.has(x._id) &&
        x.importId !== intakeId &&
        x.accountId === account._id &&
        x.side === t.side &&
        Math.abs(x.shares - t.shares) < 1e-6 &&
        Math.abs(x.priceEur - priceEur) <= priceEur * 0.05 + 0.01 &&
        Math.abs(x.occurredAt - t.occurredAt) <= 2 * DAY_MS + 3_600_000,
    )
    if (twin) {
      claimed.add(twin._id)
      skipped++
      continue
    }
    /* A statement's sell is the broker's word: it is never refused for
       shares an earlier statement, not dropped yet, would have bought. */
    await ctx.db.insert('trades', {
      ownerId,
      accountId: account._id,
      instrumentId,
      side: t.side,
      shares: t.shares,
      priceEur: Math.round(priceEur * 10000) / 10000,
      occurredAt: t.occurredAt,
      importId: intakeId,
    })
    written++
  }
  return { written, skipped }
}

/**
 * A broker's trade history he checked: each kept buy or sell is written
 * with its own date and price (in euros at the stored rate), and moves the
 * broker's cash like a typed one. A trade already there — same ticker,
 * side and shares within two days — is skipped, so an overlapping export
 * dropped twice adds nothing.
 */
export const confirmTrades = mutation({
  args: {
    intakeId: v.id('intakes'),
    accountId: v.id('accounts'),
    rows: v.array(v.object({ index: v.number(), candidate })),
  },
  returns: v.object({ written: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    if (intake.status !== 'ready' || intake.kind !== 'trades') {
      throw new ConvexError('That is not ready to confirm.')
    }
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    if (!account.kinds.includes('broker')) {
      throw new ConvexError(`${account.name} is not a broker.`)
    }
    const read = intake.trades ?? []
    const { written, skipped } = await writeTrades(
      ctx,
      ownerId,
      account,
      intake._id,
      args.rows.flatMap((row) => {
        const t = read[row.index] as (typeof read)[number] | undefined
        return t
          ? [{ index: row.index, trade: t, candidate: row.candidate }]
          : []
      }),
    )
    if (intake.accountTail) await learnTails(ctx, account, [intake.accountTail])
    for (const id of intake.storageIds) await ctx.storage.delete(id)
    await ctx.db.patch(intake._id, {
      status: 'done',
      storageIds: [],
      accountId: account._id,
    })
    return { written, skipped }
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
    await dropHistory(ctx, intake._id)
    await ctx.db.delete(intake._id)
    return null
  },
})

/* A balance read off a picture is a screenshot's; off a PDF or CSV, a
   statement's. */
function sourceOf(intake: Doc<'intakes'>): 'statement' | 'screenshot' {
  return (intake.files ?? []).some((f) => f.contentType.startsWith('image/'))
    ? 'screenshot'
    : 'statement'
}

async function dropHistory(ctx: MutationCtx, intakeId: Id<'intakes'>) {
  const rows = await ctx.db
    .query('intakeTrades')
    .withIndex('by_intake', (q) => q.eq('intakeId', intakeId))
    .take(HISTORY_TRADES)
  for (const r of rows) await ctx.db.delete(r._id)
}

/** A long history's trades, oldest first — for its review. */
/**
 * The last file he had read to the end, for the + sheet (27 Sep): "did I
 * already drop this month's?" Newest of his recent reads that reached
 * done; a failed or unconfirmed one is not "read".
 */
export const lastRead = query({
  args: {},
  returns: v.union(
    v.object({
      name: v.string(),
      institution: v.union(v.string(), v.null()),
      readAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const recent = await ctx.db
      .query('intakes')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(LAST_READ_LOOK)
    const done = recent.find((i) => i.status === 'done')
    if (!done) return null
    return {
      name: done.files?.[0]?.name ?? done.title ?? 'a file',
      institution: done.institution ?? null,
      readAt: done.readAt ?? done._creationTime,
    }
  },
})

export const history = query({
  args: { intakeId: v.id('intakes') },
  returns: v.array(schema.doc('intakeTrades')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedIntake(ctx, ownerId, args.intakeId)
    return await ctx.db
      .query('intakeTrades')
      .withIndex('by_intake', (q) => q.eq('intakeId', args.intakeId))
      .take(HISTORY_TRADES)
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
      .map((a) => ({ name: a.name, domain: a.domain }))
    return {
      ownerId: intake.ownerId,
      files,
      names: (intake.files ?? []).map((f) => f.name),
      accounts,
      hint: intake.hint ?? null,
    }
  },
})

const readRow = v.object({
  occurredAt: v.number(),
  merchant: v.string(),
  amount: v.number(),
  currency: v.string(),
  self: v.boolean(),
})

/**
 * What the reader has found so far, as it streams (27 Sep: "Reading
 * what?"). Rows arrive in batches; each is laid against the account's
 * history, so "29 already here · 12 new" is counted as they come. The
 * review counts again when the reading is done — this is the view, not the
 * decision.
 */
export const progress = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    stage: v.optional(
      v.union(
        v.literal('opening'),
        v.literal('columns'),
        v.literal('rows'),
        v.literal('tickers'),
      ),
    ),
    kind: v.optional(
      v.union(
        v.literal('transactions'),
        v.literal('holdings'),
        v.literal('trades'),
      ),
    ),
    institution: v.optional(v.string()),
    title: v.optional(v.string()),
    accountTail: v.optional(v.string()),
    balance: v.optional(
      v.object({ value: v.number(), currency: v.string(), asOf: v.number() }),
    ),
    rows: v.optional(v.array(readRow)),
    /* Trades or positions: counted and shown, never "already here". */
    items: v.optional(
      v.array(
        v.object({
          occurredAt: v.number(),
          label: v.string(),
          amount: v.number(),
          currency: v.string(),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    const p = intake.progress ?? {
      stage: 'opening',
      rows: 0,
      have: 0,
      recent: [],
    }
    const next = {
      ...p,
      stage: args.stage ?? p.stage,
      kind: args.kind ?? p.kind,
      institution: args.institution ?? p.institution,
      title: args.title ?? p.title,
      accountTail: args.accountTail ?? p.accountTail,
      balance: args.balance ?? p.balance,
    }
    const fresh: typeof p.recent = []
    const rows = args.rows ?? []
    if (rows.length > 0) {
      const accounts = (
        await ctx.db
          .query('accounts')
          .withIndex('by_owner_order', (q) => q.eq('ownerId', intake.ownerId))
          .take(50)
      ).filter((a) => a.retiredAt === undefined)
      const here =
        intake.accountId ??
        guessAccount(
          {
            ...intake,
            kind: 'transactions',
            institution: next.institution,
            accountTail: next.accountTail,
          },
          accounts,
        )
      let dups: Array<number | null> = rows.map(() => null)
      if (here) {
        const times = rows.map((r) => r.occurredAt)
        const existing = await ctx.db
          .query('logs')
          .withIndex('by_owner_account_time', (q) =>
            q
              .eq('ownerId', intake.ownerId)
              .eq('accountId', here)
              .gte('occurredAt', Math.min(...times) - 3 * DAY_MS)
              .lte('occurredAt', Math.max(...times) + 3 * DAY_MS),
          )
          .take(HISTORY_ROWS)
        dups = findDuplicates(
          rows,
          existing.map((l) => ({
            occurredAt: l.occurredAt,
            amount: l.kind === 'expense' ? -(l.value ?? 0) : (l.value ?? 0),
            merchant: l.meta?.merchant ?? l.text ?? '',
          })),
        )
      }
      for (const [i, r] of rows.entries()) {
        fresh.push({
          occurredAt: r.occurredAt,
          label: r.merchant.slice(0, 60),
          amount: r.amount,
          currency: r.currency,
          have: dups[i] !== null,
          move: r.self || ownMoney(r, []),
        })
      }
    }
    for (const it of args.items ?? [])
      fresh.push({
        ...it,
        label: it.label.slice(0, 60),
        have: false,
        move: false,
      })
    next.rows = p.rows + fresh.length
    next.have = p.have + fresh.filter((r) => r.have).length
    next.recent = [...p.recent, ...fresh].slice(-5)
    await ctx.db.patch(intake._id, { progress: next })
    return null
  },
})

export const layoutFor = internalQuery({
  args: { ownerId: v.string(), headerKey: v.string() },
  returns: v.union(schema.tables.csvLayouts.validator.fields.layout, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('csvLayouts')
      .withIndex('by_owner_header', (q) =>
        q.eq('ownerId', args.ownerId).eq('headerKey', args.headerKey),
      )
      .unique()
    return row?.layout ?? null
  },
})

export const rememberLayout = internalMutation({
  args: {
    ownerId: v.string(),
    headerKey: v.string(),
    layout: schema.tables.csvLayouts.validator.fields.layout,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('csvLayouts')
      .withIndex('by_owner_header', (q) =>
        q.eq('ownerId', args.ownerId).eq('headerKey', args.headerKey),
      )
      .unique()
    if (row)
      await ctx.db.patch(row._id, {
        layout: args.layout,
        updatedAt: Date.now(),
      })
    else await ctx.db.insert('csvLayouts', { ...args, updatedAt: Date.now() })
    return null
  },
})

/** A long history's rows, a batch at a time, while it is still reading. */
export const storeHistory = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    trades: v.array(
      v.object({
        occurredAt: v.number(),
        name: v.string(),
        isin: v.optional(v.string()),
        side: v.union(v.literal('buy'), v.literal('sell'), v.literal('split')),
        shares: v.number(),
        price: v.number(),
        currency: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    for (const t of args.trades)
      await ctx.db.insert('intakeTrades', {
        ...t,
        ownerId: intake.ownerId,
        intakeId: intake._id,
      })
    return null
  },
})

/** A retry starts clean: rows a failed reading stored go first. */
export const clearHistory = internalMutation({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await dropHistory(ctx, args.intakeId)
    return null
  },
})

const txValidator = schema.tables.intakes.validator.fields.transactions
const posValidator = schema.tables.intakes.validator.fields.positions
const tradesValidator = schema.tables.intakes.validator.fields.trades
const balanceValidator = schema.tables.intakes.validator.fields.balance

export const finish = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    kind: v.union(
      v.literal('transactions'),
      v.literal('holdings'),
      v.literal('trades'),
    ),
    title: v.string(),
    institution: v.optional(v.string()),
    accountTail: v.optional(v.string()),
    holderName: v.optional(v.string()),
    transactions: txValidator,
    positions: posValidator,
    trades: tradesValidator,
    balance: balanceValidator,
    cashEur: v.optional(v.number()),
    totalEur: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    note: v.optional(v.string()),
    historyTrades: v.optional(v.number()),
    historyTickers: v.optional(v.number()),
    /* Read in code from a remembered column map: no model this time. */
    model: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    const { intakeId: _id, ...rest } = args
    await ctx.db.patch(args.intakeId, {
      ...rest,
      status: 'ready',
      model: args.model ?? INTAKE_MODEL_NAME,
      readAt: Date.now(),
      /* A retry's reading costs what every try cost. */
      costUsd:
        args.costUsd === undefined
          ? intake.costUsd
          : (intake.costUsd ?? 0) + args.costUsd,
    })
    return null
  },
})

export const fail = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    error: v.string(),
    retryable: v.optional(v.boolean()),
    costUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake === null || intake.status !== 'reading') return null
    await dropHistory(ctx, intake._id)
    await ctx.db.patch(args.intakeId, {
      status: 'failed',
      error: args.error,
      retryable: args.retryable ?? false,
      costUsd:
        args.costUsd === undefined
          ? intake.costUsd
          : (intake.costUsd ?? 0) + args.costUsd,
    })
    return null
  },
})

/* A statement read before its orders were split out (27 Sep): the rows,
   for ai/intake.resplit to split in place — no second reading. */
export const unsplit = internalQuery({
  args: { intakeId: v.id('intakes') },
  returns: v.union(v.array(txValidator.element), v.null()),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (
      intake === null ||
      intake.status !== 'ready' ||
      intake.kind !== 'transactions' ||
      (intake.trades ?? []).length > 0 ||
      !hasTradeRows(intake.transactions ?? [])
    )
      return null
    return intake.transactions ?? null
  },
})

export const applySplit = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    transactions: txValidator,
    trades: tradesValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (
      intake === null ||
      intake.status !== 'ready' ||
      intake.kind !== 'transactions' ||
      (intake.trades ?? []).length > 0
    )
      return null
    await ctx.db.patch(args.intakeId, {
      transactions: args.transactions,
      trades: args.trades,
    })
    return null
  },
})

import { ConvexError, v } from 'convex/values'
import { requireUser } from './auth'
import { refuseGuest } from './profiles'
import { ownedAccount } from './accounts'
import { fileNotice } from './fileNotice'
import { fileTrade, fileTrades } from './fileTrades'
import { findFor } from './recurring'
import { notSaved } from './sharesCheck'
import { inStatement } from './holdingsKnown'
import { holdingsTotal } from '../src/lib/holdingsTotal'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, query } from './_generated/server'
import { aiMutation, mutation } from './write'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import {
  INTAKE_MODEL_NAME,
  INTAKE_WINDOW_MS,
  INTAKES_PER_WINDOW,
  MAX_INTAKE_BYTES,
  MAX_BATCH_FILES,
  MAX_INTAKE_FILES,
  READER_VERSION,
  READING_DEAD_MS,
  findDuplicates,
  hasTradeRows,
  ownMoney,
  readableFile,
} from '../src/lib/intake'
import { applyOrder } from '../src/lib/bulk'
import {
  writeClosing,
  writeHoldings,
  writeTrades,
  writeTransactions,
} from './files/write'
import type { ConfirmRow } from './files/write'
import {
  MISSING_TEXT,
  batchAccount,
  batchAsk,
  gatherBatch,
  isImage,
  mergedHoldings,
} from './files/batch'
import { buildReview, learnTails, reviewRow } from './files/review'
import {
  DAY_MS,
  HISTORY_ROWS,
  batchIntakes,
  guessAccount,
  headingFor,
  keepUntil,
  liveAccounts,
  suggestFor,
  suggestion,
} from './files/shared'

/* How far back lastRead looks for one that reached done. */
const LAST_READ_LOOK = 20

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
export const start = aiMutation({
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
    const intakeId = await beginIntake(ctx, ownerId, args)
    return { ok: true as const, intakeId }
  },
})

const fileArg = v.object({
  storageId: v.id('_storage'),
  contentType: v.string(),
  name: v.string(),
  size: v.number(),
})

/* A file the model reads — a PDF or a picture. A CSV is read in code from
   a remembered column map (one small read the first time a bank's export
   is seen), so it does not count against the month's reads. */
function paidRead(files: ReadonlyArray<{ contentType: string; name: string }>) {
  return files.some(
    (f) => readableFile(f.contentType, f.name)?.block !== 'text',
  )
}

/* Seconds between one file's reading and the next in a batch, so 27
   statements do not reach the reader in the same second. */
const BATCH_STAGGER_MS = 1500

/**
 * UPDATE ALL (3 Oct): every file its own intake, tied by one batch, read
 * one after another. Refused whole, files deleted, when one file cannot
 * be read or the drop would take more reads than the month has left —
 * the same rule as `start`, counting only files the model reads.
 */
export const startBatch = aiMutation({
  args: {
    files: v.array(fileArg),
    /* More files for an update still open — "drop March". */
    batchId: v.optional(v.id('batches')),
    /* Whose they are, when he dropped them on an account (10 Oct: ADD
       is the one door, and it could always be told this). */
    accountId: v.optional(v.id('accounts')),
    /* What he says a screenshot is. */
    hint: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), batchId: v.id('batches') }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (args.accountId) await ownedAccount(ctx, ownerId, args.accountId)
    const refuse = async (error: string) => {
      for (const f of args.files) await ctx.storage.delete(f.storageId)
      return { ok: false as const, error }
    }
    if (args.batchId) {
      const b = await ctx.db.get(args.batchId)
      if (b === null || b.ownerId !== ownerId || b.status !== 'open')
        return await refuse('That update is closed — start a new one.')
    }
    if (args.files.length === 0) return await refuse('Choose some files.')
    if (args.files.length > MAX_BATCH_FILES) {
      return await refuse(`At most ${MAX_BATCH_FILES} files in one update.`)
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
      .take(MAX_BATCH_FILES * 4)
    const used = recent.filter(
      (i) => i.reusedFrom === undefined && paidRead(i.files ?? []),
    ).length
    const wanted = args.files.filter((f) => paidRead([f])).length
    if (used + wanted > INTAKES_PER_WINDOW) {
      const left = Math.max(0, INTAKES_PER_WINDOW - used)
      return await refuse(
        `That's ${wanted} files to read and ${left} reads left this month (${INTAKES_PER_WINDOW} in 30 days).`,
      )
    }
    const batchId =
      args.batchId ??
      (await ctx.db.insert('batches', {
        ownerId,
        status: 'open',
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
      }))
    let paid = 0
    for (const f of args.files) {
      await beginIntake(ctx, ownerId, {
        files: [f],
        batchId,
        accountId: args.accountId,
        hint: args.hint,
        delayMs: paidRead([f]) ? paid++ * BATCH_STAGGER_MS : 0,
      })
    }
    return { ok: true as const, batchId }
  },
})

type IntakeFile = {
  storageId: Id<'_storage'>
  contentType: string
  name: string
  size: number
}

/* Stores what he dropped as one intake and asks the reader — or, for a
   file already read, reuses that reading at no cost. Shared by `start`
   (one drop, one intake) and `startBatch` (one intake per file). */
async function beginIntake(
  ctx: MutationCtx,
  ownerId: string,
  args: {
    accountId?: Id<'accounts'>
    hint?: string
    files: ReadonlyArray<IntakeFile>
    batchId?: Id<'batches'>
    /* A batch spaces its reads out. */
    delayMs?: number
  },
): Promise<Id<'intakes'>> {
  const now = Date.now()
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
    batchId: args.batchId,
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
            i.reader === READER_VERSION &&
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
      reader: before.reader,
      costUsd: 0,
      note: before.note,
      historyTrades: before.historyTrades,
      historyTickers: before.historyTickers,
      historyFound: before.historyFound,
    })
    if (before.historyTrades !== undefined) {
      const rows = await ctx.db
        .query('intakeTrades')
        .withIndex('by_intake', (q) => q.eq('intakeId', before._id))
        .take(HISTORY_TRADES)
      for (const { _id, _creationTime, ...r } of rows)
        await ctx.db.insert('intakeTrades', { ...r, intakeId })
      await joinUpdate(ctx, ownerId, intakeId)
    }
    return intakeId
  }

  /* R8 · S4: the statement reader is money AI, Artem's alone. */
  await refuseGuest(ctx, base.ownerId)
  const intakeId = await ctx.db.insert('intakes', {
    ...base,
    status: 'reading',
    readingSince: now,
    progress: { stage: 'opening', rows: 0, have: 0, recent: [] },
  })
  await ctx.scheduler.runAfter(args.delayMs ?? 0, internal.ai.intake.read, {
    intakeId,
  })
  return intakeId
}

const HISTORY_TRADES = 8000

/* The newest update he made by dropping files. One a bank's answer made
   (convex/bankRows.ts) is not his to add files to. */
async function latestUpdate(
  ctx: QueryCtx,
  ownerId: string,
): Promise<Doc<'batches'> | null> {
  const recent = await ctx.db
    .query('batches')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .take(12)
  return recent.find((b) => b.via === undefined) ?? null
}

/* A trading history has no screen of its own (9 Oct, "go use bulk"): one
   dropped on + joins the update that is open, or starts one, and opens on
   the update-all screen like every other file. */
async function joinUpdate(
  ctx: MutationCtx,
  ownerId: string,
  intakeId: Id<'intakes'>,
) {
  const intake = await ctx.db.get(intakeId)
  if (intake === null || intake.batchId !== undefined) return
  const latest = await latestUpdate(ctx, ownerId)
  const batchId =
    latest !== null && latest.status === 'open'
      ? latest._id
      : await ctx.db.insert('batches', {
          ownerId,
          status: 'open',
          leftOut: [],
          quietMonths: [],
          moves: [],
          extras: [],
          dismissed: [],
        })
  await ctx.db.patch(intakeId, { batchId })
}

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
export const retry = aiMutation({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    const dead =
      intake.status === 'reading' &&
      Date.now() - (intake.readingSince ?? intake._creationTime) >
        READING_DEAD_MS
    /* A trading history read before its tickers were found with it
       (9 Oct) is read again once, so it can go in. */
    const stale =
      intake.status === 'ready' &&
      intake.historyTrades !== undefined &&
      intake.historyFound === undefined
    if (intake.status !== 'failed' && !dead && !stale) {
      throw new ConvexError('That one is not stuck.')
    }
    if (intake.storageIds.length === 0) {
      throw new ConvexError('Its files are gone — drop it again.')
    }
    await refuseGuest(ctx, intake.ownerId)
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

const ERASE_PER_RUN = 100

/** The files a confirmed reading came from, while they are kept: each
    with a link to open it, or null once erased. */
export const originals = query({
  args: { intakeId: v.id('intakes') },
  returns: v.object({
    files: v.array(
      v.object({
        name: v.string(),
        contentType: v.string(),
        url: v.union(v.string(), v.null()),
      }),
    ),
    keptUntil: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    const files = []
    for (const [i, f] of (intake.files ?? []).entries()) {
      const id = intake.storageIds.at(i)
      files.push({
        name: f.name,
        contentType: f.contentType,
        url: id ? await ctx.storage.getUrl(id) : null,
      })
    }
    return { files, keptUntil: intake.keptUntil ?? null }
  },
})

/** Erases the files whose 90 days are over — what was read stays. Daily,
    for every owner, a page at a time. */
export const eraseOld = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    /* Every due date, however old — a missed night must not strand a
       file. An erased one keeps its date (its line says when it went)
       and is passed over; a long backlog carries on in a next run. */
    const now = Date.now()
    let erased = 0
    for await (const i of ctx.db
      .query('intakes')
      .withIndex('by_keptUntil', (q) =>
        q.gt('keptUntil', 0).lte('keptUntil', now),
      )) {
      if (i.storageIds.length === 0) continue
      for (const id of i.storageIds) await ctx.storage.delete(id)
      await ctx.db.patch(i._id, { storageIds: [] })
      if (++erased >= ERASE_PER_RUN) {
        await ctx.scheduler.runAfter(0, internal.intake.eraseOld, {})
        break
      }
    }
    return erased
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
      .take(20 + MAX_BATCH_FILES)
    /* A batch's files live on its own sheet (UPDATE ALL), not here. */
    return rows
      .filter((r) => r.status !== 'done' && r.batchId === undefined)
      .slice(0, 20)
  },
})

/**
 * Read it again — a file read wrong (3 Oct: "1 100.00" read as 100), or a
 * screenshot now that he said whose it is. Costs one more read; refused
 * once its files are gone.
 */
export const readAgain = aiMutation({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    if (intake.status === 'done' || intake.status === 'reading')
      throw new ConvexError('That one is not waiting to be checked.')
    if (intake.storageIds.length === 0)
      throw new ConvexError('Its files are gone — drop it again.')
    const account = intake.accountId ? await ctx.db.get(intake.accountId) : null
    await refuseGuest(ctx, intake.ownerId)
    await ctx.db.patch(intake._id, {
      status: 'reading',
      error: undefined,
      retryable: undefined,
      reusedFrom: undefined,
      /* Whose it is, said by him: the reader is told. */
      hint:
        intake.hint ??
        (account && account.ownerId === ownerId ? account.name : undefined),
      readingSince: Date.now(),
      progress: { stage: 'opening', rows: 0, have: 0, recent: [] },
    })
    await dropHistory(ctx, intake._id)
    await ctx.scheduler.runAfter(0, internal.ai.intake.read, {
      intakeId: intake._id,
    })
    return null
  },
})

/** Throw a whole update away — every file in it, unread or read. */
export const discardBatch = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await openBatchFor(ctx, ownerId, args.batchId)
    for (const i of await batchIntakes(ctx, ownerId, b._id)) {
      if (i.status === 'done') continue
      for (const id of i.storageIds) await ctx.storage.delete(id)
      await dropHistory(ctx, i._id)
      await ctx.db.delete(i._id)
    }
    await ctx.db.patch(b._id, { status: 'done' })
    return null
  },
})

/** One intake, his — the check screen's own, wherever it was dropped. */
export const one = query({
  args: { intakeId: v.id('intakes') },
  returns: v.union(schema.doc('intakes'), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const row = await ctx.db.get(args.intakeId)
    return row !== null && row.ownerId === ownerId ? row : null
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

async function ownedBatch(
  ctx: QueryCtx,
  ownerId: string,
  batchId: Id<'batches'>,
): Promise<Doc<'batches'>> {
  const row = await ctx.db.get(batchId)
  if (row === null || row.ownerId !== ownerId) throw new Error('No such batch')
  return row
}

const batchFile = v.object({
  intakeId: v.id('intakes'),
  name: v.string(),
  status: v.union(
    v.literal('reading'),
    v.literal('ready'),
    v.literal('failed'),
    v.literal('done'),
  ),
  kind: v.union(
    v.literal('transactions'),
    v.literal('holdings'),
    v.literal('trades'),
    v.null(),
  ),
  accountId: v.union(v.id('accounts'), v.null()),
  /* A bank the app knows that he has not added yet. */
  suggest: suggestion,
  institution: v.union(v.string(), v.null()),
  rows: v.number(),
  /* The days its rows cover. */
  from: v.union(v.number(), v.null()),
  to: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
  retryable: v.boolean(),
  readingSince: v.union(v.number(), v.null()),
  /* While it is read: how far the reader is, and what it has found so far
     — so a long read is seen moving, not stuck (3 Oct). */
  stage: v.union(
    v.literal('opening'),
    v.literal('columns'),
    v.literal('rows'),
    v.literal('tickers'),
    v.null(),
  ),
  image: v.boolean(),
})

/** A batch while it is read: every file, where it is heading, how far. */

/**
 * The buys and sells a batch's files hold, each with the ticker it was
 * matched to — for ADD BUYS on one position's page (14 Oct), which puts
 * the units read beside the units held. Trade rows as read, nothing
 * worked out.
 */
export const batchBuys = query({
  args: { batchId: v.id('batches') },
  returns: v.array(
    v.object({
      accountId: v.union(v.id('accounts'), v.null()),
      intakeId: v.id('intakes'),
      /* The thing as printed, and the bank the file says it is from. */
      name: v.string(),
      institution: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      side: v.union(v.literal('buy'), v.literal('sell'), v.literal('reward')),
      shares: v.number(),
      price: v.number(),
      /* Printed beside it, in `currency`: a buy cost units × price and this. */
      fee: v.union(v.number(), v.null()),
      currency: v.string(),
      symbol: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await ctx.db.get(args.batchId)
    if (b === null || b.ownerId !== ownerId) return []
    return (await batchIntakes(ctx, ownerId, args.batchId)).flatMap((i) =>
      (i.trades ?? []).map((t) => ({
        accountId: i.accountId ?? null,
        intakeId: i._id,
        name: t.name,
        institution: i.institution ?? null,
        occurredAt: t.occurredAt,
        side: t.side,
        shares: t.shares,
        price: t.price,
        /* A coin's fee is taken in coins, not in money. */
        fee: t.crypto ? null : (t.fee ?? null),
        currency: t.currency,
        symbol: t.candidates[t.preferred ?? 0]?.symbol ?? null,
      })),
    )
  },
})

export const batch = query({
  args: { batchId: v.id('batches') },
  returns: v.object({
    status: v.union(
      v.literal('open'),
      v.literal('applying'),
      v.literal('done'),
    ),
    applied: v.union(
      v.object({
        intakes: v.number(),
        rows: v.number(),
        accounts: v.number(),
        byAccount:
          schema.tables.batches.validator.fields.applied.fields.byAccount,
      }),
      v.null(),
    ),
    files: v.array(batchFile),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await ownedBatch(ctx, ownerId, args.batchId)
    const accounts = await liveAccounts(ctx, ownerId)
    const files = (await batchIntakes(ctx, ownerId, b._id)).map((i) => {
      const accountId = headingFor(i, accounts)
      const times = (i.transactions ?? []).map((r) => r.occurredAt)
      const tradeTimes = (i.trades ?? []).map((r) => r.occurredAt)
      const all = [...times, ...tradeTimes]
      return {
        intakeId: i._id,
        name: i.files?.[0]?.name ?? 'file',
        status: i.status,
        kind: i.kind ?? i.progress?.kind ?? null,
        accountId,
        suggest: accountId === null ? suggestFor(i) : null,
        institution: i.institution ?? i.progress?.institution ?? null,
        rows:
          i.status === 'reading'
            ? (i.progress?.rows ?? 0)
            : (i.transactions?.length ?? 0) +
              (i.trades?.length ?? 0) +
              (i.positions?.length ?? 0) +
              (i.historyTrades ?? 0),
        from: all.length ? Math.min(...all) : null,
        to: all.length ? Math.max(...all) : null,
        error: i.error ?? null,
        retryable: i.retryable ?? false,
        readingSince: i.readingSince ?? null,
        stage:
          i.status !== 'reading'
            ? null
            : (i.progress?.rows ?? 0) === 0 &&
                i.progress?.stage === 'opening' &&
                i.progress.institution === undefined
              ? ('opening' as const)
              : (i.progress?.stage ?? null),
        image: isImage(i),
      }
    })
    return { status: b.status, applied: b.applied ?? null, files }
  },
})

/** The update still waiting — being read, or read and not applied. */
export const openBatch = query({
  args: {},
  returns: v.union(v.id('batches'), v.null()),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const latest = await latestUpdate(ctx, ownerId)
    return latest !== null && latest.status !== 'done' ? latest._id : null
  },
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
    return await buildReview(ctx, ownerId, intake)
  },
})

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
    return await writeTransactions(ctx, ownerId, intake, account, args)
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
    /* Which of the reading's positions are kept, and "save it anyway"
       for a screenshot that does not reach its own total (11 Oct). */
    kept: v.optional(v.array(v.number())),
    anyway: v.optional(v.boolean()),
  },
  returns: v.object({ positions: v.number(), replaced: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    if (intake.status !== 'ready' || intake.kind !== 'holdings') {
      throw new ConvexError('That is not ready to confirm.')
    }
    const all = intake.positions ?? []
    const check = holdingsTotal(
      (args.kept ?? all.map((_, i) => i)).map((i) => all.at(i)?.valueEur),
      args.cashEur ?? null,
      intake.totalEur ?? null,
    )
    if (check.state === 'differs' && args.anyway !== true)
      throw new ConvexError(
        'The positions and the cash do not reach the total on the screenshot.',
      )
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    return await writeHoldings(ctx, ownerId, intake, account, args)
  },
})

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
    await writeClosing(ctx, ownerId, account, intake)
    if (intake.accountTail) await learnTails(ctx, account, [intake.accountTail])
    await ctx.db.patch(intake._id, {
      status: 'done',
      keptUntil: keepUntil(),
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
    const done = recent.find(
      (i) => i.status === 'done' && i.takenBackAt === undefined,
    )
    if (!done) return null
    return {
      name: done.files?.[0]?.name ?? done.title ?? 'a file',
      institution: done.institution ?? null,
      readAt: done.readAt ?? done._creationTime,
    }
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
            raw: l.meta?.raw,
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
        side: v.union(
          v.literal('buy'),
          v.literal('sell'),
          v.literal('split'),
          v.literal('reward'),
        ),
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
    historyFound: schema.tables.intakes.validator.fields.historyFound,
    historyShares: schema.tables.intakes.validator.fields.historyShares,
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
      reader: READER_VERSION,
      status: 'ready',
      model: args.model ?? INTAKE_MODEL_NAME,
      readAt: Date.now(),
      /* A retry's reading costs what every try cost. */
      costUsd:
        args.costUsd === undefined
          ? intake.costUsd
          : (intake.costUsd ?? 0) + args.costUsd,
    })
    if (args.historyTrades !== undefined)
      await joinUpdate(ctx, intake.ownerId, intake._id)
    await fileNotice(ctx, intake._id)
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
    await fileNotice(ctx, intake._id)
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

/**
 * A file already confirmed, opened again from its account (A.4, 2 Oct):
 * the rows it read, as it read them, and whether each one landed — left
 * out as pending, as one he already had, or by him.
 */
export const fileRows = query({
  args: { intakeId: v.id('intakes') },
  returns: v.object({
    title: v.string(),
    names: v.array(v.string()),
    readAt: v.number(),
    /** A connected bank's answer: no file was ever dropped. */
    bank: v.boolean(),
    rows: v.array(
      v.object({
        at: v.number(),
        text: v.string(),
        amount: v.number(),
        currency: v.string(),
        /** The group the reader filed it under, for the row's icon. */
        category: v.union(v.string(), v.null()),
        pending: v.boolean(),
        landed: v.boolean(),
      }),
    ),
    /** A trades file's buys and sells, each saved or in already. */
    trades: v.array(fileTrade),
    /** What a broker's screen or file listed, as it was read. */
    positions: v.array(
      v.object({
        name: v.string(),
        symbol: v.union(v.string(), v.null()),
        valueEur: v.union(v.number(), v.null()),
        shares: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await ownedIntake(ctx, ownerId, args.intakeId)
    const written = new Set<string>()
    if (intake.accountId !== undefined) {
      const read = intake.transactions ?? []
      if (read.length > 0) {
        const times = read.map((r) => r.occurredAt)
        for (const l of await ctx.db
          .query('logs')
          .withIndex('by_owner_account_time', (q) =>
            q
              .eq('ownerId', ownerId)
              .eq('accountId', intake.accountId)
              .gte('occurredAt', Math.min(...times))
              .lte('occurredAt', Math.max(...times)),
          )
          .take(HISTORY_ROWS))
          if (l.meta?.intakeId === intake._id)
            written.add(`${l.occurredAt}:${Math.abs(l.value ?? 0).toFixed(2)}`)
      }
    }
    return {
      title: intake.title ?? 'A file',
      names: (intake.files ?? []).map((f) => f.name),
      readAt: intake.readAt ?? intake._creationTime,
      bank: intake.via === 'bank',
      rows: (intake.transactions ?? [])
        .map((r) => ({
          at: r.occurredAt,
          text: r.merchant,
          amount: r.amount,
          currency: r.currency,
          category: r.category ?? null,
          pending: r.pending,
          landed: written.has(
            `${r.occurredAt}:${Math.abs(r.amount).toFixed(2)}`,
          ),
        }))
        .sort((a, b) => b.at - a.at),
      trades: await fileTrades(ctx, ownerId, intake),
      positions: (intake.positions ?? []).map((p) => ({
        name: p.name,
        symbol: p.candidates.at(p.preferred ?? 0)?.symbol ?? null,
        valueEur: p.valueEur ?? null,
        shares: p.shares ?? null,
      })),
    }
  },
})

/* ---- UPDATE ALL: the review of a whole batch, per account ------------ */

export const batchReview = query({
  args: { batchId: v.id('batches') },
  returns: v.object({
    status: v.union(
      v.literal('open'),
      v.literal('applying'),
      v.literal('done'),
    ),
    /* Every file read (or failed): the review is whole. */
    ready: v.boolean(),
    months: v.array(v.string()),
    accounts: v.array(batchAccount),
    asks: v.array(batchAsk),
    moves: v.array(
      v.object({
        fromAccountId: v.id('accounts'),
        toAccountId: v.id('accounts'),
        amount: v.number(),
        occurredAt: v.number(),
        days: v.number(),
        /* The other side was already in the app, not in this drop. */
        had: v.boolean(),
      }),
    ),
    files: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await ownedBatch(ctx, ownerId, args.batchId)
    const {
      pairs: _pairs,
      ownInfo: _info,
      stored: _stored,
      accountOf: _of,
      ...view
    } = await gatherBatch(ctx, ownerId, b)
    return view
  },
})

async function openBatchFor(
  ctx: MutationCtx,
  ownerId: string,
  batchId: Id<'batches'>,
): Promise<Doc<'batches'>> {
  const b = await ownedBatch(ctx, ownerId, batchId)
  if (b.status !== 'open')
    throw new ConvexError('That update is being applied.')
  return b
}

/**
 * What he answered in the bulk review — one ask at a time. Nothing is a
 * log until he applies; these only change what the apply will write.
 */
export const batchAnswer = mutation({
  args: {
    batchId: v.id('batches'),
    answer: v.union(
      /* "Whose is this?" / "New account: BPI — keep it". */
      v.object({
        kind: v.literal('place'),
        intakeIds: v.array(v.id('intakes')),
        accountId: v.id('accounts'),
      }),
      /* "There was nothing that month." */
      v.object({
        kind: v.literal('quiet'),
        accountId: v.id('accounts'),
        month: v.string(),
      }),
      /* A move with one side: where it went, or null — outside the app. */
      v.object({
        kind: v.literal('move'),
        intakeId: v.id('intakes'),
        index: v.number(),
        otherAccountId: v.union(v.id('accounts'), v.null()),
      }),
      /* "Add €100 between 3 and 10 Sep." */
      v.object({
        kind: v.literal('extra'),
        key: v.string(),
        accountId: v.id('accounts'),
        occurredAt: v.number(),
        amount: v.number(),
      }),
      v.object({ kind: v.literal('dismiss'), key: v.string() }),
      /* A sum that is off (11 Oct): "skip:<file>:<row>" the same payment,
         "two:<file>:<row>" another one, "sum:<account>" save it as it is.
         `on: false` takes the answer back. */
      v.object({ kind: v.literal('sum'), key: v.string(), on: v.boolean() }),
      v.object({
        kind: v.literal('leaveOut'),
        accountId: v.id('accounts'),
        out: v.boolean(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { batchId, answer }) => {
    const ownerId = await requireUser(ctx)
    const b = await openBatchFor(ctx, ownerId, batchId)
    const inBatch = async (id: Id<'intakes'>) => {
      const i = await ownedIntake(ctx, ownerId, id)
      if (i.batchId !== b._id) throw new Error('No such intake')
      return i
    }
    switch (answer.kind) {
      case 'place': {
        await ownedAccount(ctx, ownerId, answer.accountId)
        for (const id of answer.intakeIds) {
          await inBatch(id)
          await ctx.db.patch(id, { accountId: answer.accountId })
        }
        return null
      }
      case 'quiet': {
        await ownedAccount(ctx, ownerId, answer.accountId)
        if (!/^\d{4}-\d{2}$/.test(answer.month))
          throw new ConvexError('That is not a month.')
        await ctx.db.patch(b._id, {
          quietMonths: [
            ...b.quietMonths,
            { accountId: answer.accountId, month: answer.month },
          ],
        })
        return null
      }
      case 'move': {
        const i = await inBatch(answer.intakeId)
        const rows = i.transactions ?? []
        if (answer.index < 0 || answer.index >= rows.length)
          throw new Error('No such row')
        if (answer.otherAccountId)
          await ownedAccount(ctx, ownerId, answer.otherAccountId)
        await ctx.db.patch(b._id, {
          moves: [
            ...b.moves.filter(
              (m) => m.intakeId !== answer.intakeId || m.index !== answer.index,
            ),
            {
              intakeId: answer.intakeId,
              index: answer.index,
              otherAccountId: answer.otherAccountId,
            },
          ],
        })
        return null
      }
      case 'extra': {
        await ownedAccount(ctx, ownerId, answer.accountId)
        if (
          !Number.isFinite(answer.amount) ||
          answer.amount === 0 ||
          Math.abs(answer.amount) > 1e7
        )
          throw new ConvexError('That is not an amount.')
        await ctx.db.patch(b._id, {
          extras: [
            ...b.extras,
            {
              accountId: answer.accountId,
              occurredAt: answer.occurredAt,
              amount: Math.round(answer.amount * 100) / 100,
            },
          ],
          dismissed: [...b.dismissed, answer.key],
        })
        return null
      }
      case 'dismiss': {
        await ctx.db.patch(b._id, {
          dismissed: [...b.dismissed, answer.key.slice(0, 120)],
        })
        return null
      }
      case 'sum': {
        if (
          !/^((skip|two|sum|shares|noshares|total|nototal):[a-z0-9:]{1,80}|(same|apart):[a-z0-9:]{1,90})$/.test(
            answer.key,
          )
        )
          throw new ConvexError('No such answer.')
        /* "save it anyway" and "do not save it" are one answer or the
           other (11 Oct, a company whose shares differ). */
        const twin = /^(shares|total):/.test(answer.key)
          ? `no${answer.key}`
          : /^no(shares|total):/.test(answer.key)
            ? answer.key.slice(2)
            : null
        /* One answer per row of a transfer: the same as one side, or
           not (12 Oct). */
        const row = /^(same|apart):([a-z0-9]+:[0-9]+)/.exec(answer.key)?.[2]
        const rest = b.dismissed.filter(
          (k) =>
            k !== answer.key &&
            k !== twin &&
            (row === undefined ||
              (k !== `apart:${row}` && !k.startsWith(`same:${row}:`))),
        )
        await ctx.db.patch(b._id, {
          dismissed: answer.on ? [...rest, answer.key] : rest,
        })
        return null
      }
      case 'leaveOut': {
        await ownedAccount(ctx, ownerId, answer.accountId)
        const rest = b.leftOut.filter((a) => a !== answer.accountId)
        await ctx.db.patch(b._id, {
          leftOut: answer.out ? [...rest, answer.accountId] : rest,
        })
        return null
      }
    }
  },
})

/**
 * APPLY: every placed statement, oldest first, one per step so a year of
 * files never meets a transaction's limits. Transfers paired across files
 * are fixed first — the earlier statement writes both sides, and the
 * later one's row is then found already there. Left-out accounts, files
 * it could not place, broker screens and failed reads stay in the batch,
 * waiting.
 */
export const applyBatch = mutation({
  args: {
    batchId: v.id('batches'),
    dayStart: v.number(),
    /* ADD BUYS on one thing's page: every listing it is owned under. A
       trade read for anything else stops the save (14 Oct: iShares
       Physical Gold from Trading 212, dropped on Gold's, was about to
       be saved under Revolut). */
    only: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await openBatchFor(ctx, ownerId, args.batchId)
    const only = args.only
    if (only !== undefined) {
      const files = await batchIntakes(ctx, ownerId, b._id)
      const other = files.some(
        (i) =>
          i.status === 'ready' &&
          (i.trades ?? []).some((t) => {
            const symbol = t.candidates.at(t.preferred ?? 0)?.symbol
            return symbol === undefined || !only.includes(symbol)
          }),
      )
      if (other)
        throw new ConvexError('Rows for something else are in this drop.')
    }
    const identity = await ctx.auth.getUserIdentity()
    const names = identity?.name ? [identity.name] : []
    await startApply(ctx, ownerId, b, names, args.dayStart)
    return null
  },
})

/** The apply itself, begun: by his press, or by a bank's rows that add up
    (convex/bankRows.ts). */
export async function startApply(
  ctx: MutationCtx,
  ownerId: string,
  b: Doc<'batches'>,
  names: Array<string>,
  dayStart: number,
) {
  {
    const g = await gatherBatch(ctx, ownerId, b, names)
    if (!g.ready) throw new ConvexError('Some files are still being read.')
    const moves = [...b.moves]
    const has = (key: string) =>
      moves.some((m) => `${m.intakeId}:${m.index}` === key)
    for (const [outKey, inKey] of g.pairs) {
      const a = g.ownInfo.get(outKey)
      const c = g.ownInfo.get(inKey)
      const accA = g.accountOf.get(outKey)
      const accC = g.accountOf.get(inKey)
      if (!a || !c || !accA || !accC) continue
      if (!has(outKey))
        moves.push({
          intakeId: a.intakeId,
          index: a.index,
          otherAccountId: accC,
        })
      if (!has(inKey))
        moves.push({
          intakeId: c.intakeId,
          index: c.index,
          otherAccountId: accA,
        })
    }
    for (const x of g.stored) {
      const info = g.ownInfo.get(x.key)
      if (info && !has(x.key))
        moves.push({
          intakeId: info.intakeId,
          index: info.index,
          otherAccountId: x.otherAccountId,
        })
    }
    const held = g.accounts.flatMap((x) =>
      x.held && x.accountId !== null && !x.leftOut ? [x.accountId] : [],
    )
    await ctx.db.patch(b._id, {
      status: 'applying',
      moves,
      held,
      /* What the check decided for each row of a transfer, for the
         step that writes it. */
      dismissed: [
        ...b.dismissed.filter((k) => !k.startsWith('pair:')),
        ...g.accounts.flatMap((x) =>
          x.leftOut || x.held
            ? []
            : x.transfers.flatMap((t) =>
                t.chosen !== null && t.state !== 'apart'
                  ? [`pair:${t.key}:${t.chosen}`]
                  : [],
              ),
        ),
      ],
      heldShares: g.accounts.flatMap((x) =>
        x.shares && !x.leftOut ? notSaved(x.shares) : [],
      ),
      applied: {
        intakes: 0,
        rows: 0,
        accounts: g.accounts.filter((x) => !x.leftOut && !x.held).length,
      },
    })
    await ctx.scheduler.runAfter(0, internal.intake.applyStep, {
      batchId: b._id,
      dayStart,
      names,
    })
  }
}

/**
 * A save that stopped is carried on (10 Oct): the chain of steps is
 * started again from where it is. It writes nothing itself, and a step
 * takes only a file still waiting — so pressing it twice, or while the
 * save is in fact still running, adds nothing twice.
 */
export const resumeApply = mutation({
  args: { batchId: v.id('batches'), dayStart: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await ownedBatch(ctx, ownerId, args.batchId)
    if (b.status !== 'applying') return null
    const identity = await ctx.auth.getUserIdentity()
    await ctx.scheduler.runAfter(0, internal.intake.applyStep, {
      batchId: b._id,
      dayStart: args.dayStart,
      names: identity?.name ? [identity.name] : [],
    })
    return null
  },
})

export const applyStep = internalMutation({
  args: {
    batchId: v.id('batches'),
    dayStart: v.number(),
    names: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.batchId)
    if (b === null || b.status !== 'applying') return null
    const ownerId = b.ownerId
    const accounts = await liveAccounts(ctx, ownerId)
    const all = await batchIntakes(ctx, ownerId, b._id)
    /* A broker's screens go in together, and only once every position
       can be completed — else they wait for the check screen. */
    const screensOf = (accountId: Id<'accounts'> | null) =>
      all.filter(
        (i) =>
          i.status === 'ready' &&
          i.kind === 'holdings' &&
          headingFor(i, accounts) === accountId,
      )
    const waiting = all.filter(
      (i) =>
        i.status === 'ready' &&
        (i.kind === 'transactions' ||
          i.kind === 'trades' ||
          (i.kind === 'holdings' &&
            mergedHoldings(screensOf(headingFor(i, accounts)))?.missing === 0)),
    )
    const next = applyOrder(
      waiting
        .map((i) => {
          const accountId = headingFor(i, accounts)
          const times = [
            ...(i.transactions ?? []).map((r) => r.occurredAt),
            ...(i.trades ?? []).map((r) => r.occurredAt),
          ]
          return {
            i,
            accountId,
            to: i.balance?.asOf ?? (times.length ? Math.max(...times) : null),
          }
        })
        .filter(
          (x) =>
            x.accountId !== null &&
            !b.leftOut.includes(x.accountId) &&
            !(b.held ?? []).includes(x.accountId) &&
            !(
              x.i.kind !== 'transactions' &&
              !accounts
                .find((a) => a._id === x.accountId)
                ?.kinds.includes('broker')
            ),
        ),
    ).at(0)

    const applied = b.applied ?? { intakes: 0, rows: 0, accounts: 0 }
    if (next === undefined || next.accountId === null) {
      await finishBatch(ctx, b, applied)
      return null
    }
    let rows = 0
    try {
      /* Its own subtransaction: a file that cannot go in (a currency the
         account does not hold, shares for an account that is no broker)
         rolls back alone, and the rest of the batch carries on. */
      rows = await ctx.runMutation(internal.intake.applyOne, {
        intakeId: next.i._id,
        accountId: next.accountId,
        batchId: b._id,
        dayStart: args.dayStart,
        names: args.names,
      })
    } catch (e) {
      await ctx.db.patch(next.i._id, {
        status: 'failed',
        error: `Not applied: ${e instanceof ConvexError ? String(e.data) : 'it could not be written.'}`,
        retryable: false,
      })
    }
    const was = applied.byAccount ?? []
    const accountId = next.accountId
    /* A history goes in a chunk a step; it counts as one file once done. */
    const finished = (await ctx.db.get(next.i._id))?.status !== 'ready'
    const line = was.find((x) => x.accountId === accountId) ?? {
      accountId,
      rows: 0,
    }
    const noun =
      next.i.kind === 'holdings'
        ? 'positions'
        : next.i.kind === 'trades'
          ? 'trades'
          : 'movements'
    const named =
      rows === 0
        ? []
        : next.i.kind === 'holdings'
          ? (next.i.positions ?? []).map((p) => p.name)
          : next.i.historyTrades !== undefined
            ? (next.i.historyFound ?? []).flatMap(
                (f) => f.candidates.at(f.preferred ?? 0)?.symbol ?? [],
              )
            : next.i.kind === 'trades'
              ? (next.i.trades ?? []).map(
                  (t) =>
                    t.candidates.at(t.preferred ?? 0)?.symbol.split('.')[0] ??
                    t.name,
                )
              : []
    const updated = {
      ...line,
      rows: line.rows + rows,
      [noun]: (line[noun] ?? 0) + rows,
      names: [...new Set([...(line.names ?? []), ...named])].slice(0, 8),
    }
    await ctx.db.patch(b._id, {
      applied: {
        ...applied,
        intakes: applied.intakes + (finished ? 1 : 0),
        rows: applied.rows + rows,
        byAccount: was.some((x) => x.accountId === accountId)
          ? was.map((x) => (x.accountId === accountId ? updated : x))
          : [...was, updated],
      },
    })
    await ctx.scheduler.runAfter(0, internal.intake.applyStep, args)
    return null
  },
})

/* One statement of a batch, written as its own review says — called by
   applyStep in a subtransaction. */
export const applyOne = internalMutation({
  args: {
    intakeId: v.id('intakes'),
    accountId: v.id('accounts'),
    batchId: v.id('batches'),
    dayStart: v.number(),
    names: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.batchId)
    const intake = await ctx.db.get(args.intakeId)
    if (b === null || intake === null || intake.batchId !== b._id) return 0
    const ownerId = b.ownerId
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    let rows = 0
    if (intake.kind === 'transactions') {
      const read = await buildReview(ctx, ownerId, intake, args.names)
      const answered = new Map(
        b.moves.map((m) => [`${m.intakeId}:${m.index}`, m.otherAccountId]),
      )
      const keep: Array<ConfirmRow> = read.rows
        .filter(
          (r) =>
            !r.pending &&
            r.duplicateOf === null &&
            !r.counted &&
            !b.dismissed.includes(`skip:${intake._id}:${r.index}`),
        )
        .map((r) => {
          const answer = answered.get(`${intake._id}:${r.index}`)
          const other = answer === undefined ? r.otherAccountId : answer
          return {
            index: r.index,
            kind: r.kind,
            category: r.category ?? undefined,
            otherAccountId:
              r.kind === 'move' ? (other ?? undefined) : undefined,
            recurringId: r.recurringId ?? undefined,
          }
        })
      const mark = `pair:${intake._id}:`
      const done = await writeTransactions(ctx, ownerId, intake, account, {
        rows: keep,
        keepBalance: true,
        dayStart: args.dayStart,
        pairs: new Map(
          b.dismissed.flatMap((k) => {
            if (!k.startsWith(mark)) return []
            const [index, ...sideId] = k.slice(mark.length).split(':')
            return [[Number(index), sideId.join(':')] as const]
          }),
        ),
      })
      rows = done.written + done.trades.written
    } else if (intake.kind === 'holdings') {
      const accounts = await liveAccounts(ctx, ownerId)
      const screens = (await batchIntakes(ctx, ownerId, b._id)).filter(
        (i) =>
          i.status === 'ready' &&
          i.kind === 'holdings' &&
          headingFor(i, accounts) === account._id,
      )
      const merged = mergedHoldings(screens)
      if (merged === null || merged.missing > 0) return 0
      /* Positions the account's trades hold already are not saved again
         (19 Oct): from such a screen only the cash is new. */
      const fresh = []
      for (const r of merged.rows)
        if (
          r !== null &&
          !(await inStatement(ctx, ownerId, account._id, r.candidate))
        )
          fresh.push(r)
      const cashEur = merged.cashEur ?? undefined
      const done =
        fresh.length === 0 && cashEur === undefined
          ? { positions: 0 }
          : await writeHoldings(ctx, ownerId, intake, account, {
              asOf: Date.now(),
              dayStart: args.dayStart,
              rows: fresh,
              cashEur,
              screens,
            })
      if (fresh.length === 0 && cashEur === undefined)
        await ctx.db.patch(intake._id, {
          status: 'done',
          keptUntil: keepUntil(),
          accountId: account._id,
        })
      for (const other of screens.filter((i) => i._id !== intake._id)) {
        await ctx.db.patch(other._id, {
          status: 'done',
          keptUntil: keepUntil(),
          accountId: account._id,
        })
      }
      return done.positions
    } else if (intake.historyTrades !== undefined) {
      rows = await applyHistoryChunk(
        ctx,
        ownerId,
        intake,
        account,
        b.heldShares ?? [],
      )
    } else {
      const items = (intake.trades ?? []).flatMap((t, index) => {
        const c = t.candidates.at(
          t.preferred !== undefined && t.preferred >= 0 ? t.preferred : 0,
        )
        return c ? [{ index, trade: t, candidate: c }] : []
      })
      const done = await writeTrades(ctx, ownerId, account, intake._id, items)
      if (intake.accountTail)
        await learnTails(ctx, account, [intake.accountTail])
      await ctx.db.patch(intake._id, {
        status: 'done',
        keptUntil: keepUntil(),
        accountId: account._id,
      })
      rows = done.written
    }
    return rows
  },
})

/* Rows of a trading history written in one step: enough to finish his
   3,595 in a handful of steps, few enough for one transaction. */
const HISTORY_CHUNK = 400

/**
 * The next chunk of a trading history, oldest first, each name on the
 * ticker found for it when it was read. A name with no ticker is left out
 * and said in the file's note — never guessed. Done when the last chunk is
 * written.
 */
async function applyHistoryChunk(
  ctx: MutationCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  account: Doc<'accounts'>,
  /* Companies whose shares differ from the account's and he did not say
     to save: "<intake>:<n>" (applyBatch). */
  heldShares: ReadonlyArray<string>,
) {
  const differs = new Set(
    (intake.historyShares?.sums ?? []).flatMap((s, n) =>
      heldShares.includes(`${intake._id}:${n}`) ? [s.name] : [],
    ),
  )
  const page = await ctx.db
    .query('intakeTrades')
    .withIndex('by_intake', (q) => q.eq('intakeId', intake._id))
    .paginate({ cursor: intake.historyCursor ?? null, numItems: HISTORY_CHUNK })
  const found = new Map(
    (intake.historyFound ?? []).map((f) => [
      f.name,
      f.candidates.at(f.preferred ?? 0) ?? null,
    ]),
  )
  const items = page.page.flatMap((t, index) => {
    const pick = found.get(t.name) ?? null
    return pick && !differs.has(t.name)
      ? [{ index, trade: t, candidate: pick }]
      : []
  })
  const done = await writeTrades(ctx, ownerId, account, intake._id, items, true)
  if (!page.isDone) {
    await ctx.db.patch(intake._id, { historyCursor: page.continueCursor })
    return done.written
  }
  const left = new Map<string, number>()
  for (const [name, c] of found) if (c === null) left.set(name, 0)
  if (left.size > 0)
    for (const t of await ctx.db
      .query('intakeTrades')
      .withIndex('by_intake', (q) => q.eq('intakeId', intake._id))
      .take(HISTORY_TRADES))
      if (left.has(t.name)) left.set(t.name, (left.get(t.name) ?? 0) + 1)
  const said = [...left]
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} trades of ${name}`)
  await ctx.db.patch(intake._id, {
    status: 'done',
    keptUntil: keepUntil(),
    accountId: account._id,
    historyCursor: undefined,
    ...(said.length + differs.size
      ? {
          note: [
            intake.note,
            said.length ? `Left out, no ticker found: ${said.join(', ')}.` : '',
            differs.size
              ? `Not saved, shares differ from the account: ${[...differs].join(', ')}.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        }
      : {}),
  })
  if (intake.accountTail) await learnTails(ctx, account, [intake.accountTail])
  return done.written
}

/* The rows he added where balances disagreed, then done — or open again
   when something in it is still waiting for him. */
async function finishBatch(
  ctx: MutationCtx,
  b: Doc<'batches'>,
  applied: { intakes: number; rows: number; accounts: number },
) {
  let extra = 0
  for (const e of b.extras) {
    if (b.leftOut.includes(e.accountId)) continue
    const account = await ctx.db.get(e.accountId)
    if (account === null || account.ownerId !== b.ownerId) continue
    await ctx.db.insert('logs', {
      ownerId: b.ownerId,
      area: 'money',
      kind: e.amount < 0 ? 'expense' : 'income',
      occurredAt: e.occurredAt,
      value: Math.abs(e.amount),
      unit: 'eur',
      text: MISSING_TEXT,
      accountId: e.accountId,
      meta: { merchant: MISSING_TEXT, category: 'other' },
    })
    extra++
  }
  const left = (await batchIntakes(ctx, b.ownerId, b._id)).some(
    (i) => i.status !== 'done',
  )
  await ctx.db.patch(b._id, {
    status: left ? 'open' : 'done',
    extras: [],
    applied: { ...applied, rows: applied.rows + extra },
    appliedAt: Date.now(),
  }) /* Flow (3 Oct): new statements can show a bill coming round — it goes
     onto its day with no question. */
  await findFor(ctx, b.ownerId)
}

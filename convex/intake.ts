import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { balanceKey, ownedAccount, writeBalance } from './accounts'
import { movedSince } from './aggregate'
import { checkTrade, upsertInstrument } from './invest'
import { transferPair } from './logs'
import { findFor } from './recurring'
import { euroRateAt, writeTransfer } from './money'
import { sharesIn } from '../src/lib/crypto'
import { heldCost } from '../src/lib/holdings'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { UNPRICED, screenSource, tickerBase } from '../src/lib/market'
import type { Candidate } from '../src/lib/market'
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
  completePosition,
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
import {
  applyOrder,
  balanceGaps,
  coverage,
  pairAcross,
  reviewMonths,
} from '../src/lib/bulk'
import type { OwnRow } from '../src/lib/bulk'
import { productByIban, productIn, tailsIn } from '../src/lib/institutions'

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
  ctx: QueryCtx,
  intake: Doc<'intakes'>,
): Promise<Array<string>> {
  const identity = await ctx.auth.getUserIdentity()
  return [
    intake.holderName,
    identity?.name,
    ...(await namesOnFiles(ctx, intake.ownerId)),
  ].filter((n): n is string => typeof n === 'string' && n.trim() !== '')
}

/* The holder's name as his other statements printed it — a screenshot
   prints none (3 Oct: BPI's screens), and a sign-in may carry no name. */
async function namesOnFiles(ctx: QueryCtx, ownerId: string) {
  const recent = await ctx.db
    .query('intakes')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .take(30)
  return [
    ...new Set(recent.flatMap((i) => (i.holderName ? [i.holderName] : []))),
  ]
}

/* His account at the bank an IBAN in the text belongs to (PT50 0023 … is
   ActivoBank) — only when he has exactly one there, and not this one. */
function byBank(
  accounts: ReadonlyArray<Doc<'accounts'>>,
  here: Id<'accounts'> | null,
  text: string,
): Id<'accounts'> | null {
  const p = productByIban(text)
  if (!p) return null
  const at = accounts.filter(
    (a) => a.institution === p.institution && a._id !== here,
  )
  return at.length === 1 ? at[0]._id : null
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
export const startBatch = mutation({
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
  const latest = await ctx.db
    .query('batches')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .first()
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

/* How long a confirmed file is kept to open again (3 Oct): a quarter,
   long enough to check a month against its statement twice over. */
export const KEEP_FILES_MS = 90 * 86_400_000
const keepUntil = () => Date.now() + KEEP_FILES_MS
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
export const readAgain = mutation({
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

async function ownedBatch(
  ctx: QueryCtx,
  ownerId: string,
  batchId: Id<'batches'>,
): Promise<Doc<'batches'>> {
  const row = await ctx.db.get(batchId)
  if (row === null || row.ownerId !== ownerId) throw new Error('No such batch')
  return row
}

async function batchIntakes(
  ctx: QueryCtx,
  ownerId: string,
  batchId: Id<'batches'>,
): Promise<Array<Doc<'intakes'>>> {
  return await ctx.db
    .query('intakes')
    .withIndex('by_owner_batch', (q) =>
      q.eq('ownerId', ownerId).eq('batchId', batchId),
    )
    .take(MAX_BATCH_FILES)
}

async function liveAccounts(ctx: QueryCtx, ownerId: string) {
  return (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
  ).filter((a) => a.retiredAt === undefined)
}

/* Which account a file is heading for while it is still being read: his
   pick, or the guess from what the reader has found so far. */
function headingFor(
  intake: Doc<'intakes'>,
  accounts: ReadonlyArray<Doc<'accounts'>>,
): Id<'accounts'> | null {
  if (intake.accountId) return intake.accountId
  const seen = {
    ...intake,
    institution: intake.institution ?? intake.progress?.institution,
    accountTail: intake.accountTail ?? intake.progress?.accountTail,
    kind: intake.kind ?? intake.progress?.kind,
  }
  return guessAccount(seen, accounts)
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
    const latest = await ctx.db
      .query('batches')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .first()
    return latest !== null && latest.status !== 'done' ? latest._id : null
  },
})

const reviewRow = v.object({
  index: v.number(),
  occurredAt: v.number(),
  time: v.union(v.string(), v.null()),
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
    return await buildReview(ctx, ownerId, intake)
  },
})

/* The review of one read statement, against what he has — shared by the
   single-file review and a batch, which reviews every file the same way. */
async function buildReview(
  ctx: QueryCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  /* A scheduled apply has no sign-in: it passes the names it was given. */
  given?: ReadonlyArray<string>,
) {
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
    raw: l.meta?.raw,
  }))
  const dups = findDuplicates(read, existingRows)
  /* A transfer is the same transfer whatever each bank calls it — "To
     Trade Republic" here, "Revolut → TR" typed, "Top up" on the other
     side: its own money moving is matched by amount and days alone. */
  const names = given
    ? [
        intake.holderName,
        ...given,
        ...(await namesOnFiles(ctx, ownerId)),
      ].filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    : await hisNames(ctx, intake)
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
      .withIndex('by_owner_key', (q) => q.eq('ownerId', ownerId).eq('key', key))
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
    /* PayPal is many shops: its rows come in unfiled, to be named one
       by one (4 Oct), whatever an old rule said. */
    const rule = /\bPAYPAL\b/i.test(`${r.merchant} ${r.raw}`)
      ? undefined
      : rules.get(merchantKey(r.merchant))
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
      time: r.time ?? null,
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
          ) as Id<'accounts'> | null) ??
          byBank(accounts, here, `${r.counterparty ?? ''} ${r.raw}`))
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
}

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
    return await writeTransactions(ctx, ownerId, intake, account, args)
  },
})

type ConfirmRow = {
  index: number
  kind: 'spend' | 'income' | 'move'
  category?: string
  otherAccountId?: Id<'accounts'>
  recurringId?: Id<'recurring'>
}

/* Writes the rows he kept from one statement, its orders and balance —
   shared by the single-file confirm and a batch's apply. */
async function writeTransactions(
  ctx: MutationCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  account: Doc<'accounts'>,
  {
    rows,
    keepBalance,
    dayStart,
  }: {
    rows: ReadonlyArray<ConfirmRow>
    keepBalance: boolean
    dayStart: number
  },
) {
  const read = intake.transactions ?? []
  const seen = new Set<number>()
  let written = 0
  for (const row of rows) {
    const r = read[row.index] as (typeof read)[number] | undefined
    if (r === undefined || seen.has(row.index)) continue
    seen.add(row.index)
    if (r.pending) continue
    if (row.otherAccountId) await ownedAccount(ctx, ownerId, row.otherAccountId)
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
  if (keepBalance && intake.balance) {
    /* A statement's balance is true at the end of its closing day. Its
       day is noon UTC; 18:00 UTC is still that day from Lisbon to New
       York (27 Sep: +12h put Aug 31 into Sep 1 in Lisbon). */
    await writeBalance(
      ctx,
      ownerId,
      account,
      intake.balance.currency,
      intake.balance.value,
      dayStart,
      intake.balance.asOf + 6 * 3_600_000,
      sourceOf(intake),
    )
    /* The account's other currencies (5 Oct: "When I upload csv it means
       usd should be updated as well"). Revolut exports one currency a
       file; its EUR statement says USD did not move, so USD is read again
       as it stood that day — its last reading and what moved since, up
       to the statement's day. Here, so a single file and a bulk upload
       do the same. */
    const at = intake.balance.asOf + 6 * 3_600_000
    for (const currency of account.currencies) {
      if (currency === intake.balance.currency) continue
      const last = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', balanceKey(account._id, currency))
            .lte('recordedAt', at),
        )
        .order('desc')
        .first()
      if (last?.value === undefined) continue
      const since = await movedSince(
        ctx,
        ownerId,
        account,
        currency,
        last.recordedAt,
        at,
      )
      await writeBalance(
        ctx,
        ownerId,
        account,
        currency,
        (Math.round(last.value * 100) + since.cents) / 100,
        dayStart,
        at,
        sourceOf(intake),
      )
    }
  }
  if (intake.accountTail) await learnTails(ctx, account, [intake.accountTail])
  await ctx.db.patch(intake._id, {
    status: 'done',
    keptUntil: keepUntil(),
    accountId: account._id,
  })
  return { written, trades }
}

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
    return await writeHoldings(ctx, ownerId, intake, account, args)
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
      side: 'buy' | 'sell' | 'reward' | 'split'
      shares: number
      price: number
      currency: string
      fee?: number
      crypto?: boolean
    }
    candidate: Candidate
  }>,
  /* A trading history's rows (9 Oct): Revolut's cash is on its
     statements already, so they never move it. */
  noCash = false,
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
  /* Each ticker's stored trades, read once a call: a history chunk of
     hundreds of rows over a few tickers would read them hundreds of times. */
  const stored = new Map<Id<'instruments'>, Array<Doc<'trades'>>>()
  const storedFor = async (instrumentId: Id<'instruments'>) => {
    let list = stored.get(instrumentId)
    if (list === undefined) {
      list = await ctx.db
        .query('trades')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
      stored.set(instrumentId, list)
    }
    return list
  }
  for (const { index, trade: t, candidate: c } of rows) {
    if (seen.has(index)) continue
    seen.add(index)
    /* That day's rate, not today's (4 Oct: his crypto trades go back to
       2020, in € and $). */
    const free = t.side === 'reward' || t.side === 'split'
    const priceEur = free
      ? 0
      : t.price * (await euroRateAt(ctx, ownerId, t.currency, t.occurredAt))
    /* Revolut takes its crypto fee in coins: a buy brings in its quantity
       less the fee's share of the value. */
    const shares =
      t.crypto && t.side === 'buy' ? sharesIn({ ...t, side: 'buy' }) : t.shares
    if (free) {
      if (!(shares > 0)) throw new ConvexError('That needs a number of shares.')
    } else checkTrade(shares, priceEur)
    const same = sameCompany({ name: t.name, isin: t.isin }, held)
    const instrumentId =
      same >= 0
        ? held[same]._id
        : await upsertInstrument(ctx, ownerId, c, t.isin)
    const near = await storedFor(instrumentId)
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
        (x.reward ? 'reward' : x.split ? 'split' : x.side) === t.side &&
        Math.abs(x.shares - shares) < 1e-6 &&
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
      side: t.side === 'sell' ? 'sell' : 'buy',
      shares,
      priceEur: Math.round(priceEur * 10000) / 10000,
      occurredAt: t.occurredAt,
      importId: intakeId,
      ...(t.side === 'reward' ? { reward: true } : {}),
      ...(t.side === 'split' ? { split: true } : {}),
      /* Revolut's crypto money is on its bank statement already. */
      ...(t.crypto || noCash ? { noCash: true } : {}),
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

/**
 * A crypto statement's closing amounts (4 Oct): what the account held on
 * the statement's last day, as its own observation — the trades say what
 * was bought and for how much, this says how much is there. The same day's
 * look for the same coin is replaced, never added to.
 */
async function writeClosing(
  ctx: MutationCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  intake: Doc<'intakes'>,
) {
  if (intake.kind !== 'trades') return
  const asOf = intake.balance?.asOf ?? intake.readAt ?? Date.now()
  for (const p of intake.positions ?? []) {
    const c = p.candidates.at(p.preferred ?? 0)
    if (!c || p.shares === undefined || !(p.shares > 0)) continue
    const instrumentId = await upsertInstrument(ctx, ownerId, c)
    const day = Math.floor(asOf / DAY_MS)
    const same = (
      await ctx.db
        .query('holdings')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
    ).filter(
      (h) => h.accountId === account._id && Math.floor(h.asOf / DAY_MS) === day,
    )
    for (const h of same) await ctx.db.delete(h._id)
    /* What went in for it, by the trades up to that day: buys less what
       sells brought back (holdings' "paid"). Carried on the look, so a
       coin whose fees the trades miss by a little still says it. */
    const upTo = (
      await ctx.db
        .query('trades')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
    ).filter((t) => t.accountId === account._id && t.occurredAt <= asOf)
    await ctx.db.insert('holdings', {
      ownerId,
      accountId: account._id,
      instrumentId,
      shares: p.shares,
      paidEur: heldCost(upTo),
      asOf,
      importId: intake._id,
    })
  }
}

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

type HoldingRow = {
  candidate: Candidate
  isin?: string
  shares: number
  paidEur?: number
  sharesCalculated?: boolean
}

/* What one share of a ticker no market prices was worth on the screen:
   its printed value ÷ its shares (UNPRICED). */
function screenPriceEur(
  positions: ReadonlyArray<NonNullable<Doc<'intakes'>['positions']>[number]>,
  symbol: string,
): number | undefined {
  for (const p of positions) {
    const c = p.preferred !== undefined ? p.candidates[p.preferred] : undefined
    if (c?.type !== UNPRICED || c.symbol !== symbol) continue
    if (p.valueEur !== undefined && p.shares !== undefined && p.shares > 0)
      return p.valueEur / p.shares
  }
  return undefined
}

/* The broker's value of a share no market prices, as a stored reading:
   attributed to its screen, as of the look. A second look the same day
   replaces it, as storePrices does a close. */
async function writeScreenPrice(
  ctx: MutationCtx,
  ownerId: string,
  instrumentId: Id<'instruments'>,
  account: Doc<'accounts'>,
  read: { priceEur: number; asOf: number },
) {
  const inst = await ctx.db.get(instrumentId)
  if (inst !== null && inst.currency !== 'EUR')
    await ctx.db.patch(instrumentId, { currency: 'EUR' })
  const day = new Date(read.asOf).toISOString().slice(0, 10)
  const same = await ctx.db
    .query('prices')
    .withIndex('by_owner_instrument_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('instrumentId', instrumentId)
        .gte('asOf', read.asOf - 86_400_000),
    )
    .take(10)
  for (const p of same)
    if (new Date(p.asOf).toISOString().slice(0, 10) === day)
      await ctx.db.delete(p._id)
  await ctx.db.insert('prices', {
    ownerId,
    instrumentId,
    price: Math.round(read.priceEur * 10000) / 10000,
    currency: 'EUR',
    asOf: read.asOf,
    fetchedAt: Date.now(),
    source: screenSource(account.name),
  })
}

/* A broker screen written as it was seen — shared by the check screen and
   a batch's apply. */
async function writeHoldings(
  ctx: MutationCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  account: Doc<'accounts'>,
  look: {
    asOf: number
    dayStart: number
    rows: ReadonlyArray<HoldingRow>
    cashEur?: number
    /* Every screen of the look, when more than one went in together. */
    screens?: ReadonlyArray<Doc<'intakes'>>
  },
) {
  if (!account.kinds.includes('broker')) {
    throw new ConvexError(`${account.name} is not a broker.`)
  }
  if (look.rows.length === 0 && look.cashEur === undefined) {
    throw new ConvexError('Keep at least one row, or the cash.')
  }
  if (look.asOf > Date.now() + 5 * 60_000) {
    throw new ConvexError('A screen shows what already is.')
  }
  for (const row of look.rows) {
    if (!Number.isFinite(row.shares) || row.shares <= 0 || row.shares > 1e9)
      throw new ConvexError('That is not a number of shares.')
    if (
      row.paidEur !== undefined &&
      (!Number.isFinite(row.paidEur) || row.paidEur <= 0 || row.paidEur > 1e9)
    )
      throw new ConvexError('That is not what was paid.')
  }
  /* What the account holds already, by the ticker before its exchange:
     a second screen of the same fund lands on the same holding, whatever
     listing its search found this time (3 Oct: VUAA.L then VUAA.MI, SHLD.L
     then the US SHLD — each a second copy of one position). */
  /* Same root and same issuer: SHLD.L (iShares) is not the US SHLD
     (Global X), and a frozen share only ever matches a frozen one — a
     screen price never lands on a listing Yahoo prices. */
  const held = new Map<Id<'instruments'>, Doc<'instruments'>>()
  for (const h of await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .take(MAX_TRADES)) {
    const inst = held.has(h.instrumentId)
      ? null
      : await ctx.db.get(h.instrumentId)
    if (inst !== null) held.set(inst._id, inst)
  }
  const heldFor = (c: Candidate): Id<'instruments'> | undefined => {
    const same = [...held.values()].filter(
      (i) =>
        tickerBase(i.symbol) === tickerBase(c.symbol) &&
        (i.type === UNPRICED) === (c.type === UNPRICED),
    )
    const exact = same.find((i) => i.symbol === c.symbol)
    if (exact) return exact._id
    const k = sameCompany({ name: c.name }, same)
    return k >= 0 ? same[k]._id : undefined
  }
  const symbols = look.rows.map((r) => r.candidate.symbol)
  if (new Set(symbols).size !== symbols.length) {
    throw new ConvexError('Two rows are the same ticker — keep one.')
  }
  let replaced = 0
  /* Two rows on one held position (VUAA.L and VUAA.MI on one screen) are
     one fund twice. */
  const written = new Set<Id<'instruments'>>()
  for (const row of look.rows) {
    const instrumentId =
      heldFor(row.candidate) ??
      (await upsertInstrument(ctx, ownerId, row.candidate, row.isin))
    if (written.has(instrumentId))
      throw new ConvexError('Two rows are the same ticker — keep one.')
    written.add(instrumentId)
    if (row.candidate.type === UNPRICED) {
      const price = screenPriceEur(
        (look.screens ?? [intake]).flatMap((i) => i.positions ?? []),
        row.candidate.symbol,
      )
      if (price === undefined)
        throw new ConvexError(
          `${row.candidate.symbol} has no price — not on the market, not on the screen.`,
        )
      await writeScreenPrice(ctx, ownerId, instrumentId, account, {
        priceEur: price,
        asOf: look.asOf,
      })
    }
    const before = await ctx.db
      .query('holdings')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(MAX_TRADES)
    for (const h of before) {
      if (
        h.accountId === account._id &&
        Math.abs(h.asOf - look.asOf) < SAME_LOOK_MS
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
      asOf: look.asOf,
      importId: intake._id,
    })
  }
  if (look.cashEur !== undefined) {
    if (!account.currencies.includes('EUR')) {
      throw new ConvexError(`${account.name} does not hold euros.`)
    }
    await writeBalance(
      ctx,
      ownerId,
      account,
      'EUR',
      look.cashEur,
      look.dayStart,
      undefined,
      sourceOf(intake),
    )
  }
  await ctx.db.patch(intake._id, {
    status: 'done',
    keptUntil: keepUntil(),
    accountId: account._id,
  })
  return { positions: look.rows.length, replaced }
}

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
    rows: v.array(
      v.object({
        at: v.number(),
        text: v.string(),
        amount: v.number(),
        currency: v.string(),
        pending: v.boolean(),
        landed: v.boolean(),
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
      rows: (intake.transactions ?? [])
        .map((r) => ({
          at: r.occurredAt,
          text: r.merchant,
          amount: r.amount,
          currency: r.currency,
          pending: r.pending,
          landed: written.has(
            `${r.occurredAt}:${Math.abs(r.amount).toFixed(2)}`,
          ),
        }))
        .sort((a, b) => b.at - a.at),
    }
  },
})

/* ---- UPDATE ALL: the review of a whole batch, per account ------------ */

const MAX_ACCOUNT_ROWS = 300
const MISSING_TEXT = 'Missing from the file'

const monthState = v.union(
  v.literal('none'),
  v.literal('had'),
  v.literal('add'),
  v.literal('hole'),
)
const reading = v.object({ asOf: v.number(), value: v.number() })

const batchAsk = v.union(
  /* Read, but nothing on it says whose — a screenshot, mostly. */
  v.object({
    kind: v.literal('whose'),
    intakeId: v.id('intakes'),
    name: v.string(),
    image: v.boolean(),
    /* What it found, so he can tell which it is. */
    what: v.union(
      v.literal('transactions'),
      v.literal('holdings'),
      v.literal('trades'),
    ),
    rows: v.number(),
    from: v.union(v.number(), v.null()),
    to: v.union(v.number(), v.null()),
    investedEur: v.union(v.number(), v.null()),
    cashEur: v.union(v.number(), v.null()),
    seen: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal('hole'),
    accountId: v.id('accounts'),
    month: v.string(),
  }),
  v.object({
    kind: v.literal('oneSide'),
    intakeId: v.id('intakes'),
    index: v.number(),
    accountId: v.id('accounts'),
    amount: v.number(),
    occurredAt: v.number(),
    merchant: v.string(),
    /* The account it trades money with most — offered first. */
    likely: v.union(v.id('accounts'), v.null()),
  }),
  v.object({
    kind: v.literal('gap'),
    key: v.string(),
    accountId: v.id('accounts'),
    from: v.number(),
    to: v.number(),
    gap: v.number(),
  }),
  /* A broker screen with positions the app cannot complete on its own —
     checked on the screen that can. */
  v.object({
    kind: v.literal('holdings'),
    intakeId: v.id('intakes'),
    name: v.string(),
    accountId: v.id('accounts'),
    missing: v.number(),
    positions: v.number(),
  }),
  v.object({
    kind: v.literal('failed'),
    intakeId: v.id('intakes'),
    name: v.string(),
    image: v.boolean(),
    error: v.string(),
    retryable: v.boolean(),
  }),
)

const batchAccount = v.object({
  /* His account — or null for a bank the app knows that he has not added:
     the block shows what the files say, and one tap keeps it. */
  accountId: v.union(v.id('accounts'), v.null()),
  product: v.union(
    v.object({
      id: v.string(),
      name: v.string(),
      accountTail: v.union(v.string(), v.null()),
      holder: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  leftOut: v.boolean(),
  files: v.array(
    v.object({
      intakeId: v.id('intakes'),
      name: v.string(),
      kind: v.union(
        v.literal('transactions'),
        v.literal('holdings'),
        v.literal('trades'),
      ),
      image: v.boolean(),
    }),
  ),
  fresh: v.number(),
  had: v.number(),
  trades: v.number(),
  holdings: v.union(
    v.object({
      positions: v.number(),
      investedEur: v.number(),
      cashEur: v.union(v.number(), v.null()),
      totalEur: v.union(v.number(), v.null()),
      complete: v.boolean(),
    }),
    v.null(),
  ),
  first: v.union(reading, v.null()),
  last: v.union(reading, v.null()),
  months: v.array(monthState),
  gaps: v.number(),
  /* Pending rows that explain the last balance (an app's "Pending −1,205"
     already taken off what it shows). */
  pending: v.number(),
  rows: v.array(
    v.object({
      occurredAt: v.number(),
      merchant: v.string(),
      amount: v.number(),
      kind: v.union(v.literal('spend'), v.literal('income'), v.literal('move')),
      category: v.union(v.string(), v.null()),
      had: v.boolean(),
      pending: v.boolean(),
    }),
  ),
})

/** Signed as the account sees it: money out is negative. */
function signedLog(l: Doc<'logs'>): number {
  const value = l.value ?? 0
  return l.kind === 'expense' ? -value : value
}

const isImage = (i: Doc<'intakes'>) =>
  (i.files ?? []).some((f) => f.contentType.startsWith('image/'))

/* What a broker's screens in one drop show together: Trading 212 puts
   the positions on one screen and the cash on another (3 Oct). */
function mergedHoldings(list: ReadonlyArray<Doc<'intakes'>>) {
  const screens = list.filter((i) => i.kind === 'holdings')
  if (screens.length === 0) return null
  /* Two scrolls of one list overlap (3 Oct: IMG_9239 and IMG_9250 both
     show the six ETFs): one position per fund, the later reading's. */
  const byFund = new Map<
    string,
    NonNullable<Doc<'intakes'>['positions']>[number]
  >()
  for (const i of [...screens].sort(
    (a, b) => (a.readAt ?? a._creationTime) - (b.readAt ?? b._creationTime),
  ))
    for (const p of i.positions ?? []) {
      const c =
        p.preferred !== undefined && p.preferred >= 0
          ? p.candidates[p.preferred]
          : undefined
      byFund.set(c ? tickerBase(c.symbol) : `name:${p.name}`, p)
    }
  const positions = [...byFund.values()]
  const rows = positions.map((p) => {
    const c = completePosition(p, p.todayPriceEur)
    /* -1: no listing's price fits what the screen printed — asked, not
       filed under the first search hit. */
    const pick =
      p.preferred === undefined
        ? p.candidates.at(0)
        : p.preferred >= 0
          ? p.candidates[p.preferred]
          : undefined
    const paid =
      p.valueEur !== undefined &&
      p.changePct !== undefined &&
      p.changePct > -100
        ? Math.round((p.valueEur / (1 + p.changePct / 100)) * 100) / 100
        : undefined
    return pick !== undefined && c.shares !== undefined && c.shares > 0
      ? {
          candidate: pick,
          isin: p.isin,
          shares: c.shares,
          paidEur: paid,
          sharesCalculated: c.sharesCalculated || undefined,
        }
      : null
  })
  const cash = screens.find((i) => i.cashEur !== undefined)?.cashEur
  /* One screen's total may be the positions alone (212's list: €2,014),
     another the whole account (its summary: €15,008): the account's is
     the larger. */
  const totals = screens.flatMap((i) =>
    i.totalEur === undefined ? [] : [i.totalEur],
  )
  const total = totals.length ? Math.max(...totals) : undefined
  return {
    screens,
    rows,
    cashEur: cash ?? null,
    totalEur: total ?? null,
    investedEur:
      Math.round(positions.reduce((t, p) => t + (p.valueEur ?? 0), 0) * 100) /
      100,
    missing: rows.filter((r) => r === null).length,
  }
}

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

/* The batch gathered per account — what the review shows, and what an
   apply needs to resolve its transfers before writing. */
async function gatherBatch(
  ctx: QueryCtx,
  ownerId: string,
  b: Doc<'batches'>,
  names?: ReadonlyArray<string>,
) {
  const intakes = await batchIntakes(ctx, ownerId, b._id)
  const accounts = await liveAccounts(ctx, ownerId)
  const ready = intakes.every((i) => i.status !== 'reading')
  const live = intakes.filter((i) => i.status === 'ready')

  const asks: Array<typeof batchAsk.type> = []
  for (const i of intakes.filter((x) => x.status === 'failed'))
    asks.push({
      kind: 'failed',
      intakeId: i._id,
      name: i.files?.[0]?.name ?? 'file',
      image: isImage(i),
      error: i.error ?? 'It could not be read.',
      retryable: i.retryable ?? false,
    })

  /* Where each read file goes: one of his accounts, a bank he has not
     added (a block of its own), or — nothing says — asked. */
  type Group = {
    key: string
    accountId: Id<'accounts'> | null
    product: (typeof batchAccount.type)['product']
    list: Array<Doc<'intakes'>>
  }
  const groups = new Map<string, Group>()
  for (const i of live) {
    const here = headingFor(i, accounts)
    const s = here === null ? suggestFor(i) : null
    if (here === null && s === null) {
      const times = [
        ...(i.transactions ?? []).map((r) => r.occurredAt),
        ...(i.trades ?? []).map((r) => r.occurredAt),
      ]
      const held = mergedHoldings([i])
      asks.push({
        kind: 'whose',
        intakeId: i._id,
        name: i.files?.[0]?.name ?? 'file',
        image: isImage(i),
        what: i.kind ?? 'transactions',
        rows:
          (i.transactions?.length ?? 0) +
          (i.trades?.length ?? 0) +
          (i.positions?.length ?? 0),
        from: times.length ? Math.min(...times) : null,
        to: times.length ? Math.max(...times) : null,
        investedEur: held?.investedEur ?? null,
        cashEur: held?.cashEur ?? null,
        seen: i.institution ?? null,
      })
      continue
    }
    const key = here ?? `new:${s?.product}`
    const g = groups.get(key)
    if (g) g.list.push(i)
    else
      groups.set(key, {
        key,
        accountId: here,
        product: s
          ? {
              id: s.product,
              name: s.name,
              accountTail: s.accountTail,
              holder: i.holderName ?? null,
            }
          : null,
        list: [i],
      })
  }

  /* Every file's own review, the same one a single file gets. */
  const reviews = new Map<
    Id<'intakes'>,
    Awaited<ReturnType<typeof buildReview>>
  >()
  for (const g of groups.values())
    for (const i of g.list)
      if (i.kind === 'transactions')
        reviews.set(i._id, await buildReview(ctx, ownerId, i, names))

  const allTimes = [...groups.values()].flatMap((g) =>
    g.list.flatMap((i) => [
      ...(i.transactions ?? []).map((r) => r.occurredAt),
      ...(i.trades ?? []).map((r) => r.occurredAt),
    ]),
  )
  const months = reviewMonths(allTimes)
  const span = months.length
    ? {
        from: monthStart(months[0]),
        to: monthStart(months[months.length - 1], 1),
      }
    : null

  const answered = new Map(
    b.moves.map((m) => [`${m.intakeId}:${m.index}`, m.otherAccountId]),
  )
  const own: Array<OwnRow<string>> = []
  const ownInfo = new Map<
    string,
    { intakeId: Id<'intakes'>; index: number; merchant: string }
  >()
  const out: Array<typeof batchAccount.type> = []
  /* Which of his accounts each one trades money with, most often — the
     likely other side of a move nothing in the drop explains. */
  const partners = new Map<string, Map<Id<'accounts'>, number>>()
  const tally = (from: string, to: Id<'accounts'>) => {
    const m = partners.get(from) ?? new Map<Id<'accounts'>, number>()
    m.set(to, (m.get(to) ?? 0) + 1)
    partners.set(from, m)
  }

  for (const g of groups.values()) {
    const accountId = g.accountId
    const leftOut = accountId !== null && b.leftOut.includes(accountId)
    const had =
      span && accountId
        ? await ctx.db
            .query('logs')
            .withIndex('by_owner_account_time', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('accountId', accountId)
                .gte('occurredAt', span.from)
                .lt('occurredAt', span.to),
            )
            .take(HISTORY_ROWS)
        : []
    if (accountId)
      for (const l of had)
        if (l.kind === 'move' && l.meta?.otherAccountId)
          tally(accountId, l.meta.otherAccountId)
    let newRows = 0
    let hadRows = 0
    let trades = 0
    const adds: Array<number> = []
    const ledger: Array<{ occurredAt: number; amount: number }> = had.map(
      (l) => ({ occurredAt: l.occurredAt, amount: signedLog(l) }),
    )
    const pendingRows: Array<{ occurredAt: number; amount: number }> = []
    const balances: Array<{ asOf: number; value: number }> = []
    const rows: Array<(typeof batchAccount.type)['rows'][number]> = []
    for (const i of g.list) {
      /* A broker screen's total is not a bank balance (3 Oct: Trading
         212's two screens drew "€15,008.26 → €2,014.04"). */
      if (i.balance && i.kind === 'transactions')
        balances.push({ asOf: i.balance.asOf, value: i.balance.value })
      trades += (i.trades?.length ?? 0) + (i.historyTrades ?? 0)
      for (const t of i.trades ?? []) adds.push(t.occurredAt)
      const r = reviews.get(i._id)
      if (!r) continue
      for (const row of r.rows) {
        const dup = row.duplicateOf !== null
        rows.push({
          occurredAt: row.occurredAt,
          merchant: row.merchant,
          amount: row.amount,
          kind: row.kind,
          category: row.category,
          had: dup,
          pending: row.pending,
        })
        if (row.pending) {
          pendingRows.push({ occurredAt: row.occurredAt, amount: row.amount })
          continue
        }
        if (dup) hadRows++
        else {
          newRows++
          adds.push(row.occurredAt)
          ledger.push({ occurredAt: row.occurredAt, amount: row.amount })
        }
        if (row.kind === 'move' && !dup && !leftOut) {
          const key = `${i._id}:${row.index}`
          const answer = answered.get(key)
          own.push({
            key,
            accountId: accountId ?? g.key,
            amount: row.amount,
            occurredAt: row.occurredAt,
            otherAccountId:
              answer === undefined ? row.otherAccountId : (answer ?? 'outside'),
          })
          ownInfo.set(key, {
            intakeId: i._id,
            index: row.index,
            merchant: row.merchant,
          })
        }
      }
    }
    if (accountId)
      for (const e of b.extras.filter((x) => x.accountId === accountId))
        ledger.push({ occurredAt: e.occurredAt, amount: e.amount })
    balances.sort((x, y) => x.asOf - y.asOf)
    const quiet = accountId
      ? b.quietMonths
          .filter((q) => q.accountId === accountId)
          .map((q) => q.month)
      : []
    const cover = coverage(
      months,
      had.map((l) => l.occurredAt),
      adds,
      quiet,
    )
    /* A gap the pending rows account for is not one: the app showed the
       balance with them already taken off. */
    let pending = 0
    const gaps = balanceGaps(balances, ledger).filter((gap) => {
      if (accountId && b.dismissed.includes(`gap:${accountId}:${gap.from}`))
        return false
      const inside = pendingRows
        .filter(
          (p) =>
            p.occurredAt > gap.from - DAY_MS && p.occurredAt <= gap.to + DAY_MS,
        )
        .reduce((t, p) => t + Math.round(p.amount * 100), 0)
      if (inside !== 0 && inside === Math.round(gap.gap * 100)) {
        pending += inside / 100
        return false
      }
      return true
    })
    const held = mergedHoldings(g.list)
    if (accountId && !leftOut) {
      for (const c of cover)
        if (c.state === 'hole')
          asks.push({ kind: 'hole', accountId, month: c.month })
      for (const gap of gaps)
        asks.push({
          kind: 'gap',
          key: `gap:${accountId}:${gap.from}`,
          accountId,
          ...gap,
        })
      if (held && held.missing > 0)
        asks.push({
          kind: 'holdings',
          intakeId: held.screens[0]._id,
          name: held.screens[0].files?.[0]?.name ?? 'file',
          accountId,
          missing: held.missing,
          positions: held.rows.length,
        })
    }
    rows.sort((x, y) => y.occurredAt - x.occurredAt)
    out.push({
      accountId,
      product: accountId ? null : g.product,
      leftOut,
      files: g.list.map((i) => ({
        intakeId: i._id,
        name: i.files?.[0]?.name ?? 'file',
        kind: i.kind ?? 'transactions',
        image: isImage(i),
      })),
      fresh: newRows,
      had: hadRows,
      trades,
      holdings: held
        ? {
            positions: held.rows.length,
            investedEur: held.investedEur,
            cashEur: held.cashEur,
            totalEur: held.totalEur,
            complete: held.missing === 0,
          }
        : null,
      first: balances.at(0) ?? null,
      last: balances.at(-1) ?? null,
      months: cover.map((c) => c.state),
      gaps: gaps.length,
      pending: Math.round(pending * 100) / 100,
      rows: rows.slice(0, MAX_ACCOUNT_ROWS),
    })
  }

  const { pairs, oneSide } = pairAcross(own)
  const byKey = new Map(own.map((r) => [r.key, r]))
  const real = (id: string): id is Id<'accounts'> =>
    !id.startsWith('new:') && id !== 'outside'

  /* The other side may be in the app already, not in this drop: BPI's
     €300 to ActivoBank on 27 Aug, when ActivoBank's +€300 was read last
     week (3 Oct). Matched by amount and days in the account the row
     names — or, naming none, in any of his others. */
  const inDrop = new Set(pairs.flat())
  const stored: Array<{
    key: string
    otherAccountId: Id<'accounts'>
    occurredAt: number
  }> = []
  const taken = new Set<Id<'logs'>>()
  for (const r of own) {
    if (inDrop.has(r.key) || !real(r.accountId)) continue
    if (r.otherAccountId === 'outside') continue
    const others =
      r.otherAccountId !== null && real(r.otherAccountId)
        ? [r.otherAccountId]
        : accounts.map((a) => a._id).filter((id) => id !== r.accountId)
    for (const other of others) {
      const near = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', other)
            .gte('occurredAt', r.occurredAt - 2 * DAY_MS - 3_600_000)
            .lte('occurredAt', r.occurredAt + 2 * DAY_MS + 3_600_000),
        )
        .take(200)
      const hit = near.find(
        (l) =>
          l.kind === 'move' &&
          !taken.has(l._id) &&
          l.meta?.pairOf === undefined &&
          Math.round(((l.value ?? 0) + r.amount) * 100) === 0,
      )
      if (hit) {
        taken.add(hit._id)
        stored.push({
          key: r.key,
          otherAccountId: other,
          occurredAt: hit.occurredAt,
        })
        break
      }
    }
  }
  const storedKeys = new Set(stored.map((x) => x.key))
  for (const x of stored) {
    const r = byKey.get(x.key)
    if (r && real(r.accountId)) {
      tally(r.accountId, x.otherAccountId)
      tally(x.otherAccountId, r.accountId)
    }
  }
  for (const [a, c] of pairs) {
    const x = byKey.get(a)
    const y = byKey.get(c)
    if (x && y && real(x.accountId) && real(y.accountId)) {
      tally(x.accountId, y.accountId)
      tally(y.accountId, x.accountId)
    }
  }
  const likelyFor = (id: Id<'accounts'>) =>
    [...(partners.get(id) ?? new Map<Id<'accounts'>, number>())]
      .filter(([other]) => other !== id)
      .sort((p, q) => q[1] - p[1])
      .at(0)?.[0] ?? null

  for (const key of oneSide) {
    const r = byKey.get(key)
    const info = ownInfo.get(key)
    if (!r || !info || !real(r.accountId) || storedKeys.has(key)) continue
    asks.push({
      kind: 'oneSide',
      intakeId: info.intakeId,
      index: info.index,
      accountId: r.accountId,
      amount: r.amount,
      occurredAt: r.occurredAt,
      merchant: info.merchant,
      likely: likelyFor(r.accountId),
    })
  }
  const moves = pairs.flatMap(([a, c]) => {
    const x = byKey.get(a)
    const y = byKey.get(c)
    if (!x || !y || !real(x.accountId) || !real(y.accountId)) return []
    return [
      {
        fromAccountId: x.accountId,
        toAccountId: y.accountId,
        amount: Math.abs(x.amount),
        occurredAt: Math.min(x.occurredAt, y.occurredAt),
        days: Math.round(Math.abs(x.occurredAt - y.occurredAt) / DAY_MS),
        had: false,
      },
    ]
  })
  for (const x of stored) {
    const r = byKey.get(x.key)
    if (!r || !real(r.accountId)) continue
    const leaving = r.amount < 0
    moves.push({
      fromAccountId: leaving ? r.accountId : x.otherAccountId,
      toAccountId: leaving ? x.otherAccountId : r.accountId,
      amount: Math.abs(r.amount),
      occurredAt: Math.min(r.occurredAt, x.occurredAt),
      days: Math.round(Math.abs(r.occurredAt - x.occurredAt) / DAY_MS),
      had: true,
    })
  }

  const order = new Map(accounts.map((a, i) => [a._id, i]))
  out.sort(
    (x, y) =>
      (x.accountId === null ? 1e6 : (order.get(x.accountId) ?? 0)) -
      (y.accountId === null ? 1e6 : (order.get(y.accountId) ?? 0)),
  )
  return {
    status: b.status,
    ready,
    months,
    accounts: out,
    asks,
    moves: moves.sort((x, y) => y.occurredAt - x.occurredAt),
    files: intakes.length,
    pairs: pairs.filter(([a, c]) => {
      const x = byKey.get(a)
      const y = byKey.get(c)
      return x && y && real(x.accountId) && real(y.accountId)
    }),
    ownInfo,
    stored,
    accountOf: new Map(
      own
        .filter((r) => real(r.accountId))
        .map((r) => [r.key, r.accountId as Id<'accounts'>]),
    ),
  }
}

/* The first moment of a "2026-03" month, or `plus` months after it. */
function monthStart(key: string, plus = 0): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1 + plus, 1).getTime()
}

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
  args: { batchId: v.id('batches'), dayStart: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await openBatchFor(ctx, ownerId, args.batchId)
    const identity = await ctx.auth.getUserIdentity()
    const names = identity?.name ? [identity.name] : []
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
    await ctx.db.patch(b._id, {
      status: 'applying',
      moves,
      applied: {
        intakes: 0,
        rows: 0,
        accounts: g.accounts.filter((x) => !x.leftOut).length,
      },
    })
    await ctx.scheduler.runAfter(0, internal.intake.applyStep, {
      batchId: b._id,
      dayStart: args.dayStart,
      names,
    })
    return null
  },
})

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
        .filter((r) => !r.pending && r.duplicateOf === null)
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
      const done = await writeTransactions(ctx, ownerId, intake, account, {
        rows: keep,
        keepBalance: true,
        dayStart: args.dayStart,
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
      const done = await writeHoldings(ctx, ownerId, intake, account, {
        asOf: Date.now(),
        dayStart: args.dayStart,
        rows: merged.rows.filter((r) => r !== null),
        cashEur: merged.cashEur ?? undefined,
        screens,
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
      rows = await applyHistoryChunk(ctx, ownerId, intake, account)
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
) {
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
    return pick ? [{ index, trade: t, candidate: pick }] : []
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
    ...(said.length
      ? {
          note: [intake.note, `Left out, no ticker found: ${said.join(', ')}.`]
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

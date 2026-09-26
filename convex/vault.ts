import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { requireLanguageArea } from './areas'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { areaSlug } from './schema'
import {
  MAX_READ_BYTES,
  READING_MODEL,
  READING_WINDOW_MS,
  READINGS_PER_WINDOW,
  readableKind,
} from '../src/lib/reading'
import { languageByCode } from '../src/lib/languages/catalog'

/* The Vault (R7a, 26 Sep; docs/specs/2026-09-26-r7a-vault.md). Artem: "I
   have sometimes pages (pdf) with what we learned in class or homework …
   store it and attach to class I had, and a tool that will analyze what is
   inside and make a summary + conclusion."

   A sheet is an `attachments` row with `area` (the language) and, when he
   says which, `logId` (the session). The note/task functions in
   attachments.ts never see these rows and these never see theirs. Attaching
   one asks for its reading at once — a `readings` row, then the action in
   ai/read.ts — so the model reads it once and it is never sent again. */

const MAX_ROWS = 200

const wordValidator = v.object({ term: v.string(), meaning: v.string() })
const exampleValidator = v.object({ sentence: v.string(), meaning: v.string() })

/* A reading may be asked for only while fewer than READINGS_PER_WINDOW were
   asked for in the last 30 days — a count of `readings` rows, the only
   thing that says what the Vault has spent. */
async function requireReadingAllowed(
  ctx: MutationCtx,
  ownerId: string,
  now: number,
): Promise<void> {
  const recent = await ctx.db
    .query('readings')
    .withIndex('by_owner_time', (q) =>
      q.eq('ownerId', ownerId).gte('requestedAt', now - READING_WINDOW_MS),
    )
    .take(READINGS_PER_WINDOW + 1)
  if (recent.length >= READINGS_PER_WINDOW) {
    const frees = new Date(recent[0].requestedAt + READING_WINDOW_MS)
    throw new ConvexError(
      `That's ${READINGS_PER_WINDOW} sheets read in 30 days — the most the Vault reads. The next one frees up on ${frees.toDateString()}.`,
    )
  }
}

async function askForReading(
  ctx: MutationCtx,
  ownerId: string,
  attachmentId: Id<'attachments'>,
): Promise<void> {
  const now = Date.now()
  await requireReadingAllowed(ctx, ownerId, now)
  const readingId = await ctx.db.insert('readings', {
    ownerId,
    attachmentId,
    status: 'reading',
    model: READING_MODEL,
    requestedAt: now,
  })
  await ctx.scheduler.runAfter(0, internal.ai.read.readDocument, { readingId })
}

async function ownedSheet(
  ctx: MutationCtx,
  ownerId: string,
  attachmentId: Id<'attachments'>,
): Promise<Doc<'attachments'>> {
  const row = await ctx.db.get(attachmentId)
  if (row === null || row.ownerId !== ownerId || row.area === undefined) {
    throw new Error('No such sheet')
  }
  return row
}

async function readingOf(
  ctx: MutationCtx,
  ownerId: string,
  attachmentId: Id<'attachments'>,
): Promise<Doc<'readings'> | null> {
  return await ctx.db
    .query('readings')
    .withIndex('by_owner_attachment', (q) =>
      q.eq('ownerId', ownerId).eq('attachmentId', attachmentId),
    )
    .order('desc')
    .first()
}

/* Why a refusal is returned, not thrown: a mutation that throws rolls back
   everything it did — the storage delete included — so the refused file
   would stay stored with nothing pointing at it. Returning lets the delete
   commit. */
async function refusal(
  ctx: MutationCtx,
  ownerId: string,
  args: {
    area: string
    logId?: Id<'logs'>
    contentType: string
    size: number
  },
): Promise<string | null> {
  try {
    await requireLanguageArea(ctx, ownerId, args.area)
  } catch {
    return 'Not a language area.'
  }
  if (args.logId !== undefined) {
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) return 'No such session.'
    if (log.area !== args.area) {
      return 'That session is filed under another language.'
    }
  }
  if (readableKind(args.contentType) === null) {
    return 'The Vault reads PDFs and photos (JPG, PNG, WebP).'
  }
  if (args.size > MAX_READ_BYTES) return 'That file is larger than 10 MB.'
  try {
    await requireReadingAllowed(ctx, ownerId, Date.now())
  } catch (error) {
    return error instanceof ConvexError ? String(error.data) : 'Over the cap.'
  }
  return null
}

/**
 * Step two of an upload (the URL is attachments.generateUploadUrl): the
 * file is stored, this files it under a language — and a session, when
 * given — and asks for its reading. When it is not a file the reader can
 * see, too big, not his, or over the cap, the bytes are taken back out and
 * the reason comes back to be shown.
 */
export const add = mutation({
  args: {
    area: areaSlug,
    logId: v.optional(v.id('logs')),
    storageId: v.id('_storage'),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), attachmentId: v.id('attachments') }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const refused = await refusal(ctx, ownerId, args)
    if (refused !== null) {
      await ctx.storage.delete(args.storageId)
      return { ok: false as const, error: refused }
    }

    const attachmentId = await ctx.db.insert('attachments', {
      ownerId,
      area: args.area,
      logId: args.logId,
      storageId: args.storageId,
      name: args.name.trim() || 'sheet',
      contentType: args.contentType,
      size: args.size,
    })
    await askForReading(ctx, ownerId, attachmentId)
    return { ok: true as const, attachmentId }
  },
})

const sheetValidator = v.object({
  _id: v.id('attachments'),
  _creationTime: v.number(),
  name: v.string(),
  contentType: v.string(),
  url: v.union(v.string(), v.null()),
  revisedAt: v.optional(v.number()),
  session: v.union(
    v.null(),
    v.object({
      logId: v.id('logs'),
      category: v.union(v.string(), v.null()),
      occurredAt: v.number(),
    }),
  ),
  reading: v.union(
    v.null(),
    v.object({
      status: v.union(
        v.literal('reading'),
        v.literal('done'),
        v.literal('failed'),
      ),
      title: v.optional(v.string()),
      kind: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      text: v.optional(v.string()),
      summary: v.optional(v.string()),
      conclusion: v.optional(v.string()),
      words: v.optional(v.array(wordValidator)),
      examples: v.optional(v.array(exampleValidator)),
      model: v.string(),
      requestedAt: v.number(),
      readAt: v.optional(v.number()),
      error: v.optional(v.string()),
    }),
  ),
})

/** A language's sheets, newest first, each with its session and reading. */
export const list = query({
  args: { area: areaSlug },
  returns: v.array(sheetValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('attachments')
      .withIndex('by_owner_area', (q) =>
        q.eq('ownerId', ownerId).eq('area', args.area),
      )
      .order('desc')
      .take(MAX_ROWS)
    const out = []
    for (const row of rows) {
      const log = row.logId === undefined ? null : await ctx.db.get(row.logId)
      const reading = await ctx.db
        .query('readings')
        .withIndex('by_owner_attachment', (q) =>
          q.eq('ownerId', ownerId).eq('attachmentId', row._id),
        )
        .order('desc')
        .first()
      out.push({
        _id: row._id,
        _creationTime: row._creationTime,
        name: row.name,
        contentType: row.contentType,
        url: await ctx.storage.getUrl(row.storageId),
        revisedAt: row.revisedAt,
        session:
          log === null || log.ownerId !== ownerId
            ? null
            : {
                logId: log._id,
                category: log.meta?.category ?? null,
                occurredAt: log.occurredAt,
              },
        reading:
          reading === null
            ? null
            : {
                status: reading.status,
                title: reading.title,
                kind: reading.kind,
                tags: reading.tags,
                text: reading.text,
                summary: reading.summary,
                conclusion: reading.conclusion,
                words: reading.words,
                examples: reading.examples,
                model: reading.model,
                requestedAt: reading.requestedAt,
                readAt: reading.readAt,
                error: reading.error,
              },
      })
    }
    return out
  },
})

/** How many sheets hang on each of these sessions — History's paperclip. */
export const countsForLogs = query({
  args: { logIds: v.array(v.id('logs')) },
  returns: v.array(v.object({ logId: v.id('logs'), count: v.number() })),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const out = []
    for (const logId of args.logIds.slice(0, MAX_ROWS)) {
      const rows = await ctx.db
        .query('attachments')
        .withIndex('by_owner_log', (q) =>
          q.eq('ownerId', ownerId).eq('logId', logId),
        )
        .take(20)
      if (rows.length > 0) out.push({ logId, count: rows.length })
    }
    return out
  },
})

/**
 * Read it again — after a failure, or to get what a newer reading gives
 * (26 Sep: examples came after his first sheet). Not while it is being
 * read. Counts toward the cap: it is another call.
 */
export const retry = mutation({
  args: { attachmentId: v.id('attachments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedSheet(ctx, ownerId, args.attachmentId)
    const reading = await readingOf(ctx, ownerId, args.attachmentId)
    if (reading !== null && reading.status === 'reading') {
      throw new ConvexError('That sheet is being read right now.')
    }
    await askForReading(ctx, ownerId, args.attachmentId)
    return null
  },
})

/** He went over it: the Revisit strip lets it rest for a while. */
export const markRevised = mutation({
  args: { attachmentId: v.id('attachments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedSheet(ctx, ownerId, args.attachmentId)
    await ctx.db.patch(args.attachmentId, { revisedAt: Date.now() })
    return null
  },
})

/** Gone: the file, the row and what was read in it. */
export const remove = mutation({
  args: { attachmentId: v.id('attachments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const row = await ownedSheet(ctx, ownerId, args.attachmentId)
    const readings = await ctx.db
      .query('readings')
      .withIndex('by_owner_attachment', (q) =>
        q.eq('ownerId', ownerId).eq('attachmentId', row._id),
      )
      .take(MAX_ROWS)
    for (const reading of readings) await ctx.db.delete(reading._id)
    await ctx.storage.delete(row.storageId)
    await ctx.db.delete(row._id)
    return null
  },
})

/**
 * A session is going: its sheets stay, filed under the language, "not
 * linked" — a sheet is what the class handed out, not proof of the class.
 * Called by logs.remove / removeMany.
 */
export async function unlinkSheets(
  ctx: MutationCtx,
  ownerId: string,
  logId: Id<'logs'>,
): Promise<void> {
  const rows = await ctx.db
    .query('attachments')
    .withIndex('by_owner_log', (q) =>
      q.eq('ownerId', ownerId).eq('logId', logId),
    )
    .take(MAX_ROWS)
  for (const row of rows) await ctx.db.patch(row._id, { logId: undefined })
}

/** A session moved to another language takes its sheets with it. */
export async function moveSheets(
  ctx: MutationCtx,
  ownerId: string,
  logId: Id<'logs'>,
  area: string,
): Promise<void> {
  const rows = await ctx.db
    .query('attachments')
    .withIndex('by_owner_log', (q) =>
      q.eq('ownerId', ownerId).eq('logId', logId),
    )
    .take(MAX_ROWS)
  for (const row of rows) await ctx.db.patch(row._id, { area })
}

/* ------------------------------------------------ for ai/read.ts only */

/** What the reader needs: the file, its type, and which language it is. */
export const forReading = internalQuery({
  args: { readingId: v.id('readings') },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.id('_storage'),
      contentType: v.string(),
      language: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const reading = await ctx.db.get(args.readingId)
    if (reading === null || reading.status !== 'reading') return null
    const sheet = await ctx.db.get(reading.attachmentId)
    if (sheet === null || sheet.area === undefined) return null
    const area = await ctx.db
      .query('areas')
      .withIndex('by_owner_slug', (q) =>
        q.eq('ownerId', reading.ownerId).eq('slug', sheet.area as string),
      )
      .unique()
    return {
      storageId: sheet.storageId,
      contentType: sheet.contentType,
      language: languageByCode(area?.lang)?.name ?? area?.label ?? 'language',
    }
  },
})

export const finish = internalMutation({
  args: {
    readingId: v.id('readings'),
    title: v.string(),
    kind: v.string(),
    tags: v.array(v.string()),
    text: v.string(),
    summary: v.string(),
    conclusion: v.string(),
    words: v.array(wordValidator),
    examples: v.array(exampleValidator),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reading = await ctx.db.get(args.readingId)
    /* Removed while it was being read: nothing to write to. */
    if (reading === null) return null
    await ctx.db.patch(args.readingId, {
      status: 'done',
      title: args.title || undefined,
      kind: args.kind,
      tags: args.tags,
      text: args.text,
      summary: args.summary,
      conclusion: args.conclusion,
      words: args.words,
      examples: args.examples,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      readAt: Date.now(),
      error: undefined,
    })
    return null
  },
})

export const fail = internalMutation({
  args: { readingId: v.id('readings'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reading = await ctx.db.get(args.readingId)
    if (reading === null) return null
    await ctx.db.patch(args.readingId, {
      status: 'failed',
      error: args.error.slice(0, 500),
    })
    return null
  },
})

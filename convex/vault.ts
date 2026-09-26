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
import type { MutationCtx, QueryCtx } from './_generated/server'
import { areaSlug } from './schema'
import {
  READING_MODEL,
  READING_WINDOW_MS,
  READINGS_PER_WINDOW,
  pagesRefusal,
} from '../src/lib/reading'
import { languageByCode } from '../src/lib/languages/catalog'

/* The Vault (R7a, 26 Sep; docs/specs/2026-09-26-r7a-vault.md). Artem: "I
   have sometimes pages (pdf) with what we learned in class or homework …
   store it and attach to class I had, and a tool that will analyze what is
   inside and make a summary + conclusion."

   A sheet is a `vaultSheets` row — its language, its session when he says
   which, when he last went over it — and one to five pages, each an
   `attachments` row with `sheetId` (26 Sep: "2-3 sheets to one ANALYZE").
   The note/task functions in attachments.ts never see pages and these never
   see theirs. Adding a sheet asks for its reading at once — a `readings`
   row, then ai/read.ts — every page in one call, stored, never sent again. */

const MAX_ROWS = 200

const wordValidator = v.object({ term: v.string(), meaning: v.string() })
const exampleValidator = v.object({ sentence: v.string(), meaning: v.string() })
const ruleValidator = v.object({
  name: v.string(),
  pattern: v.string(),
  explanation: v.string(),
  examples: v.array(exampleValidator),
})
const fileValidator = v.object({
  storageId: v.id('_storage'),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
})

/* A reading may be asked for only while fewer than READINGS_PER_WINDOW were
   asked for in the last 30 days — a count of `readings` rows, the only
   thing that says what the Vault has spent. A reading of five pages is one
   reading. */
async function readingRefusal(
  ctx: MutationCtx,
  ownerId: string,
  now: number,
): Promise<string | null> {
  const recent = await ctx.db
    .query('readings')
    .withIndex('by_owner_time', (q) =>
      q.eq('ownerId', ownerId).gte('requestedAt', now - READING_WINDOW_MS),
    )
    .take(READINGS_PER_WINDOW + 1)
  if (recent.length < READINGS_PER_WINDOW) return null
  const frees = new Date(recent[0].requestedAt + READING_WINDOW_MS)
  return `That's ${READINGS_PER_WINDOW} sheets read in 30 days — the most the Vault reads. The next one frees up on ${frees.toDateString()}.`
}

async function askForReading(
  ctx: MutationCtx,
  ownerId: string,
  sheetId: Id<'vaultSheets'>,
): Promise<void> {
  const readingId = await ctx.db.insert('readings', {
    ownerId,
    sheetId,
    status: 'reading',
    model: READING_MODEL,
    requestedAt: Date.now(),
  })
  await ctx.scheduler.runAfter(0, internal.ai.read.readDocument, { readingId })
}

async function ownedSheet(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  sheetId: Id<'vaultSheets'>,
): Promise<Doc<'vaultSheets'>> {
  const sheet = await ctx.db.get(sheetId)
  if (sheet === null || sheet.ownerId !== ownerId) {
    throw new Error('No such sheet')
  }
  return sheet
}

async function pagesOf(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  sheetId: Id<'vaultSheets'>,
): Promise<Array<Doc<'attachments'>>> {
  return await ctx.db
    .query('attachments')
    .withIndex('by_owner_sheet', (q) =>
      q.eq('ownerId', ownerId).eq('sheetId', sheetId),
    )
    .take(20)
}

async function readingOf(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  sheetId: Id<'vaultSheets'>,
): Promise<Doc<'readings'> | null> {
  return await ctx.db
    .query('readings')
    .withIndex('by_owner_sheet', (q) =>
      q.eq('ownerId', ownerId).eq('sheetId', sheetId),
    )
    .order('desc')
    .first()
}

/* A refusal is returned, not thrown: a mutation that throws rolls back
   everything it did — the storage deletes included — so refused files
   would stay stored with nothing pointing at them. Returning lets the
   deletes commit. */
async function refuse(
  ctx: MutationCtx,
  files: ReadonlyArray<{ storageId: Id<'_storage'> }>,
  error: string,
): Promise<{ ok: false; error: string }> {
  for (const f of files) await ctx.storage.delete(f.storageId)
  return { ok: false, error }
}

async function insertPages(
  ctx: MutationCtx,
  ownerId: string,
  sheetId: Id<'vaultSheets'>,
  files: ReadonlyArray<{
    storageId: Id<'_storage'>
    name: string
    contentType: string
    size: number
  }>,
): Promise<void> {
  for (const f of files) {
    await ctx.db.insert('attachments', {
      ownerId,
      sheetId,
      storageId: f.storageId,
      name: f.name.trim() || 'page',
      contentType: f.contentType,
      size: f.size,
    })
  }
}

/**
 * Step two of an upload (the URLs are attachments.generateUploadUrl): the
 * pages are stored; this makes them one sheet under a language — and a
 * session, when given — and asks for its reading. When they cannot be a
 * sheet, are not his, or the cap is reached, the bytes are taken back out
 * and the reason comes back to be shown.
 */
export const add = mutation({
  args: {
    area: areaSlug,
    logId: v.optional(v.id('logs')),
    files: v.array(fileValidator),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), sheetId: v.id('vaultSheets') }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    try {
      await requireLanguageArea(ctx, ownerId, args.area)
    } catch {
      return await refuse(ctx, args.files, 'Not a language area.')
    }
    if (args.logId !== undefined) {
      const log = await ctx.db.get(args.logId)
      if (log === null || log.ownerId !== ownerId) {
        return await refuse(ctx, args.files, 'No such session.')
      }
      if (log.area !== args.area) {
        return await refuse(
          ctx,
          args.files,
          'That session is filed under another language.',
        )
      }
    }
    const refused =
      pagesRefusal(args.files) ??
      (await readingRefusal(ctx, ownerId, Date.now()))
    if (refused !== null) return await refuse(ctx, args.files, refused)

    const sheetId = await ctx.db.insert('vaultSheets', {
      ownerId,
      area: args.area,
      logId: args.logId,
    })
    await insertPages(ctx, ownerId, sheetId, args.files)
    await askForReading(ctx, ownerId, sheetId)
    return { ok: true as const, sheetId }
  },
})

/**
 * More pages on a sheet — page 2 handed out next week. Not read on its
 * own: the card offers "read again", which reads every page together.
 */
export const addPages = mutation({
  args: { sheetId: v.id('vaultSheets'), files: v.array(fileValidator) },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const sheet = await ctx.db.get(args.sheetId)
    if (sheet === null || sheet.ownerId !== ownerId) {
      return await refuse(ctx, args.files, 'No such sheet.')
    }
    const already = await pagesOf(ctx, ownerId, sheet._id)
    const refused = pagesRefusal(args.files, already)
    if (refused !== null) return await refuse(ctx, args.files, refused)
    await insertPages(ctx, ownerId, sheet._id, args.files)
    return { ok: true as const }
  },
})

const sheetValidator = v.object({
  _id: v.id('vaultSheets'),
  _creationTime: v.number(),
  revisedAt: v.optional(v.number()),
  pages: v.array(
    v.object({
      _id: v.id('attachments'),
      _creationTime: v.number(),
      name: v.string(),
      contentType: v.string(),
      url: v.union(v.string(), v.null()),
    }),
  ),
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
      rules: v.optional(v.array(ruleValidator)),
      model: v.string(),
      requestedAt: v.number(),
      readAt: v.optional(v.number()),
      error: v.optional(v.string()),
    }),
  ),
})

/** A language's sheets, newest first, each with its pages, session and reading. */
export const list = query({
  args: { area: areaSlug },
  returns: v.array(sheetValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const sheets = await ctx.db
      .query('vaultSheets')
      .withIndex('by_owner_area', (q) =>
        q.eq('ownerId', ownerId).eq('area', args.area),
      )
      .order('desc')
      .take(MAX_ROWS)
    const out = []
    for (const sheet of sheets) {
      const log =
        sheet.logId === undefined ? null : await ctx.db.get(sheet.logId)
      const reading = await readingOf(ctx, ownerId, sheet._id)
      const pages = (await pagesOf(ctx, ownerId, sheet._id)).sort(
        (a, b) => a._creationTime - b._creationTime,
      )
      out.push({
        _id: sheet._id,
        _creationTime: sheet._creationTime,
        revisedAt: sheet.revisedAt,
        pages: await Promise.all(
          pages.map(async (p) => ({
            _id: p._id,
            _creationTime: p._creationTime,
            name: p.name,
            contentType: p.contentType,
            url: await ctx.storage.getUrl(p.storageId),
          })),
        ),
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
                rules: reading.rules,
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
        .query('vaultSheets')
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
 * Read it again — after a failure, after pages were added, or to get what
 * a newer reading gives. Not while it is being read. Counts toward the
 * cap: it is another call.
 */
export const retry = mutation({
  args: { sheetId: v.id('vaultSheets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedSheet(ctx, ownerId, args.sheetId)
    const reading = await readingOf(ctx, ownerId, args.sheetId)
    if (reading !== null && reading.status === 'reading') {
      throw new ConvexError('That sheet is being read right now.')
    }
    const refused = await readingRefusal(ctx, ownerId, Date.now())
    if (refused !== null) throw new ConvexError(refused)
    await askForReading(ctx, ownerId, args.sheetId)
    return null
  },
})

/** He went over it: the Revisit strip lets it rest for a while. */
export const markRevised = mutation({
  args: { sheetId: v.id('vaultSheets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedSheet(ctx, ownerId, args.sheetId)
    await ctx.db.patch(args.sheetId, { revisedAt: Date.now() })
    return null
  },
})

/** One page out of a sheet. The last page goes with the sheet, by remove. */
export const removePage = mutation({
  args: { attachmentId: v.id('attachments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const page = await ctx.db.get(args.attachmentId)
    if (
      page === null ||
      page.ownerId !== ownerId ||
      page.sheetId === undefined
    ) {
      throw new Error('No such page')
    }
    const pages = await pagesOf(ctx, ownerId, page.sheetId)
    if (pages.length <= 1) {
      throw new ConvexError('That is its only page — remove the sheet.')
    }
    await ctx.storage.delete(page.storageId)
    await ctx.db.delete(page._id)
    return null
  },
})

/** Gone: the sheet, its pages and what was read in them. */
export const remove = mutation({
  args: { sheetId: v.id('vaultSheets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const sheet = await ownedSheet(ctx, ownerId, args.sheetId)
    for (const page of await pagesOf(ctx, ownerId, sheet._id)) {
      await ctx.storage.delete(page.storageId)
      await ctx.db.delete(page._id)
    }
    const readings = await ctx.db
      .query('readings')
      .withIndex('by_owner_sheet', (q) =>
        q.eq('ownerId', ownerId).eq('sheetId', sheet._id),
      )
      .take(MAX_ROWS)
    for (const reading of readings) await ctx.db.delete(reading._id)
    await ctx.db.delete(sheet._id)
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
  const sheets = await ctx.db
    .query('vaultSheets')
    .withIndex('by_owner_log', (q) =>
      q.eq('ownerId', ownerId).eq('logId', logId),
    )
    .take(MAX_ROWS)
  for (const sheet of sheets)
    await ctx.db.patch(sheet._id, { logId: undefined })
}

/** A session moved to another language takes its sheets with it. */
export async function moveSheets(
  ctx: MutationCtx,
  ownerId: string,
  logId: Id<'logs'>,
  area: string,
): Promise<void> {
  const sheets = await ctx.db
    .query('vaultSheets')
    .withIndex('by_owner_log', (q) =>
      q.eq('ownerId', ownerId).eq('logId', logId),
    )
    .take(MAX_ROWS)
  for (const sheet of sheets) await ctx.db.patch(sheet._id, { area })
}

/**
 * One time, per deployment (26 Sep): a sheet from R7a's first day was a
 * single page carrying its own language, session and revisit, and its
 * reading named that page. Each becomes a one-page sheet, its reading moves
 * onto the sheet, and the page's old fields are cleared. Safe to run again:
 * a page that already has a sheet is skipped.
 *
 *   npx convex run vault:migrateSheets        (and --prod)
 */
export const migrateSheets = internalMutation({
  args: {},
  returns: v.object({ moved: v.number() }),
  handler: async (ctx) => {
    let moved = 0
    /* The one read here with no owner index: a one-off internal move across
       every owner's pages, never callable from a client. */
    for await (const page of ctx.db.query('attachments')) {
      if (page.area === undefined || page.sheetId !== undefined) continue
      const sheetId = await ctx.db.insert('vaultSheets', {
        ownerId: page.ownerId,
        area: page.area,
        logId: page.logId,
        revisedAt: page.revisedAt,
      })
      await ctx.db.patch(page._id, {
        sheetId,
        area: undefined,
        logId: undefined,
        revisedAt: undefined,
      })
      const readings = await ctx.db
        .query('readings')
        .withIndex('by_owner_attachment', (q) =>
          q.eq('ownerId', page.ownerId).eq('attachmentId', page._id),
        )
        .take(MAX_ROWS)
      for (const reading of readings) {
        await ctx.db.patch(reading._id, { sheetId, attachmentId: undefined })
      }
      moved += 1
    }
    return { moved }
  },
})

/* ------------------------------------------------ for ai/read.ts only */

/** What the reader needs: every page, in order, and which language it is. */
export const forReading = internalQuery({
  args: { readingId: v.id('readings') },
  returns: v.union(
    v.null(),
    v.object({
      pages: v.array(
        v.object({ storageId: v.id('_storage'), contentType: v.string() }),
      ),
      language: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const reading = await ctx.db.get(args.readingId)
    if (
      reading === null ||
      reading.status !== 'reading' ||
      reading.sheetId === undefined
    ) {
      return null
    }
    const sheet = await ctx.db.get(reading.sheetId)
    if (sheet === null) return null
    const pages = (await pagesOf(ctx, reading.ownerId, sheet._id)).sort(
      (a, b) => a._creationTime - b._creationTime,
    )
    const area = await ctx.db
      .query('areas')
      .withIndex('by_owner_slug', (q) =>
        q.eq('ownerId', reading.ownerId).eq('slug', sheet.area),
      )
      .unique()
    return {
      pages: pages.map((p) => ({
        storageId: p.storageId,
        contentType: p.contentType,
      })),
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
    rules: v.array(ruleValidator),
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
      rules: args.rules,
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

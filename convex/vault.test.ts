/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { READINGS_PER_WINDOW } from '../src/lib/reading'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* Two people in one database, so "they cannot see my sheet" is tested
   against a sheet that is really there. */
function world() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

type World = ReturnType<typeof world>

async function stored(t: World['t'], type = 'application/pdf') {
  return await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['%PDF-1.4'], { type })),
  )
}

async function file(
  t: World['t'],
  over: Partial<{ contentType: string; size: number; name: string }> = {},
) {
  const contentType = over.contentType ?? 'application/pdf'
  return {
    storageId: await stored(t, contentType),
    name: over.name ?? 'Aula 12.pdf',
    contentType,
    size: over.size ?? 2048,
  }
}

async function setUp(w: World) {
  const pt = await w.me.mutation(api.areas.addLanguage, { lang: 'pt-PT' })
  const en = await w.me.mutation(api.areas.addLanguage, { lang: 'en' })
  const classId = await w.me.mutation(api.logs.create, {
    kind: 'session',
    area: pt,
    occurredAt: Date.now(),
    category: 'class',
  })
  return { pt, en, classId }
}

async function sheet(w: World, area: string, logId?: Id<'logs'>, pages = 1) {
  const files = []
  for (let i = 0; i < pages; i++) {
    files.push(await file(w.t, { name: `page ${i + 1}.pdf` }))
  }
  const out = await w.me.mutation(api.vault.add, { area, logId, files })
  if (!out.ok) throw new Error(out.error)
  return out.sheetId
}

async function fileCount(t: World['t']) {
  return await t.run(
    async (ctx) => (await ctx.db.system.query('_storage').collect()).length,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('vault.add — pages become one sheet, read once', () => {
  test('on a session: one sheet, its pages in order, one reading asked for', async () => {
    const w = world()
    const { pt, classId } = await setUp(w)
    await sheet(w, pt, classId, 3)

    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.pages.map((p) => p.name)).toEqual([
      'page 1.pdf',
      'page 2.pdf',
      'page 3.pdf',
    ])
    expect(row).toMatchObject({
      session: { logId: classId, category: 'class' },
      reading: { status: 'reading', model: 'claude-haiku-4-5' },
    })
    expect(
      await w.t.run(
        async (ctx) => (await ctx.db.query('readings').collect()).length,
      ),
    ).toBe(1)
    expect(
      await w.me.query(api.vault.countsForLogs, { logIds: [classId] }),
    ).toEqual([{ logId: classId, count: 1 }])
  })

  test('with no key set, the reading fails with a sentence, not "reading…" forever', async () => {
    const w = world()
    const { pt } = await setUp(w)
    await sheet(w, pt)
    await w.t.finishAllScheduledFunctions(vi.runAllTimers)
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.reading).toMatchObject({
      status: 'failed',
      error: 'No reader is set up yet (ANTHROPIC_API_KEY is missing).',
    })
  })

  test('refused, and every file taken back out: too many pages, wrong type, not a language, another language', async () => {
    const w = world()
    const { pt, en, classId } = await setUp(w)
    const before = await fileCount(w.t)
    const six = await Promise.all(Array.from({ length: 6 }, () => file(w.t)))
    expect(
      await w.me.mutation(api.vault.add, { area: pt, files: six }),
    ).toEqual({ ok: false, error: 'A sheet is at most 5 pages.' })
    expect(
      await w.me.mutation(api.vault.add, {
        area: pt,
        files: [
          await file(w.t),
          await file(w.t, { contentType: 'image/heic' }),
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('PDFs and photos'),
    })
    expect(
      await w.me.mutation(api.vault.add, {
        area: 'work',
        files: [await file(w.t)],
      }),
    ).toEqual({ ok: false, error: 'Not a language area.' })
    expect(
      await w.me.mutation(api.vault.add, {
        area: en,
        logId: classId,
        files: [await file(w.t)],
      }),
    ).toEqual({
      ok: false,
      error: 'That session is filed under another language.',
    })
    expect(await fileCount(w.t)).toBe(before)
    expect(await w.me.query(api.vault.list, { area: pt })).toEqual([])
  })

  test(`the cap: ${READINGS_PER_WINDOW} readings in 30 days, then refused — however many pages`, async () => {
    const w = world()
    const { pt } = await setUp(w)
    const first = await sheet(w, pt, undefined, 3)
    await w.t.run(async (ctx) => {
      const me = (await ctx.db.get(first))!.ownerId
      for (let i = 1; i < READINGS_PER_WINDOW; i++) {
        await ctx.db.insert('readings', {
          ownerId: me,
          sheetId: first,
          status: 'done',
          model: 'claude-haiku-4-5',
          requestedAt: Date.now() - i * 60_000,
        })
      }
    })
    const out = await w.me.mutation(api.vault.add, {
      area: pt,
      files: [await file(w.t)],
    })
    expect(out.ok === false && out.error).toMatch(
      `That's ${READINGS_PER_WINDOW} sheets read in 30 days`,
    )
  })
})

describe('pages later', () => {
  test('addPages adds to the sheet, not past five, and is not read on its own', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const id = await sheet(w, pt, undefined, 2)
    expect(
      await w.me.mutation(api.vault.addPages, {
        sheetId: id,
        files: [await file(w.t, { name: 'page 3.pdf' })],
      }),
    ).toEqual({ ok: true })
    const refused = await w.me.mutation(api.vault.addPages, {
      sheetId: id,
      files: [await file(w.t), await file(w.t), await file(w.t)],
    })
    expect(refused).toEqual({ ok: false, error: 'A sheet is at most 5 pages.' })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.pages).toHaveLength(3)
    expect(
      await w.t.run(
        async (ctx) => (await ctx.db.query('readings').collect()).length,
      ),
    ).toBe(1)
  })

  test('removePage takes one page, never the last', async () => {
    const w = world()
    const { pt } = await setUp(w)
    await sheet(w, pt, undefined, 2)
    const [row] = await w.me.query(api.vault.list, { area: pt })
    await w.me.mutation(api.vault.removePage, {
      attachmentId: row.pages[0]._id,
    })
    await expect(
      w.me.mutation(api.vault.removePage, { attachmentId: row.pages[1]._id }),
    ).rejects.toThrow('its only page')
  })
})

describe('another owner', () => {
  test('cannot hang a sheet on my session, list mine, add pages, or remove one', async () => {
    const w = world()
    const { pt, classId } = await setUp(w)
    const id = await sheet(w, pt, classId)
    const theirPt = await w.them.mutation(api.areas.addLanguage, {
      lang: 'pt-PT',
    })
    expect(
      await w.them.mutation(api.vault.add, {
        area: theirPt,
        logId: classId,
        files: [await file(w.t)],
      }),
    ).toEqual({ ok: false, error: 'No such session.' })
    expect(await w.them.query(api.vault.list, { area: pt })).toEqual([])
    expect(
      await w.them.mutation(api.vault.addPages, {
        sheetId: id,
        files: [await file(w.t)],
      }),
    ).toEqual({ ok: false, error: 'No such sheet.' })
    await expect(
      w.them.mutation(api.vault.remove, { sheetId: id }),
    ).rejects.toThrow('No such sheet')
    await expect(
      w.them.mutation(api.vault.markRevised, { sheetId: id }),
    ).rejects.toThrow('No such sheet')
  })
})

describe('reading, read again, revised, remove', () => {
  test('a finished reading is what the card shows', async () => {
    const w = world()
    const { pt } = await setUp(w)
    await sheet(w, pt)
    const readingId = await w.t.run(
      async (ctx) => (await ctx.db.query('readings').first())!._id,
    )
    await w.t.mutation(internal.vault.finish, {
      readingId,
      title: 'Past tense of ir and ser',
      kind: 'grammar',
      tags: ['pretérito perfeito'],
      text: 'Pretérito perfeito',
      summary: 'Past tense.',
      conclusion: 'Practise ir.',
      words: [{ term: 'fui', meaning: 'I went' }],
      examples: [
        { sentence: 'Eu fui ao mercado.', meaning: 'I went to the market.' },
      ],
      rules: [
        {
          name: 'Past of ir',
          pattern: 'fui, foste, foi',
          explanation: 'Finished actions.',
          examples: [{ sentence: 'Ela foi.', meaning: 'She went.' }],
        },
      ],
      inputTokens: 3000,
      outputTokens: 400,
    })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.reading).toMatchObject({
      status: 'done',
      title: 'Past tense of ir and ser',
      kind: 'grammar',
      rules: [{ name: 'Past of ir' }],
    })
    expect(row.reading?.readAt).toBeTypeOf('number')
  })

  test('read again: after a failure or a finished reading, never while reading', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const id = await sheet(w, pt)
    await expect(
      w.me.mutation(api.vault.retry, { sheetId: id }),
    ).rejects.toThrow('being read right now')
    await w.t.finishAllScheduledFunctions(vi.runAllTimers)
    await w.me.mutation(api.vault.retry, { sheetId: id })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.reading?.status).toBe('reading')
  })

  test('Revised is remembered on the sheet', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const id = await sheet(w, pt)
    await w.me.mutation(api.vault.markRevised, { sheetId: id })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.revisedAt).toBeTypeOf('number')
  })

  test('remove takes the sheet, every page and what was read in them', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const before = await fileCount(w.t)
    const id = await sheet(w, pt, undefined, 3)
    await w.me.mutation(api.vault.remove, { sheetId: id })
    expect(await w.me.query(api.vault.list, { area: pt })).toEqual([])
    expect(await fileCount(w.t)).toBe(before)
    expect(
      await w.t.run(async (ctx) => await ctx.db.query('readings').collect()),
    ).toEqual([])
  })
})

describe('a sheet outlives its session', () => {
  test('removing the session leaves the sheet, not linked', async () => {
    const w = world()
    const { pt, classId } = await setUp(w)
    await sheet(w, pt, classId)
    await w.me.mutation(api.logs.remove, { logId: classId })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.session).toBeNull()
  })

  test('moving the session to another language takes its sheets along', async () => {
    const w = world()
    const { pt, en, classId } = await setUp(w)
    await sheet(w, pt, classId)
    await w.me.mutation(api.logs.setArea, { logId: classId, area: en })
    expect(await w.me.query(api.vault.list, { area: pt })).toEqual([])
    expect(await w.me.query(api.vault.list, { area: en })).toHaveLength(1)
  })

  test('a language holding a sheet cannot be deleted', async () => {
    const w = world()
    const { en } = await setUp(w)
    await sheet(w, en)
    await expect(w.me.mutation(api.areas.remove, { slug: en })).rejects.toThrow(
      'AREA_IN_USE',
    )
  })
})

describe('migrateSheets — a first-day sheet becomes a one-page sheet', () => {
  test('its session, revisit and reading move onto the sheet; running again changes nothing', async () => {
    const w = world()
    const { pt, classId } = await setUp(w)
    const pageId = await w.t.run(async (ctx) => {
      const ownerId = (await ctx.db.get(classId))!.ownerId
      const id = await ctx.db.insert('attachments', {
        ownerId,
        area: pt,
        logId: classId,
        revisedAt: 123,
        storageId: await ctx.storage.store(new Blob(['%PDF'])),
        name: 'old.pdf',
        contentType: 'application/pdf',
        size: 4,
      })
      await ctx.db.insert('readings', {
        ownerId,
        attachmentId: id,
        status: 'done',
        title: 'Old sheet',
        model: 'claude-haiku-4-5',
        requestedAt: 1,
      })
      return id
    })
    expect(await w.t.mutation(internal.vault.migrateSheets, {})).toEqual({
      moved: 1,
    })
    expect(await w.t.mutation(internal.vault.migrateSheets, {})).toEqual({
      moved: 0,
    })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row).toMatchObject({
      revisedAt: 123,
      session: { logId: classId },
      pages: [{ _id: pageId, name: 'old.pdf' }],
      reading: { title: 'Old sheet' },
    })
    const page = await w.t.run(async (ctx) => await ctx.db.get(pageId))
    expect([page?.area, page?.logId, page?.revisedAt]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })
})

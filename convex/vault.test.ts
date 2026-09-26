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

async function sheet(
  w: World,
  area: string,
  logId?: Id<'logs'>,
  over: Partial<{ contentType: string; size: number }> = {},
) {
  const contentType = over.contentType ?? 'application/pdf'
  const out = await w.me.mutation(api.vault.add, {
    area,
    logId,
    storageId: await stored(w.t, contentType),
    name: 'Aula 12.pdf',
    contentType,
    size: over.size ?? 2048,
  })
  if (!out.ok) throw new Error(out.error)
  return out.attachmentId
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

describe('vault.add — a sheet on a session or a language, read once', () => {
  test('on a session: listed with it, and a reading asked for', async () => {
    const w = world()
    const { pt, classId } = await setUp(w)
    await sheet(w, pt, classId)

    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row).toMatchObject({
      name: 'Aula 12.pdf',
      session: { logId: classId, category: 'class' },
      reading: { status: 'reading', model: 'claude-haiku-4-5' },
    })
    expect(
      await w.me.query(api.vault.countsForLogs, { logIds: [classId] }),
    ).toEqual([{ logId: classId, count: 1 }])
  })

  test('with no key set, the reading fails with a sentence, not "reading…" forever', async () => {
    const w = world()
    const { pt, classId } = await setUp(w)
    await sheet(w, pt, classId)
    await w.t.finishAllScheduledFunctions(vi.runAllTimers)

    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.reading).toMatchObject({
      status: 'failed',
      error: 'No reader is set up yet (ANTHROPIC_API_KEY is missing).',
    })
  })

  test('not linked is allowed, filed under the language', async () => {
    const w = world()
    const { pt } = await setUp(w)
    await sheet(w, pt)
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.session).toBeNull()
  })

  test('refused, and the bytes taken back out: wrong type, too big, not a language, another language', async () => {
    const w = world()
    const { pt, en, classId } = await setUp(w)
    const before = await fileCount(w.t)
    await expect(
      sheet(w, pt, classId, { contentType: 'image/heic' }),
    ).rejects.toThrow('The Vault reads PDFs and photos')
    await expect(
      sheet(w, pt, classId, { size: 11 * 1024 * 1024 }),
    ).rejects.toThrow('larger than 10 MB')
    await expect(sheet(w, 'work')).rejects.toThrow('Not a language area')
    await expect(sheet(w, en, classId)).rejects.toThrow(
      'filed under another language',
    )
    expect(await fileCount(w.t)).toBe(before)
    expect(await w.me.query(api.vault.list, { area: pt })).toEqual([])
  })

  test(`the cap: ${READINGS_PER_WINDOW} readings in 30 days, then refused`, async () => {
    const w = world()
    const { pt } = await setUp(w)
    const first = await sheet(w, pt)
    await w.t.run(async (ctx) => {
      const me = (await ctx.db.get(first))!.ownerId
      for (let i = 1; i < READINGS_PER_WINDOW; i++) {
        await ctx.db.insert('readings', {
          ownerId: me,
          attachmentId: first,
          status: 'done',
          model: 'claude-haiku-4-5',
          requestedAt: Date.now() - i * 60_000,
        })
      }
    })
    await expect(sheet(w, pt)).rejects.toThrow(
      `That's ${READINGS_PER_WINDOW} sheets read in 30 days`,
    )
  })
})

describe('another owner', () => {
  test('cannot hang a sheet on my session, list mine, or remove one', async () => {
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
        storageId: await stored(w.t),
        name: 'x.pdf',
        contentType: 'application/pdf',
        size: 10,
      }),
    ).toEqual({ ok: false, error: 'No such session.' })
    expect(await w.them.query(api.vault.list, { area: pt })).toEqual([])
    await expect(
      w.them.mutation(api.vault.remove, { attachmentId: id }),
    ).rejects.toThrow('No such sheet')
  })
})

describe('reading, retry, remove', () => {
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
      inputTokens: 3000,
      outputTokens: 400,
    })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.reading).toMatchObject({
      status: 'done',
      title: 'Past tense of ir and ser',
      kind: 'grammar',
      tags: ['pretérito perfeito'],
      summary: 'Past tense.',
      words: [{ term: 'fui', meaning: 'I went' }],
      examples: [
        { sentence: 'Eu fui ao mercado.', meaning: 'I went to the market.' },
      ],
    })
    expect(row.reading?.readAt).toBeTypeOf('number')
  })

  test('read again: after a failure or a finished reading, never while reading', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const id = await sheet(w, pt)
    await expect(
      w.me.mutation(api.vault.retry, { attachmentId: id }),
    ).rejects.toThrow('being read right now')
    await w.t.finishAllScheduledFunctions(vi.runAllTimers)
    await w.me.mutation(api.vault.retry, { attachmentId: id })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.reading?.status).toBe('reading')
    /* Each reading is its own row: the cap counts both. */
    expect(
      await w.t.run(
        async (ctx) => (await ctx.db.query('readings').collect()).length,
      ),
    ).toBe(2)
  })

  test('Revised is remembered on the sheet, and only on mine', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const id = await sheet(w, pt)
    await w.me.mutation(api.vault.markRevised, { attachmentId: id })
    const [row] = await w.me.query(api.vault.list, { area: pt })
    expect(row.revisedAt).toBeTypeOf('number')
    await expect(
      w.them.mutation(api.vault.markRevised, { attachmentId: id }),
    ).rejects.toThrow('No such sheet')
  })

  test('remove takes the file and what was read in it', async () => {
    const w = world()
    const { pt } = await setUp(w)
    const before = await fileCount(w.t)
    const id = await sheet(w, pt)
    await w.me.mutation(api.vault.remove, { attachmentId: id })
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

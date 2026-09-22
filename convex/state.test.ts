/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

describe('cefr keys become per-language', () => {
  test('an old bare key is rewritten to Portuguese', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level',
      textValue: 'B1',
      recordedAt: Date.now(),
    })

    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows.map((r) => r.key)).toEqual(['cefr_level:portuguese'])
    expect(rows[0].textValue).toBe('B1')
  })

  test('running it twice changes nothing the second time', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level',
      textValue: 'B1',
      recordedAt: Date.now(),
    })

    await backend.mutation(internal.state.migrateCefrKeys, {})
    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('cefr_level:portuguese')
  })

  test('a key that is not cefr_level is left alone', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.state.record, {
      area: 'body',
      key: 'weight',
      value: 75.4,
      unit: 'kg',
      recordedAt: Date.now(),
    })

    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows[0].key).toBe('weight')
  })

  test('every owner’s rows are migrated, each under their own', async () => {
    const backend = convexTest(schema, modules)
    for (const who of [ME, SOMEONE_ELSE]) {
      const t = backend.withIdentity({ tokenIdentifier: who })
      await t.mutation(api.areas.ensure, {})
      await t.mutation(api.state.record, {
        area: 'portuguese',
        key: 'cefr_level',
        textValue: 'B1',
        recordedAt: Date.now(),
      })
    }

    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.key))).toEqual(
      new Set(['cefr_level:portuguese']),
    )
    expect(new Set(rows.map((r) => r.ownerId)).size).toBe(2)
  })
})

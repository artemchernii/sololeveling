/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function world() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('areas.addLanguage — + Add language, one tap', () => {
  test('makes a language area carrying the code', async () => {
    const { me } = world()
    const slug = await me.mutation(api.areas.addLanguage, { lang: 'de' })
    const areas = await me.query(api.areas.list, {})
    const german = areas.find((a) => a.slug === slug)
    expect(german).toMatchObject({
      label: 'German',
      track: 'language',
      lang: 'de',
      silver: true,
    })
  })

  test('reuses the area of the same name rather than making a second', async () => {
    const { me } = world()
    await me.mutation(api.areas.ensure, {})
    const slug = await me.mutation(api.areas.addLanguage, { lang: 'pt-PT' })
    expect(slug).toBe('portuguese')
    const again = await me.mutation(api.areas.addLanguage, { lang: 'pt-PT' })
    expect(again).toBe('portuguese')
    const areas = await me.query(api.areas.list, {})
    expect(areas.filter((a) => a.lang === 'pt-PT')).toHaveLength(1)
  })

  test('an unknown code is refused', async () => {
    const { me } = world()
    await expect(
      me.mutation(api.areas.addLanguage, { lang: 'xx' }),
    ).rejects.toThrow('NO_SUCH_LANGUAGE')
  })
})

describe('areas.setLang', () => {
  test('sets and clears; another owner cannot reach mine', async () => {
    const { me, them } = world()
    await me.mutation(api.areas.ensure, {})
    await me.mutation(api.areas.setLang, { slug: 'portuguese', lang: 'pt-PT' })
    let pt = (await me.query(api.areas.list, {})).find(
      (a) => a.slug === 'portuguese',
    )
    expect(pt?.lang).toBe('pt-PT')
    await expect(
      them.mutation(api.areas.setLang, { slug: 'portuguese', lang: 'en' }),
    ).rejects.toThrow('NO_SUCH_AREA')
    await me.mutation(api.areas.setLang, { slug: 'portuguese', lang: null })
    pt = (await me.query(api.areas.list, {})).find(
      (a) => a.slug === 'portuguese',
    )
    expect(pt?.lang).toBeUndefined()
  })
})

describe('path topics — progress lives in his drills', () => {
  test('practise makes the drill once and logs an exercise each time', async () => {
    const { t, me } = world()
    const args = {
      area: 'portuguese',
      ref: 'b1-relativos',
      title: 'Pronomes relativos',
    }
    const first = await me.mutation(api.drills.practiseTopic, args)
    await me.mutation(api.drills.practiseTopic, args)
    const drills = await me.query(api.drills.list, { area: 'portuguese' })
    expect(drills).toHaveLength(1)
    expect(drills[0]).toMatchObject({ ref: 'b1-relativos', group: 'topic' })
    const log = await t.run((ctx) => ctx.db.get(first))
    expect(log?.kind).toBe('exercise')
    expect(log?.meta?.drillId).toBe(drills[0]._id)
  })

  test('marking solid before practising makes the drill with the mark', async () => {
    const { me } = world()
    await me.mutation(api.drills.markTopic, {
      area: 'portuguese',
      ref: 'a1-ser-estar',
      title: 'Ser vs estar',
      mark: 'solid',
    })
    const [drill] = await me.query(api.drills.list, { area: 'portuguese' })
    expect(drill.mark).toBe('solid')
  })

  test("my topics are not another owner's, and a bad ref is refused", async () => {
    const { me, them } = world()
    await me.mutation(api.drills.practiseTopic, {
      area: 'portuguese',
      ref: 'a1-presente',
      title: 'Presente',
    })
    expect(await them.query(api.drills.list, { area: 'portuguese' })).toEqual(
      [],
    )
    await expect(
      me.mutation(api.drills.practiseTopic, {
        area: 'portuguese',
        ref: 'Not A Ref!',
        title: 'x',
      }),
    ).rejects.toThrow('Bad topic')
  })
})

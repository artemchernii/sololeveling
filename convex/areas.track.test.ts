/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

describe('an area can be marked as a language', () => {
  test('the flag is set and read back', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.setTrack, {
      slug: 'portuguese',
      track: 'language',
    })
    const areas = await t.query(api.areas.list, {})
    const portuguese = areas.find((a) => a.slug === 'portuguese')
    expect(portuguese?.track).toBe('language')
  })

  test('an area you invented can be one too', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const slug = await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.setTrack, { slug, track: 'language' })
    const areas = await t.query(api.areas.list, {})
    expect(areas.find((a) => a.slug === slug)?.track).toBe('language')
  })

  test('the flag comes off again', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.setTrack, {
      slug: 'portuguese',
      track: 'language',
    })
    await t.mutation(api.areas.setTrack, { slug: 'portuguese', track: null })
    const areas = await t.query(api.areas.list, {})
    expect(areas.find((a) => a.slug === 'portuguese')?.track).toBeUndefined()
  })

  test('a slug with no row is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.setTrack, { slug: 'klingon', track: 'language' }),
    ).rejects.toThrow()
  })

  test('you cannot flag another owner’s area', async () => {
    /* ONE backend, two identities. Two convexTest() calls are two databases
       and would pass whatever the mutation did. */
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    const theirs = backend.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    await mine.mutation(api.areas.ensure, {})
    await theirs.mutation(api.areas.ensure, {})

    await theirs.mutation(api.areas.setTrack, {
      slug: 'portuguese',
      track: 'language',
    })
    const myAreas = await mine.query(api.areas.list, {})
    expect(myAreas.find((a) => a.slug === 'portuguese')?.track).toBeUndefined()
  })
})

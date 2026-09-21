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

/* Two people in one database: my row is really there when they look for it,
   so a refusal comes from the ownership check and not from an empty table. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('the ten the schema used to name become ten rows', () => {
  test('ensure creates them in order', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const areas = await t.query(api.areas.list, {})
    expect(areas.map((a) => a.slug)).toEqual([
      'projects',
      'business',
      'portuguese',
      'body',
      'money',
      'social',
      'career',
      'style',
      'knowledge',
      'life',
    ])
    expect(areas.map((a) => a.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test('ensure twice is ensure once', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.ensure, {})
    expect((await t.query(api.areas.list, {})).length).toBe(10)
  })

  test('ensure does not undo a rename', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.rename, { slug: 'body', label: 'Gym & Health' })
    await t.mutation(api.areas.ensure, {})
    const body = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'body',
    )
    expect(body?.label).toBe('Gym & Health')
  })

  test('a rename changes the label and never the slug', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.rename, { slug: 'body', label: 'Gym & Health' })
    const body = (await t.query(api.areas.list, {})).find(
      (a) => a.label === 'Gym & Health',
    )
    /* The whole design in one assertion: six tables hold this string. */
    expect(body?.slug).toBe('body')
  })

  test('a blank name is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.rename, { slug: 'body', label: '   ' }),
    ).rejects.toThrow('AREA_NEEDS_A_NAME')
  })

  test('my areas are mine', async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.areas.rename, { slug: 'life', label: 'Admin' })
    expect(await theirs.query(api.areas.list, {})).toEqual([])
  })

  test("another owner's area cannot be renamed", async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.areas.ensure, {})
    await expect(
      theirs.mutation(api.areas.rename, { slug: 'body', label: 'Theirs' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test('a signed-out caller reads nothing and writes nothing', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.areas.list, {})).rejects.toThrow('Not signed in')
    await expect(t.mutation(api.areas.ensure, {})).rejects.toThrow(
      'Not signed in',
    )
  })
})

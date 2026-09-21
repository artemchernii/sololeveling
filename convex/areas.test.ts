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

describe('inventing an area', () => {
  test('a word he invented becomes an area', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const slug = await t.mutation(api.areas.create, { label: 'English' })
    expect(slug).toBe('english')

    const english = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'english',
    )
    expect(english?.label).toBe('English')
    expect(english?.order).toBe(10)
  })

  test('a new area lands outside the accent gap', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    const english = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'english',
    )!
    expect(english.hue >= 265 && english.hue <= 305).toBe(false)
  })

  test('a label that collides is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.create, { label: 'Body' }),
    ).rejects.toThrow('AREA_EXISTS')
  })

  test('a label that makes no slug is refused', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.areas.create, { label: '!!!' }),
    ).rejects.toThrow('AREA_NEEDS_A_NAME')
  })

  test("my invented area is not in another owner's list", async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.areas.create, { label: 'English' })
    expect(await theirs.query(api.areas.list, {})).toEqual([])
  })
})

describe('retiring (PLAN.md §4, R6 decision 5)', () => {
  test('an area a tile counts cannot be retired', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    for (const slug of ['portuguese', 'body', 'money', 'style', 'social']) {
      await expect(
        t.mutation(api.areas.retire, { slug }),
        slug,
      ).rejects.toThrow('AREA_ON_A_TILE')
    }
  })

  test('an area a verb names needs somewhere for those verbs to go', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.retire, { slug: 'knowledge' }),
    ).rejects.toThrow('AREA_NEEDS_A_REPLACEMENT')

    await t.mutation(api.areas.retire, {
      slug: 'knowledge',
      replacedBy: 'life',
    })
    const live = await t.query(api.areas.list, {})
    expect(live.map((a) => a.slug)).not.toContain('knowledge')

    const all = await t.query(api.areas.list, { includeRetired: true })
    const knowledge = all.find((a) => a.slug === 'knowledge')!
    expect(knowledge.replacedBy).toBe('life')
    expect(knowledge.retiredAt).toBeTypeOf('number')
  })

  test('a replacement must itself be live, so no chain can form', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.retire, {
      slug: 'knowledge',
      replacedBy: 'life',
    })
    await expect(
      t.mutation(api.areas.retire, { slug: 'career', replacedBy: 'knowledge' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test('an invented area retires with no replacement needed', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.retire, { slug: 'english' })
    expect(
      (await t.query(api.areas.list, {})).map((a) => a.slug),
    ).not.toContain('english')
  })

  test('a retired area comes back, with its redirect gone', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.retire, {
      slug: 'knowledge',
      replacedBy: 'life',
    })
    await t.mutation(api.areas.restore, { slug: 'knowledge' })
    const knowledge = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'knowledge',
    )!
    expect(knowledge.retiredAt).toBeUndefined()
    expect(knowledge.replacedBy).toBeUndefined()
  })

  test('the last live area cannot be retired', async () => {
    const t = as(ME)
    await t.mutation(api.areas.create, { label: 'Only' })
    await expect(
      t.mutation(api.areas.retire, { slug: 'only' }),
    ).rejects.toThrow('LAST_AREA')
  })

  test('an area already retired cannot be retired twice', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.retire, { slug: 'english' })
    await expect(
      t.mutation(api.areas.retire, { slug: 'english' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })
})

describe('order and colour', () => {
  test('reorder rewrites every order in one call', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const reversed = (await t.query(api.areas.list, {}))
      .map((a) => a.slug)
      .reverse()
    await t.mutation(api.areas.reorder, { slugs: reversed })
    expect((await t.query(api.areas.list, {})).map((a) => a.slug)).toEqual(
      reversed,
    )
  })

  test('a reorder that is not the whole list is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.reorder, { slugs: ['body', 'life'] }),
    ).rejects.toThrow('NOT_THE_WHOLE_LIST')
  })

  test('a hue inside the accent gap is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.setHue, { slug: 'body', hue: 280 }),
    ).rejects.toThrow('HUE_IS_THE_ACCENT')
  })

  test('a hue outside 0-359 is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.setHue, { slug: 'body', hue: 400 }),
    ).rejects.toThrow('BAD_HUE')
  })

  test('a hue he picks is kept', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.setHue, { slug: 'body', hue: 200 })
    const body = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'body',
    )!
    expect(body.hue).toBe(200)
  })
})

describe('what may be written into an area field', () => {
  test('a goal is filed under a word he invented — the done-when', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    const goalId = await t.mutation(api.goals.create, {
      title: 'C1 English',
      area: 'english',
    })
    expect((await t.query(api.goals.get, { goalId }))?.area).toBe('english')
  })

  test('a slug with no area row is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.goals.create, { title: 'Nope', area: 'nonsense' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test("another owner's area is not an area I can file under", async () => {
    const { mine, theirs } = twoOwners()
    await theirs.mutation(api.areas.ensure, {})
    await theirs.mutation(api.areas.create, { label: 'Secret' })
    await mine.mutation(api.areas.ensure, {})
    await expect(
      mine.mutation(api.goals.create, { title: 'Nope', area: 'secret' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test('a retired area can still be written — it is where things already are', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.retire, { slug: 'english' })
    /* Refusing here would mean a goal already filed under `english` could not
       be edited and saved again. A picker will not offer it; the field takes
       it. */
    const goalId = await t.mutation(api.goals.create, {
      title: 'Old',
      area: 'english',
    })
    expect((await t.query(api.goals.get, { goalId }))?.area).toBe('english')
  })

  test('a task, an event and a log are guarded the same way', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.tasks.create, { title: 'Nope', area: 'nonsense' }),
    ).rejects.toThrow('NO_SUCH_AREA')
    await expect(
      t.mutation(api.events.create, {
        title: 'Nope',
        area: 'nonsense',
        startsAt: Date.now(),
        endsAt: Date.now() + 3600_000,
      }),
    ).rejects.toThrow('NO_SUCH_AREA')
    await expect(
      t.mutation(api.logs.create, {
        kind: 'workout',
        area: 'nonsense',
        occurredAt: Date.now(),
      }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })
})

describe('deleting an area he should never have made', () => {
  test('an unused invented area is deleted outright', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'Englsh' })
    await t.mutation(api.areas.remove, { slug: 'englsh' })
    expect(
      (await t.query(api.areas.list, { includeRetired: true })).map(
        (a) => a.slug,
      ),
    ).not.toContain('englsh')
  })

  test('an area something is filed under is refused — retire it instead', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.goals.create, { title: 'C1', area: 'english' })
    await expect(
      t.mutation(api.areas.remove, { slug: 'english' }),
    ).rejects.toThrow('AREA_IN_USE')
  })

  test('a log filed under it counts as in use', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.logs.create, {
      kind: 'session',
      area: 'english',
      occurredAt: Date.now(),
    })
    await expect(
      t.mutation(api.areas.remove, { slug: 'english' }),
    ).rejects.toThrow('AREA_IN_USE')
  })

  test('a built-in cannot be deleted, however empty', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.remove, { slug: 'knowledge' }),
    ).rejects.toThrow('AREA_IS_BUILT_IN')
  })

  test("another owner's area cannot be deleted", async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.areas.create, { label: 'English' })
    await expect(
      theirs.mutation(api.areas.remove, { slug: 'english' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })
})

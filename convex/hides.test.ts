/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

/* The excluded list (1 Nov): ⊘ HIDE folds a held name away, SHOW
   brings it back. */

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const FRIEND = 'https://clerk.test|user_friend'

async function thing(t: ReturnType<typeof convexTest>, ownerId: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert('instruments', {
        ownerId,
        symbol: 'NILSY',
        name: 'MMC Norilsk Nickel',
        exchange: 'PNK',
        currency: 'USD',
        type: 'EQUITY',
      }),
  )
}

test('hide once, twice is still once, show brings it back, nobody else sees it', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  const id = await thing(t, ME)
  expect(await me.query(api.hides.list, {})).toEqual([])

  await me.mutation(api.hides.set, { instrumentIds: [id], hidden: true })
  await me.mutation(api.hides.set, { instrumentIds: [id], hidden: true })
  expect(await me.query(api.hides.list, {})).toEqual([id])
  expect(await friend.query(api.hides.list, {})).toEqual([])

  await me.mutation(api.hides.set, { instrumentIds: [id], hidden: false })
  expect(await me.query(api.hides.list, {})).toEqual([])
})

test('another owner’s name, none at all or no sign-in is refused', async () => {
  const t = convexTest(schema, modules)
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  const mine = await thing(t, ME)
  await expect(
    friend.mutation(api.hides.set, { instrumentIds: [mine], hidden: true }),
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    t.mutation(api.hides.set, { instrumentIds: [mine], hidden: true }),
  ).rejects.toThrow()
  await expect(
    t
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.hides.set, { instrumentIds: [], hidden: true }),
  ).rejects.toThrow('HIDE_COUNT')
  expect(
    await t.withIdentity({ tokenIdentifier: ME }).query(api.hides.list, {}),
  ).toEqual([])
})

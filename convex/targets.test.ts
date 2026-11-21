/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const FRIEND = 'https://clerk.test|user_friend'

const HIS = [
  { bucket: 'gold' as const, min: 3000, max: 5000 },
  { bucket: 'bonds' as const, min: 5000, max: 5000 },
  { bucket: 'crypto' as const, min: 0, max: 2000 },
]

test('saved targets come back, a second save changes them, nobody else sees them', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  expect(await me.query(api.targets.list, {})).toEqual([])

  await me.mutation(api.targets.save, { targets: HIS })
  expect(await me.query(api.targets.list, {})).toHaveLength(3)

  await me.mutation(api.targets.save, {
    targets: [{ bucket: 'gold', min: 4000, max: 5000 }],
  })
  const after = await me.query(api.targets.list, {})
  expect(after).toHaveLength(3)
  expect(after.find((r) => r.bucket === 'gold')).toEqual({
    bucket: 'gold',
    min: 4000,
    max: 5000,
  })
  expect(await friend.query(api.targets.list, {})).toEqual([])
})

test('a max under its min, a negative, a bucket twice or no sign-in are refused', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(
    me.mutation(api.targets.save, {
      targets: [{ bucket: 'gold', min: 5000, max: 3000 }],
    }),
  ).rejects.toThrow('TARGET_RANGE')
  await expect(
    me.mutation(api.targets.save, {
      targets: [{ bucket: 'stocks', min: -1, max: -1 }],
    }),
  ).rejects.toThrow('TARGET_RANGE')
  await expect(
    me.mutation(api.targets.save, {
      targets: [HIS[0], { ...HIS[0], min: 1 }],
    }),
  ).rejects.toThrow('TARGET_TWICE')
  await expect(t.mutation(api.targets.save, { targets: HIS })).rejects.toThrow()
  expect(await me.query(api.targets.list, {})).toEqual([])
})

/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
const days = [4, 3, 2, 1].map((n) => Date.UTC(2026, 9, 11) - n * DAY)

afterEach(() => {
  vi.unstubAllEnvs()
})

test('linkRevolut: Revolut is linked, for its owner alone', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  await me.mutation(api.e2eAccountUpdate.linkRevolut, {})
  const [link] = await me.query(api.bank.links, {})
  const revolut = (await me.query(api.accounts.list, {})).find(
    (a) => a.name === 'Revolut',
  )
  expect(link.accountId).toBe(revolut?._id)
  expect(link.status).toBe('linked')
  expect(link.validUntil).toBeGreaterThan(Date.now())
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  expect(await other.query(api.bank.links, {})).toEqual([])
})

test('linkRevolut refuses off the test backend, and with no one signed in', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(
    me.mutation(api.e2eAccountUpdate.linkRevolut, {}),
  ).rejects.toThrow('only on the test backend')
  vi.stubEnv('E2E', '1')
  await expect(
    t.mutation(api.e2eAccountUpdate.linkRevolut, {}),
  ).rejects.toThrow()
  /* Signed in, with no Revolut to link. */
  await expect(
    me.mutation(api.e2eAccountUpdate.linkRevolut, {}),
  ).rejects.toThrow('no Revolut in the mock')
})

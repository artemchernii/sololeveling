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

async function connected() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  await me.mutation(api.e2eBank.reachable, {})
  const activo = (await me.query(api.accounts.list, {})).find(
    (a) => a.name === 'ActivoBank',
  )
  if (!activo) throw new Error('no ActivoBank in the mock')
  const url = await me.action(api.bank.connect, { accountId: activo._id })
  const state = new URL(url, 'http://app').searchParams.get('state') as string
  await me.action(api.bank.finish, { code: 'one', state, dayStart: days[3] })
  return { t, me }
}

test('the mock ActivoBank is a bank the app can connect', async () => {
  vi.stubEnv('E2E', '1')
  const { me } = await connected()
  const [link] = await me.query(api.bank.links, {})
  expect(link.status).toBe('linked')
  expect(link.validUntil).toBeGreaterThan(Date.now())
})

test('end: the approval of every link of the caller is over, nobody else’s', async () => {
  vi.stubEnv('E2E', '1')
  const { t, me } = await connected()
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  await other.mutation(api.e2eBank.end, {})
  expect((await me.query(api.bank.links, {}))[0].validUntil).toBeGreaterThan(
    Date.now(),
  )
  await me.mutation(api.e2eBank.end, {})
  expect((await me.query(api.bank.links, {}))[0].validUntil).toBeLessThan(
    Date.now(),
  )
})

test('end refuses anywhere but the test backend, and a caller not signed in', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2eBank.end, {})).rejects.toThrow(
    'E2E functions run only on the test backend.',
  )
  vi.stubEnv('E2E', '1')
  await expect(t.mutation(api.e2eBank.end, {})).rejects.toThrow('Not signed in')
})

test('reachable refuses anywhere but the test backend', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2eBank.reachable, {})).rejects.toThrow(
    'E2E functions run only on the test backend.',
  )
})

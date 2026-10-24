/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY_START = new Date(2026, 9, 11).getTime()

/* A connected bank, slice 1 (11 Oct). The bank is the canned one of
   bankApi.ts (E2E=1): one euro account, €727.49 booked and €702.49
   available; a code of "two" shows two accounts. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(product = 'activo') {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  const accountId = await me.mutation(api.accounts.create, {
    name: 'ActivoBank',
    kinds: ['bank'],
    currencies: ['EUR'],
    product,
  })
  const stateOf = (url: string) =>
    new URL(url, 'http://app').searchParams.get('state') as string
  const balances = () =>
    t.run((ctx) =>
      ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) => q.eq('ownerId', ME))
        .collect(),
    )
  return { t, me, other, accountId, stateOf, balances }
}

test('connect: sent to the bank, nothing saved until it answers', async () => {
  const { me, accountId, balances } = await setup()
  const url = await me.action(api.bank.connect, { accountId })
  expect(url).toContain('code=one')
  expect(await me.query(api.bank.links, {})).toMatchObject([
    { accountId, status: 'pending', validUntil: null, checkedAt: null },
  ])
  expect(await balances()).toEqual([])
})

test('back from the bank: linked, and the booked balance stored as synced', async () => {
  const { me, accountId, stateOf, balances } = await setup()
  const state = stateOf(await me.action(api.bank.connect, { accountId }))
  expect(
    await me.action(api.bank.finish, {
      code: 'one',
      state,
      dayStart: DAY_START,
    }),
  ).toEqual({ accountId, status: 'linked' })
  const [link] = await me.query(api.bank.links, {})
  expect(link).toMatchObject({ status: 'linked', checkedAt: NOON })
  expect(link.validUntil).toBe(NOON + 180 * 86_400_000)
  /* No session and no bank account id reach the client. */
  expect(JSON.stringify(link)).not.toContain('e2e-')
  expect(await balances()).toMatchObject([
    { value: 727.49, source: 'sync', recordedAt: NOON, unit: 'eur' },
  ])
})

test('the one-time word works once', async () => {
  const { me, accountId, stateOf, balances } = await setup()
  const state = stateOf(await me.action(api.bank.connect, { accountId }))
  const args = { code: 'one', state, dayStart: DAY_START }
  await me.action(api.bank.finish, args)
  await expect(me.action(api.bank.finish, args)).rejects.toThrow(
    'This approval is not open.',
  )
  expect(await balances()).toHaveLength(1)
})

test('refused: someone else’s account, word, or list', async () => {
  const { me, other, accountId, stateOf, balances } = await setup()
  await expect(other.action(api.bank.connect, { accountId })).rejects.toThrow(
    'No such account.',
  )
  const state = stateOf(await me.action(api.bank.connect, { accountId }))
  await expect(
    other.action(api.bank.finish, { code: 'one', state, dayStart: DAY_START }),
  ).rejects.toThrow('This approval is not open.')
  await other.mutation(api.bank.cancel, { state })
  expect(await other.query(api.bank.links, {})).toEqual([])
  expect(await me.query(api.bank.links, {})).toHaveLength(1)
  expect(await balances()).toEqual([])
  await expect(me.query(api.bank.links, {})).resolves.toBeDefined()
})

test('refused: not signed in, and a bank the app cannot reach', async () => {
  const { t, me } = await setup()
  await expect(t.query(api.bank.links, {})).rejects.toThrow('Not signed in')
  const t212 = await me.mutation(api.accounts.create, {
    name: 'Trading 212',
    kinds: ['broker'],
    currencies: ['EUR'],
    product: 'trading-212',
  })
  await expect(
    me.action(api.bank.connect, { accountId: t212 }),
  ).rejects.toThrow('Trading 212 cannot be connected.')
})

test('cancelled at the bank: nothing changed', async () => {
  const { me, accountId, stateOf, balances } = await setup()
  const first = stateOf(await me.action(api.bank.connect, { accountId }))
  await me.mutation(api.bank.cancel, { state: first })
  expect(await me.query(api.bank.links, {})).toEqual([])

  /* Linked, then approving again is cancelled: the link stays as it was. */
  const state = stateOf(await me.action(api.bank.connect, { accountId }))
  await me.action(api.bank.finish, { code: 'one', state, dayStart: DAY_START })
  const again = stateOf(await me.action(api.bank.connect, { accountId }))
  await me.mutation(api.bank.cancel, { state: again })
  expect(await me.query(api.bank.links, {})).toMatchObject([
    { status: 'linked', checkedAt: NOON },
  ])
  expect(await balances()).toHaveLength(1)
})

test('two accounts at the bank: asked, then the picked one is stored', async () => {
  const { me, other, accountId, stateOf, balances } = await setup()
  const state = stateOf(await me.action(api.bank.connect, { accountId }))
  expect(
    await me.action(api.bank.finish, {
      code: 'two',
      state,
      dayStart: DAY_START,
    }),
  ).toEqual({ accountId, status: 'choose' })
  expect(await balances()).toEqual([])
  const [link] = await me.query(api.bank.links, {})
  expect(link.choices).toEqual([
    { uid: 'e2e-a', name: 'Conta à Ordem', tail: '4471' },
    { uid: 'e2e-b', name: 'Conta Poupança', tail: '9920' },
  ])
  const pick = { accountId, uid: 'e2e-b', dayStart: DAY_START }
  await expect(other.action(api.bank.choose, pick)).rejects.toThrow(
    'Nothing to pick here.',
  )
  await expect(
    me.action(api.bank.choose, { ...pick, uid: 'nope' }),
  ).rejects.toThrow('Not one of the accounts.')
  await me.action(api.bank.choose, pick)
  expect(await me.query(api.bank.links, {})).toMatchObject([
    { status: 'linked', choices: [] },
  ])
  expect(await balances()).toMatchObject([{ value: 727.49, source: 'sync' }])
})

test('with no key set, nothing is sent', async () => {
  const { me, accountId } = await setup()
  vi.stubEnv('E2E', '')
  await expect(me.action(api.bank.connect, { accountId })).rejects.toThrow(
    'The bank connection is not set up yet.',
  )
})

/* BPI, 24 Oct: approved, and no account readable in the bank's answer. The
   approval is kept so its accounts can be read again with no new trip to
   the bank. */
test('approved with no account readable: the session is kept, and read again later', async () => {
  const { t, me, accountId, stateOf, balances } = await setup('bpi')
  const state = stateOf(await me.action(api.bank.connect, { accountId }))
  await expect(
    me.action(api.bank.finish, { code: 'none', state, dayStart: DAY_START }),
  ).rejects.toThrow('0 accounts · not linked in Enable Banking')
  expect(await me.query(api.bank.links, {})).toMatchObject([
    { accountId, status: 'pending' },
  ])
  expect(await balances()).toEqual([])
  expect(
    await t.action(internal.bank.again, { accountId, dayStart: DAY_START }),
  ).toBe('found')
  expect(await me.query(api.bank.links, {})).toMatchObject([
    { accountId, status: 'linked', checkedAt: NOON },
  ])
  expect(await balances()).toMatchObject([{ value: 727.49, source: 'sync' }])
})

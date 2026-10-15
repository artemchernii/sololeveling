/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    t,
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

const IPHONE = {
  endpoint: 'https://web.push.apple.com/abc',
  p256dh: 'key-a',
  auth: 'auth-a',
  device: 'iphone' as const,
}
const MAC = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
  p256dh: 'key-b',
  auth: 'auth-b',
  device: 'mac' as const,
}

describe('a phone subscribes once (N1 S8)', () => {
  test('the same endpoint twice is one subscription, the keys updated', async () => {
    const { t, mine } = twoOwners()
    await mine.mutation(api.push.subscribe, IPHONE)
    await mine.mutation(api.push.subscribe, { ...IPHONE, p256dh: 'key-new' })
    const rows = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ownerId: ME, p256dh: 'key-new' })
  })

  test('devices says which are on', async () => {
    const { mine } = twoOwners()
    expect(await mine.query(api.push.devices, {})).toEqual({
      iphone: false,
      mac: false,
    })
    await mine.mutation(api.push.subscribe, IPHONE)
    expect(await mine.query(api.push.devices, {})).toEqual({
      iphone: true,
      mac: false,
    })
    await mine.mutation(api.push.subscribe, MAC)
    await mine.mutation(api.push.unsubscribe, { endpoint: IPHONE.endpoint })
    expect(await mine.query(api.push.devices, {})).toEqual({
      iphone: false,
      mac: true,
    })
  })
})

describe('a test lands in the bell (N1 S3)', () => {
  test('sendTest writes a test row, unread, for today', async () => {
    const { mine } = twoOwners()
    await mine.mutation(api.push.subscribe, IPHONE)
    const before = Date.now() - 1000
    await mine.mutation(api.push.sendTest, {})
    const today = await mine.query(api.notifications.today, { since: before })
    expect(today).toHaveLength(1)
    expect(today[0]).toMatchObject({ kind: 'test', title: 'Test' })
    expect(today[0].readAt).toBeUndefined()
  })

  test('notify writes the row the bell lists, newest first', async () => {
    const { t, mine } = twoOwners()
    const since = Date.now() - 1000
    await t.mutation(internal.push.notify, {
      ownerId: ME,
      kind: 'file_read',
      title: 'Statement read',
      body: 'ActivoBank · 34 rows',
      url: '/finances',
    })
    await t.mutation(internal.push.notify, {
      ownerId: ME,
      kind: 'reminder',
      title: 'Run · 18:00',
      body: 'In 10 min · Calendar',
      url: '/calendar',
    })
    const today = await mine.query(api.notifications.today, { since })
    expect(today.map((n) => n.title)).toEqual(['Run · 18:00', 'Statement read'])
  })

  test('markRead clears the dot', async () => {
    const { mine } = twoOwners()
    const since = Date.now() - 1000
    await mine.mutation(api.push.sendTest, {})
    const [row] = await mine.query(api.notifications.today, { since })
    await mine.mutation(api.notifications.markRead, { id: row._id })
    const [after] = await mine.query(api.notifications.today, { since })
    expect(after.readAt).toBeTypeOf('number')
  })
})

describe('nobody reaches another person (N1 S9)', () => {
  test('their bell does not list my rows', async () => {
    const { mine, theirs } = twoOwners()
    const since = Date.now() - 1000
    await mine.mutation(api.push.sendTest, {})
    expect(await theirs.query(api.notifications.today, { since })).toEqual([])
  })

  test('they cannot mark my row read', async () => {
    const { mine, theirs } = twoOwners()
    const since = Date.now() - 1000
    await mine.mutation(api.push.sendTest, {})
    const [row] = await mine.query(api.notifications.today, { since })
    await expect(
      theirs.mutation(api.notifications.markRead, { id: row._id }),
    ).rejects.toThrow()
  })

  test('their unsubscribe leaves my phone subscribed', async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.push.subscribe, IPHONE)
    await theirs.mutation(api.push.unsubscribe, { endpoint: IPHONE.endpoint })
    expect((await mine.query(api.push.devices, {})).iphone).toBe(true)
  })

  test('the same endpoint subscribed by them does not take my row', async () => {
    const { t, mine, theirs } = twoOwners()
    await mine.mutation(api.push.subscribe, IPHONE)
    await theirs.mutation(api.push.subscribe, IPHONE)
    const rows = await t.run((ctx) =>
      ctx.db.query('pushSubscriptions').collect(),
    )
    expect(rows.map((r) => r.ownerId).sort()).toEqual([ME, SOMEONE_ELSE])
  })

  test('signed out is refused', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.push.subscribe, IPHONE)).rejects.toThrow(
      'Not signed in',
    )
    await expect(t.mutation(api.push.sendTest, {})).rejects.toThrow(
      'Not signed in',
    )
  })
})

describe('a dead subscription goes (N1 S10)', () => {
  test('drop removes only that endpoint', async () => {
    const { t, mine } = twoOwners()
    await mine.mutation(api.push.subscribe, IPHONE)
    await mine.mutation(api.push.subscribe, MAC)
    await t.mutation(internal.push.drop, {
      ownerId: ME,
      endpoint: IPHONE.endpoint,
    })
    expect(await mine.query(api.push.devices, {})).toEqual({
      iphone: false,
      mac: true,
    })
  })
})

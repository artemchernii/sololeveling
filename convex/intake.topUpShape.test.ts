/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const day = (d: number) => new Date(2026, 9, d, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 22, 9) })
})
afterEach(() => {
  vi.useRealTimers()
})

/* His Trade Republic as it stands on 22 Nov: the statement saved 3 Oct's
   top-up as the 500.00 that arrived; the CSV export reads it as 505.20
   sent and a 5.20 fee. One payment, so neither is saved again. */
test('a top-up read as sent and fee is the saved 500 that arrived', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const intakeId = await t.run(async (ctx) => {
    const tr = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      value: 500,
      unit: 'eur',
      occurredAt: day(3),
      text: 'Apple Pay Top up',
      accountId: tr,
      meta: { merchant: 'Apple Pay Top up' },
    })
    const row = (merchant: string, amount: number, self: boolean) => ({
      occurredAt: day(3),
      merchant,
      raw: merchant,
      amount,
      currency: 'EUR',
      pending: false,
      self,
    })
    return await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: tr,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'Trade Republic',
      transactions: [
        row('Apple Pay Top up', 505.2, true),
        row('Transfer fee', -5.2, false),
        row('Cash Dividend', 0.17, false),
      ],
      files: [
        { name: 'Transaction export.csv', size: 1, contentType: 'text/csv' },
      ],
    })
  })
  const review = await me.query(api.intake.review, { intakeId })
  expect(review?.rows.map((r) => r.duplicateOf !== null)).toEqual([
    true,
    true,
    false,
  ])
})

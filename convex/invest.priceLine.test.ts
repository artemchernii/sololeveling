/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
/* A Tuesday and a Wednesday; Yahoo stamps a US close in the afternoon,
   the ECB a day at midnight (UTC). */
const TUE = Date.UTC(2026, 2, 24)
const WED = Date.UTC(2026, 2, 25)

async function setup(currency: string, ownerId = ME) {
  const t = convexTest(schema, modules)
  const instrumentId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('instruments', {
      ownerId,
      symbol: 'SHOP',
      name: 'Shopify Inc.',
      exchange: 'NMS',
      currency,
      type: 'EQUITY',
    })
    for (const [asOf, price] of [
      [TUE + 20 * 3_600_000, 118.76],
      [WED + 20 * 3_600_000, 120],
      [WED + 7 * DAY, 121],
    ])
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId: id,
        price,
        currency,
        asOf,
        fetchedAt: asOf,
        source: 'Yahoo Finance',
      })
    /* A rate for Tuesday only: none for Wednesday or the week after. */
    for (const cur of ['USD', 'GBP'])
      await ctx.db.insert('fxRates', {
        ownerId,
        currency: cur,
        rate: cur === 'USD' ? 0.8984 : 1.18,
        asOf: TUE,
        fetchedAt: TUE,
        source: 'ECB',
      })
    return id
  })
  return { t, instrumentId, me: t.withIdentity({ tokenIdentifier: ME }) }
}

/* Euros beside dollars (13 Oct, chart.html): the stored close times the
   stored ECB rate of that day, worked out on the server. */
test('a dollar close has its euros on a day with a stored rate', async () => {
  const { me, instrumentId } = await setup('USD')
  const line = await me.query(api.invest.priceLine, {
    instrumentId,
    since: TUE - DAY,
  })
  expect(line).toHaveLength(3)
  expect(line[0]).toEqual({
    asOf: TUE + 20 * 3_600_000,
    price: 118.76,
    eur: 106.69,
  })
})

test('a day with no rate of its own takes the last one before it', async () => {
  const { me, instrumentId } = await setup('USD')
  const line = await me.query(api.invest.priceLine, {
    instrumentId,
    since: TUE - DAY,
  })
  expect(line[1]).toEqual({
    asOf: WED + 20 * 3_600_000,
    price: 120,
    eur: 107.81,
  })
})

test('no rate within four days: the dollar price alone', async () => {
  const { me, instrumentId } = await setup('USD')
  const line = await me.query(api.invest.priceLine, {
    instrumentId,
    since: TUE - DAY,
  })
  expect(line[2]).toEqual({ asOf: WED + 7 * DAY, price: 121 })
})

test('a share quoted in euros has one currency', async () => {
  const { me, instrumentId } = await setup('EUR')
  const line = await me.query(api.invest.priceLine, {
    instrumentId,
    since: TUE - DAY,
  })
  expect(line.map((p) => p.eur)).toEqual([undefined, undefined, undefined])
})

test('a London share is quoted in pence, the rate is for pounds', async () => {
  const { me, instrumentId } = await setup('GBp')
  const line = await me.query(api.invest.priceLine, {
    instrumentId,
    since: TUE - DAY,
  })
  expect(line[0].eur).toBe(1.4)
})

test("another user's share returns nothing", async () => {
  const { t, instrumentId } = await setup('USD', OTHER)
  const me = t.withIdentity({ tokenIdentifier: ME })
  expect(
    await me.query(api.invest.priceLine, { instrumentId, since: TUE - DAY }),
  ).toEqual([])
})

/* Candles and volume (13 Oct): a stored day's open, high, low and shares
   traded come with its close; a day stored before has the close alone. */
test('a day stored as a bar comes back as one', async () => {
  const { t, me, instrumentId } = await setup('EUR')
  const bar = { open: 117, high: 121.5, low: 116.2, volume: 199_000 }
  await t.run(async (ctx) => {
    const first = await ctx.db.query('prices').first()
    if (first !== null) await ctx.db.patch(first._id, bar)
  })
  const line = await me.query(api.invest.priceLine, {
    instrumentId,
    since: TUE - DAY,
  })
  expect(line[0]).toEqual({ asOf: TUE + 20 * 3_600_000, price: 118.76, ...bar })
  expect(line[1]).toEqual({ asOf: WED + 20 * 3_600_000, price: 120 })
})

/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { joinWorth } from '../src/lib/worthHistory'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000
/* Friday 16 Oct 2026, Lisbon: the chart's last day is today. */
const TODAY_END = new Date(2026, 9, 16, 23, 59, 59, 999).getTime()
const dayEnd = (back: number) => TODAY_END - back * DAY
const noon = (back: number) => dayEnd(back) - 12 * 3_600_000
const weekday = (back: number) => {
  const d = new Date(noon(back)).getDay()
  return d !== 0 && d !== 6
}
const year = Array.from({ length: 366 }, (_, i) => dayEnd(365 - i))

type Me = ReturnType<ReturnType<typeof convexTest>['withIdentity']>

/* The whole year as worthHistory reads it, and the same year as the two
   halves the screens now subscribe to, joined. */
async function both(me: Me, dayEnds: Array<number>) {
  const whole = await me.query(api.aggregate.worthHistory, { dayEnds })
  const past = await me.query(api.aggregate.worthPast, { dayEnds })
  const today = await me.query(api.aggregate.worthToday, past.today)
  return { whole, past, joined: joinWorth(past, today) }
}

/* His accounts as they stand: a bank with a USD pocket, a broker, money
   moved between them, positions held all year, sold, bought again today,
   one quoted in pence, and one whose price stopped coming. */
async function fixture(n: { tickers: number }) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const bpi = await me.mutation(api.accounts.create, {
    name: 'BPI',
    kinds: ['bank'],
    currencies: ['EUR', 'USD'],
  })
  const tr = await me.mutation(api.accounts.create, {
    name: 'TR',
    kinds: ['broker'],
    currencies: ['EUR'],
  })
  const ids = await t.run(async (ctx) => {
    const instrument = (symbol: string, currency: string) =>
      ctx.db.insert('instruments', {
        ownerId: ME,
        symbol,
        name: symbol,
        exchange: 'X',
        currency,
        type: 'EQUITY',
      })
    const price = (id: Id<'instruments'>, back: number, p: number) =>
      ctx.db.insert('prices', {
        ownerId: ME,
        instrumentId: id,
        price: p,
        currency: 'X',
        asOf: noon(back) + 8 * 3_600_000,
        fetchedAt: noon(back),
        source: 'Yahoo Finance',
      })
    const trade = (
      id: Id<'instruments'>,
      side: 'buy' | 'sell',
      shares: number,
      back: number,
      priceEur = 10,
    ) =>
      ctx.db.insert('trades', {
        ownerId: ME,
        accountId: tr,
        instrumentId: id,
        side,
        shares,
        priceEur,
        occurredAt: noon(back),
      })
    const aapl = await instrument('AAPL', 'USD')
    const vwce = await instrument('VWCE', 'EUR')
    const vusa = await instrument('VUSA', 'GBp')
    const frozen = await instrument('FROZEN', 'EUR')
    const again = await instrument('AGAIN', 'EUR')
    for (let back = 365; back >= 1; back--) {
      if (!weekday(back)) continue
      await price(aapl, back, 150 + (back % 17))
      await price(vwce, back, 100 + (back % 7))
      await price(vusa, back, 7000 + back)
      if (back >= 25) await price(frozen, back, 40 + (back % 5))
      if (back >= 9) await price(again, back, 20 + (back % 3))
      for (const [currency, rate] of [
        ['USD', 0.9 + (back % 10) / 100],
        ['GBP', 1.15 + (back % 4) / 100],
      ] as const)
        await ctx.db.insert('fxRates', {
          ownerId: ME,
          currency,
          rate,
          asOf: noon(back),
          fetchedAt: noon(back),
          source: 'ECB',
        })
    }
    await trade(aapl, 'buy', 3, 400)
    await trade(aapl, 'buy', 2, 100)
    await trade(vwce, 'buy', 5, 180)
    await trade(vwce, 'sell', 5, 60)
    await trade(vusa, 'buy', 10, 21)
    await trade(frozen, 'buy', 4, 200)
    await trade(again, 'buy', 6, 90)
    await trade(again, 'sell', 6, 8)
    await trade(again, 'buy', 6, 0)
    /* A holdings screen that says one AAPL share fewer than the trades. */
    await ctx.db.insert('holdings', {
      ownerId: ME,
      accountId: tr,
      instrumentId: aapl,
      shares: 4,
      asOf: noon(90),
    })
    /* Enough positions to push the year past one query's look budget, so
       the coarser steps are what is drawn. */
    for (let k = 0; k < n.tickers; k++) {
      const id = await instrument(`T${k}`, 'EUR')
      await trade(id, 'buy', 1, 380)
      for (let back = 365; back >= 1; back -= 3) await price(id, back, 30 + k)
    }
    /* Cash: readings, spending, pay, and moves both ways. */
    for (const [key, value, back] of [
      [`balance:${bpi}:EUR`, 2000, 300],
      [`balance:${bpi}:EUR`, 1500, 40],
      [`balance:${bpi}:USD`, 300, 200],
      [`balance:${tr}:EUR`, 500, 250],
    ] as const)
      await ctx.db.insert('stateSnapshots', {
        ownerId: ME,
        area: 'money',
        key,
        value,
        recordedAt: noon(back),
      })
    for (let back = 299; back >= 0; back -= 4)
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: back % 30 === 3 ? 'income' : 'expense',
        area: 'money',
        occurredAt: noon(back),
        value: back % 30 === 3 ? 900 : 12 + (back % 9),
        unit: 'eur',
        accountId: bpi,
      })
    for (const back of [150, 70, 5]) {
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'move',
        area: 'money',
        occurredAt: noon(back),
        value: -200,
        unit: 'eur',
        accountId: bpi,
        meta: { otherAccountId: tr },
      })
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'move',
        area: 'money',
        occurredAt: noon(back),
        value: 200,
        unit: 'eur',
        accountId: tr,
        meta: { otherAccountId: bpi },
      })
    }
    return { aapl, vusa }
  })
  /* Today's live readings, as the 2-hourly refresh stores them. */
  const live = (id: Id<'instruments'>, p: number, hour: number) =>
    t.run(async (ctx) => {
      await ctx.db.insert('prices', {
        ownerId: ME,
        instrumentId: id,
        price: p,
        currency: 'X',
        asOf: dayEnd(0) - (24 - hour) * 3_600_000,
        fetchedAt: dayEnd(0) - (24 - hour) * 3_600_000,
        source: 'Yahoo Finance',
      })
    })
  return { t, me, ...ids, live }
}

describe('worthHistory split into the past and today', () => {
  for (const tickers of [0, 45])
    test(`the joined halves are the whole, number for number (${tickers} more tickers)`, async () => {
      const { me, aapl, vusa, live } = await fixture({ tickers })
      /* Before today's first price, after it, and after a second one. */
      const a = await both(me, year)
      expect(a.joined).toEqual(a.whole)
      await live(aapl, 171.5, 15)
      await live(vusa, 7123, 16)
      const b = await both(me, year)
      expect(b.joined).toEqual(b.whole)
      expect(b.whole.invested.at(-1)).not.toEqual(a.whole.invested.at(-1))
      /* Today's prices are not the past half's: it is the same answer
         after them, so the year it read stays cached all day. */
      expect(b.past).toEqual(a.past)
      /* The coarse case stops here: each year read is thousands of
         lookups, and CI timed out past 120 s running all six (18 Oct). */
      if (tickers > 0) return
      await live(aapl, 173.25, 17)
      const c = await both(me, year)
      expect(c.joined).toEqual(c.whole)
      expect(c.past).toEqual(a.past)
      /* Today's six and Review's week ask other day ends: a month, a week
         that ended before today, one day. */
      for (const ends of [year.slice(-32), year.slice(-20, -13), [TODAY_END]]) {
        const d = await both(me, ends)
        expect(d.joined).toEqual(d.whole)
      }
    }, 120_000)
})

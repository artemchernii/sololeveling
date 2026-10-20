/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { inStatement } from './holdingsKnown'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'

/* The screen's code against the statement's ticker (19 Oct): his Revolut
   Invest prints XAU for the gold his statement keeps as GC=F. */
test('XAU on the screen is the statement’s GC=F; another account’s is not', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    const account = (name: string) =>
      ctx.db.insert('accounts', {
        ownerId: ME,
        name,
        kinds: ['bank', 'broker'],
        currencies: ['EUR'],
        ibanTails: [],
        cardTails: [],
        order: 0,
      })
    const revolut = await account('Revolut')
    const other = await account('Other')
    for (const symbol of ['GC=F', 'AMZN']) {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol,
        name: symbol,
        exchange: 'NMS',
        currency: 'USD',
        type: symbol === 'GC=F' ? 'FUTURE' : 'EQUITY',
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId: revolut,
        instrumentId,
        side: 'buy',
        shares: 1,
        priceEur: 10,
        occurredAt: 0,
      })
    }
    expect(await inStatement(ctx, ME, revolut, { symbol: 'XAU' })).toBe(true)
    expect(
      await inStatement(ctx, ME, revolut, { symbol: 'AMZN', type: 'EQUITY' }),
    ).toBe(true)
    expect(await inStatement(ctx, ME, revolut, { symbol: 'NFLX' })).toBe(false)
    expect(await inStatement(ctx, ME, other, { symbol: 'AMZN' })).toBe(false)
    expect(
      await inStatement(ctx, 'someone|else', revolut, { symbol: 'AMZN' }),
    ).toBe(false)
  })
})

/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import schema from './schema'
import { tradedAs, tradedInstruments } from './holdingsKnown'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'

/* 22 Nov: Trade Republic's Net Worth PDF read Alphabet as GOOGL and
   Rheinmetall as RHM.F; the account's trades hold GOOG and RHM.DE. */
test('another listing of a company the trades hold is that company', async () => {
  const t = convexTest(schema, modules)
  const found = await t.run(async (ctx) => {
    const tr = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    for (const [symbol, name, isin] of [
      ['GOOG', 'Alphabet Inc.', 'US02079K3059'],
      ['RHM.DE', 'Rheinmetall AG', undefined],
      ['NVDA', 'NVIDIA Corporation', undefined],
    ] as const) {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol,
        name,
        type: 'EQUITY',
        currency: 'USD',
        exchange: 'X',
        ...(isin ? { isin } : {}),
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId: tr,
        instrumentId,
        side: 'buy',
        shares: 1,
        priceEur: 100,
        occurredAt: Date.UTC(2026, 9, 1),
      })
    }
    const traded = await tradedInstruments(ctx, ME, tr)
    return [
      tradedAs(
        { symbol: 'GOOGL', name: 'Alphabet Inc.', isin: 'US02079K3059' },
        traded,
      )?.symbol,
      tradedAs({ symbol: 'RHM.F', name: 'Rheinmetall AG' }, traded)?.symbol,
      tradedAs({ symbol: 'NVDA', name: 'NVIDIA Corp.' }, traded)?.symbol,
      tradedAs({ symbol: 'MSFT', name: 'Microsoft Corp.' }, traded),
    ]
  })
  expect(found).toEqual(['GOOG', 'RHM.DE', 'NVDA', null])
})

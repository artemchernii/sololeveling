import { v } from 'convex/values'

import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { TableNames } from './_generated/dataModel'
import { requireUser } from './auth'

/* Browser tests on mock data (docs/specs/2026-10-05-e2e-tests.md). Only
   the throwaway test backend on his Mac has E2E=1; his dev deployment and
   prod do not, so on them every function here refuses before it reads a
   row. Mock data is an exception to "Nothing is seeded" that Artem agreed
   on 5 Oct — in that test database only, never in his. */

function guard() {
  if (process.env.E2E !== '1')
    throw new Error('E2E functions run only on the test backend.')
}

const DAY = 86_400_000

/* Every table a test can write to. The test database is thrown away, so
   reset reads them whole — never allowed on a real one, which the guard
   makes sure of. */
const TABLES: Array<TableNames> = [
  'accounts',
  'stateSnapshots',
  'logs',
  'fxRates',
  'csvLayouts',
  'intakes',
  'merchantRules',
  'recurring',
  'trades',
  'payees',
]

async function wipe(ctx: MutationCtx) {
  for (const table of TABLES)
    for (const row of await ctx.db.query(table).collect())
      await ctx.db.delete(row._id)
}

/* Revolut's own export header, so a CSV of it is read by code alone —
   no paid reader in a test. */
export const REVOLUT_HEADER =
  'type|product|started date|completed date|description|amount|fee|currency|state|balance'

export const ACTIVO_HEADER = 'date|description|amount|balance'

/**
 * His accounts as they stand on a bad day: everything 8 days old, Revolut
 * holding EUR and USD, three rows of the coming CSV already in. `days`
 * are the local midnights of the four days before today, from the test,
 * so "8 days ago" and the CSV's dates are true whenever it runs.
 */
export const reset = mutation({
  args: { days: v.array(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    await wipe(ctx)
    const now = Date.now()
    const old = now - 8 * DAY

    const account = (
      name: string,
      kinds: Array<'bank' | 'broker' | 'cash'>,
      currencies: Array<string>,
      domain: string | undefined,
      order: number,
    ) =>
      ctx.db.insert('accounts', {
        ownerId,
        name,
        kinds,
        currencies,
        domain,
        ibanTails: [],
        cardTails: [],
        order,
      })
    const revolut = await account(
      'Revolut',
      ['bank', 'broker'],
      ['EUR', 'USD'],
      'revolut.com',
      0,
    )
    const activo = await account(
      'ActivoBank',
      ['bank'],
      ['EUR'],
      'activobank.pt',
      1,
    )
    const cash = await account('Cash', ['cash'], ['EUR'], undefined, 2)

    const balance = (id: typeof revolut, currency: string, value: number) =>
      ctx.db.insert('stateSnapshots', {
        ownerId,
        area: 'money',
        key: `balance:${id}:${currency}`,
        value,
        unit: currency.toLowerCase(),
        recordedAt: old,
        source: 'typed',
      })
    await balance(revolut, 'EUR', 1200)
    await balance(revolut, 'USD', 40)
    await balance(activo, 'EUR', 830.5)
    await balance(cash, 'EUR', 5000)
    await ctx.db.insert('fxRates', {
      ownerId,
      currency: 'USD',
      rate: 0.86,
      asOf: old,
      fetchedAt: old,
      source: 'test',
    })

    /* Three rows the CSV repeats — "already have". */
    const [d1, d2, d3] = args.days
    const spend = (at: number, merchant: string, value: number) =>
      ctx.db.insert('logs', {
        ownerId,
        area: 'money',
        kind: 'expense',
        occurredAt: at + 12 * 3_600_000,
        value,
        unit: 'eur',
        text: merchant,
        accountId: revolut,
        meta: { merchant, raw: merchant, category: 'eating out' },
      })
    await spend(d1, 'Guacamole', 13.05)
    await spend(d2, 'Bolt', 6.7)
    await spend(d3, 'Continente', 41.27)

    await ctx.db.insert('csvLayouts', {
      ownerId,
      headerKey: REVOLUT_HEADER,
      layout: {
        kind: 'transactions',
        institution: 'Revolut',
        dateColumn: 2,
        dateOrder: 'ymd',
        decimal: '.',
        descriptionColumn: 4,
        amountColumn: 5,
        feeColumn: 6,
        currencyColumn: 7,
        stateColumn: 8,
        balanceColumn: 9,
        pendingValues: ['PENDING'],
        skipValues: ['REVERTED', 'DECLINED', 'FAILED'],
        buyPrefixes: [],
        sellPrefixes: [],
        splitPrefixes: [],
      },
      updatedAt: now,
    })
    /* A second bank's export, so a bulk upload touches two accounts. */
    await ctx.db.insert('csvLayouts', {
      ownerId,
      headerKey: ACTIVO_HEADER,
      layout: {
        kind: 'transactions',
        institution: 'ActivoBank',
        currency: 'EUR',
        dateColumn: 0,
        dateOrder: 'ymd',
        decimal: '.',
        descriptionColumn: 1,
        amountColumn: 2,
        balanceColumn: 3,
        pendingValues: [],
        skipValues: [],
        buyPrefixes: [],
        sellPrefixes: [],
        splitPrefixes: [],
      },
      updatedAt: now,
    })
    return null
  },
})

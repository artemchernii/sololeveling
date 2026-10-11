/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY = 86_400_000

/* The account sheet's question (11 Oct), from his accounts as they stood:
   Trade Republic €1,042.46 → €1,543.09 with no row between, ActivoBank's
   file row −€505.20 three days after the later balance. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(as: 'found' | 'none' = 'found') {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days: [] })
  const accountId = await me.mutation(api.e2eUpdate.sheetGap, { as })
  const sheet = async () => {
    const s = await me.query(api.aggregate.accountSheet, { accountId })
    if (s === null) throw new Error('no sheet')
    return s
  }
  const [check] = (await sheet()).checks
  const gap = {
    accountId,
    currency: check.currency,
    from: check.from,
    to: check.to,
    missing: check.missing,
  }
  const activoRows = () =>
    t.run(async (ctx) =>
      (await ctx.db.query('logs').collect()).filter(
        (l) => l.ownerId === ME && l.text === 'Trade Republic',
      ),
    )
  return { t, me, accountId, sheet, gap, activoRows }
}

test('his Trade Republic gap is found in ActivoBank, with the fee', async () => {
  const { me, gap } = await setup()
  expect(gap.missing).toBe(500.63)
  expect(await me.query(api.gapMatch.find, gap)).toMatchObject({
    at: NOON - 5 * DAY,
    amount: 505.2,
    fee: 4.57,
    account: { name: 'ActivoBank', domain: 'activobank.pt' },
  })
})

test('no account shows it: nothing is offered', async () => {
  const { me, gap } = await setup('none')
  expect(await me.query(api.gapMatch.find, gap)).toBeNull()
})

test('same transfer: the side and the fee land, the balance adds up, ActivoBank gains no row', async () => {
  const { me, gap, sheet, activoRows } = await setup()
  const found = await me.query(api.gapMatch.find, gap)
  if (found === null) throw new Error('not found')
  const { moveId, feeId } = await me.mutation(api.gapMatch.sameTransfer, {
    ...gap,
    logId: found.logId,
  })
  const s = await sheet()
  expect(s.checks.map((c) => c.missing)).toEqual([0])
  expect(s.rows.map((r) => [r.kind, r.amount, r.other, r.category])).toEqual(
    expect.arrayContaining([
      ['move', 505.2, 'ActivoBank', null],
      ['spend', -4.57, null, 'fees'],
    ]),
  )
  expect(s.rows).toHaveLength(2)
  const sent = await activoRows()
  expect(sent).toHaveLength(1)
  expect(sent[0].meta?.otherAccountId).toBe(gap.accountId)
  /* Answered: it is not offered a second time. */
  expect(await me.query(api.gapMatch.find, gap)).toBeNull()

  await me.mutation(api.gapMatch.undo, { moveId, feeId })
  expect((await sheet()).rows).toHaveLength(0)
  expect((await sheet()).checks[0].missing).toBe(500.63)
  expect(await activoRows()).toHaveLength(1)
  expect(await me.query(api.gapMatch.find, gap)).not.toBeNull()
})

test('deleting the added side from the sheet leaves the row ActivoBank’s file wrote', async () => {
  const { me, gap, activoRows } = await setup()
  const found = await me.query(api.gapMatch.find, gap)
  if (found === null) throw new Error('not found')
  const { moveId } = await me.mutation(api.gapMatch.sameTransfer, {
    ...gap,
    logId: found.logId,
  })
  await me.mutation(api.logs.remove, { logId: moveId })
  expect(await activoRows()).toHaveLength(1)
  expect(await me.query(api.gapMatch.find, gap)).not.toBeNull()
})

test('refused: someone else, a row that does not fit, a balance that is gone', async () => {
  const { t, me, gap } = await setup()
  const them = t.withIdentity({ tokenIdentifier: OTHER })
  const found = await me.query(api.gapMatch.find, gap)
  if (found === null) throw new Error('not found')
  const logId = found.logId

  expect(await them.query(api.gapMatch.find, gap)).toBeNull()
  await expect(
    them.mutation(api.gapMatch.sameTransfer, { ...gap, logId }),
  ).rejects.toThrow('No such account')
  await expect(
    me.mutation(api.gapMatch.sameTransfer, { ...gap, missing: 300, logId }),
  ).rejects.toThrow('That transfer no longer fits.')
  await expect(
    me.mutation(api.gapMatch.sameTransfer, { ...gap, to: gap.to + 1, logId }),
  ).rejects.toThrow('That balance is gone.')

  const { moveId, feeId } = await me.mutation(api.gapMatch.sameTransfer, {
    ...gap,
    logId,
  })
  await expect(
    them.mutation(api.gapMatch.undo, { moveId, feeId }),
  ).rejects.toThrow('No such log')
  /* A file's own row is not something this undo removes. */
  await expect(
    me.mutation(api.gapMatch.undo, { moveId: logId, feeId: null }),
  ).rejects.toThrow('That is not a transfer added here.')
  await expect(
    me.mutation(api.gapMatch.undo, { moveId, feeId: moveId }),
  ).rejects.toThrow('That is not its fee.')
})

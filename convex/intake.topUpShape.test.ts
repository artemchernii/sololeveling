/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { parseCsv } from '../src/lib/csv'
import { readTrCsv } from '../src/lib/trCsv'

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

/* The drop he is asked to make, on his Trade Republic as it stands once
   the CSV is removed: the statement's rows, then his whole export's money
   rows read again. Only the rows not saved yet are written. */
const HEAD = `"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"`
const cashRow = (
  date: string,
  type: string,
  amount: string,
  fee: string,
  tax: string,
  text: string,
) =>
  `"${date}T10:00:00Z","${date}","DEFAULT","CASH","${type}","","x","","","","${amount}","${fee}","${tax}","EUR","","","","${text}","id","","","",""`
const EXPORT = [
  HEAD,
  cashRow('2026-09-28', 'DIVIDEND', '0.17', '', '-0.03', 'Cash Dividend'),
  cashRow('2026-10-01', 'DIVIDEND', '0.20', '', '-0.03', 'Cash Dividend'),
  cashRow(
    '2026-10-03',
    'CUSTOMER_INPAYMENT',
    '505.20',
    '-5.00',
    '-0.20',
    'Apple Pay Top up',
  ),
  cashRow(
    '2026-11-06',
    'CUSTOMER_INPAYMENT',
    '505.20',
    '-5.00',
    '-0.20',
    'Apple Pay Top up',
  ),
  cashRow('2026-11-09', 'DIVIDEND', '0.30', '', '-0.06', 'Cash Dividend'),
  cashRow(
    '2026-11-12',
    'CUSTOMER_INPAYMENT',
    '111.14',
    '-1.10',
    '-0.04',
    'Apple Pay Top up',
  ),
].join('\n')

test('his re-drop: 3 Oct and 6 Nov already saved, 12 Nov and 28 Sep added once', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const [header, ...body] = parseCsv(EXPORT)
  const reading = readTrCsv(header, body)
  if (!reading) throw new Error('not read')
  const at = (y: number, m: number, d: number) =>
    new Date(y, m, d, 12).getTime()
  const { tr, intakeId } = await t.run(async (ctx) => {
    const tr = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    const log = (
      d: number,
      kind: 'move' | 'expense' | 'income',
      value: number,
      merchant: string,
    ) =>
      ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind,
        value,
        unit: 'eur',
        occurredAt: d,
        text: merchant,
        accountId: tr,
        meta: { merchant },
      })
    /* What the statement saved (21 Nov). */
    await log(at(2026, 9, 1), 'income', 0.17, 'Cash Dividend')
    await log(at(2026, 9, 3), 'move', 500, 'Apple Pay Top up')
    await log(at(2026, 10, 6), 'move', 505.2, 'Apple Pay Top up')
    await log(at(2026, 10, 6), 'expense', 5.2, 'Transfer fee')
    await log(at(2026, 10, 9), 'income', 0.24, 'Cash Dividend')
    const intakeId = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: tr,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'Trade Republic',
      transactions: reading.transactions,
      files: [
        { name: 'Transaction export.csv', size: 1, contentType: 'text/csv' },
      ],
    })
    return { tr, intakeId }
  })
  const review = await me.query(api.intake.review, { intakeId })
  const rows = review?.rows ?? []
  await me.mutation(api.intake.confirmTransactions, {
    intakeId,
    accountId: tr,
    dayStart: at(2026, 10, 22),
    keepBalance: false,
    rows: rows
      .filter((r) => r.duplicateOf === null)
      .map((r) => ({ index: r.index, kind: r.kind })),
  })
  const logs = await t.run((ctx) => ctx.db.query('logs').collect())
  const on = (m: number, d: number) =>
    logs
      .filter((l) => {
        const x = new Date(l.occurredAt)
        return x.getMonth() === m && x.getDate() === d
      })
      .map((l) => (l.kind === 'expense' ? -(l.value ?? 0) : l.value))
      .sort()
  expect(on(8, 28)).toEqual([0.14])
  expect(on(9, 3)).toEqual([500])
  expect(on(10, 6)).toEqual([-5.2, 505.2])
  expect(on(10, 9)).toEqual([0.24])
  expect(on(10, 12)).toEqual([-1.14, 111.14].sort())
})

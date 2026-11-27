import { describe, expect, test } from 'vitest'

import { parseCsv } from './csv'
import { findDuplicates } from './intake'
import { readTrCsv, trColumns } from './trCsv'

/* Rows of his Trade Republic export of 21 Nov (names and ids left out). */
const FILE = `"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"
"2026-09-28T09:31:09.653671Z","2026-09-28","DEFAULT","CASH","DIVIDEND","STOCK","Meta Platforms (A)","US30303M1027","0.4923870000","","0.170000","","-0.03","EUR","0.19","USD","0.876962","Cash Dividend for ISIN US30303M1027","t1","","","",""
"2026-10-03T10:38:40.323391Z","2026-10-03","DEFAULT","CASH","CUSTOMER_INPAYMENT","","Holder","","","","505.200000","-5.00","-0.20","EUR","","","","Apple Pay Top up","t2","Holder","","",""
"2026-11-09T19:42:35.708Z","2026-11-09","DEFAULT","TRADING","BUY","STOCK","NVIDIA","US67066G1040","0.6321910000","158.2600000000","-100.05","-1.00","-0.04","EUR","","","","Buy trade US67066G1040 NVIDIA CORP.      DL-,001, quantity: 0.632191","t3","","","",""
"2026-11-12T10:17:42.713Z","2026-11-12","DEFAULT","TRADING","BUY","STOCK","NVIDIA","US67066G1040","0.6772310000","147.6400000000","-99.99","-1.00","-0.04","EUR","","","","Buy trade","t4","","","",""
"2026-11-12T14:35:49.286Z","2026-11-12","DEFAULT","TRADING","BUY","STOCK","NVIDIA","US67066G1040","1.4158280000","141.3600000000","-200.14","-1.00","-0.04","EUR","","","","Buy trade","t5","","","",""
"2026-11-12T14:51:59.597611Z","2026-11-12","DEFAULT","CASH","CUSTOMER_INPAYMENT","","Holder","","","","111.140000","-1.10","-0.04","EUR","","","","Apple Pay Top up","t6","Holder","","",""
"2026-11-12T14:53:41.783Z","2026-11-12","DEFAULT","TRADING","BUY","STOCK","Nebius Group (A)","NL0009805522","1.6792610000","119.1200000000","-200.03","-1.00","-0.04","EUR","","","","Buy trade","t7","","","",""
`

const read = () => {
  const [header, ...rows] = parseCsv(FILE)
  const r = readTrCsv(header, rows)
  if (!r) throw new Error('not read as Trade Republic')
  return r
}
const cash = (shares: number, price: number, fee: number) =>
  Math.round((shares * price + fee) * 100) / 100

describe('Trade Republic export', () => {
  test('its header is known; a stranger with date and amount is not', () => {
    expect(trColumns(parseCsv(FILE)[0])).not.toBeNull()
    expect(trColumns(['date', 'amount', 'description'])).toBeNull()
  })

  test('a dividend after tax, a top-up and its fee row, as the statement prints them', () => {
    expect(read().transactions).toMatchObject([
      { merchant: 'Cash Dividend', amount: 0.14, self: false },
      { merchant: 'Apple Pay Top up', amount: 505.2, self: true },
      { merchant: 'Transfer fee', amount: -5.2, self: false },
      { merchant: 'Apple Pay Top up', amount: 111.14, self: true },
      { merchant: 'Transfer fee', amount: -1.14, self: false },
    ])
  })

  /* 22 Nov: the statement had saved 6 Nov's top-up as 505.20 and a 5.20
     fee; the file, read as one 500.00 row, saved it a second time. */
  test('a top-up the statement saved is the same payment, not a new one', () => {
    const rows = read().transactions.filter(
      (t) => new Date(t.occurredAt).getDate() === 3,
    )
    const at = rows[0].occurredAt
    const saved = [
      { occurredAt: at, amount: 505.2, merchant: 'Apple Pay Top up' },
      { occurredAt: at, amount: -5.2, merchant: 'Transfer fee' },
    ]
    expect(findDuplicates(rows, saved)).toEqual([0, 1])
  })

  test('buys are trades, the fee and the tax as their fee', () => {
    const { trades } = read()
    expect(trades).toHaveLength(4)
    expect(trades[0]).toMatchObject({
      side: 'buy',
      name: 'NVIDIA',
      isin: 'US67066G1040',
      shares: 0.632191,
      price: 158.26,
      fee: 1.04,
      currency: 'EUR',
    })
    /* The statement's €101.09 for that buy. */
    expect(cash(trades[0].shares, trades[0].price, trades[0].fee ?? 0)).toBe(
      101.09,
    )
  })

  test('12 Nov: three buys and a top-up take 399.72 to the bank’s 6.44', () => {
    const { trades, transactions } = read()
    const day = (t: { occurredAt: number }) =>
      new Date(t.occurredAt).getDate() === 12
    const out = trades
      .filter(day)
      .reduce((s, t) => s + cash(t.shares, t.price, t.fee ?? 0), 0)
    const into = transactions.filter(day).reduce((s, t) => s + t.amount, 0)
    expect(Math.round((399.72 - out + into) * 100) / 100).toBe(6.44)
  })
})

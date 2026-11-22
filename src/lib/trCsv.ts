import { parseClock, parseDay } from './csv'
import type { ReadTrade, ReadTransaction } from './intake'

/* Trade Republic's "Transaction export" CSV (21 Nov, his file of 1 Sep –
   12 Nov). One file holds both the money rows (CASH: dividends, top-ups)
   and the orders (TRADING: buys, sells), with the fee and the tax in
   columns of their own — the column map a model draws has one kind and
   no tax column, so this header is read here, with no model.

   Read the way the app reads Trade Republic's PDF statement, so a row
   saved from either is the same row: a dividend is its amount after tax
   (0.30 − 0.06 = 0.24), a top-up is the 505.20 sent and a row of its
   5.20 fee, as the statement prints it (22 Nov: read as one 500.00 row,
   it missed the statement's 505.20 and the top-up was saved twice), a buy is a trade whose fee is the fee and the tax
   (1.00 + 0.04), its cost the amount and both. */

export const TR_INSTITUTION = 'Trade Republic'

const COLUMNS = [
  'datetime',
  'date',
  'category',
  'type',
  'name',
  'symbol',
  'shares',
  'price',
  'amount',
  'fee',
  'tax',
  'currency',
  'description',
] as const
type Column = (typeof COLUMNS)[number]

export type TrCsvReading = {
  transactions: Array<ReadTransaction>
  trades: Array<ReadTrade>
  /** What was left out and why: "TRADING · SAVINGS_PLAN" → 2. */
  skipped: Record<string, number>
  first?: number
  last?: number
}

/** The header is Trade Republic's export, or null. */
export function trColumns(
  header: ReadonlyArray<string>,
): Record<Column, number> | null {
  const at = header.map((h) => h.trim().toLowerCase())
  const map = {} as Record<Column, number>
  for (const c of COLUMNS) {
    const i = at.indexOf(c)
    if (i < 0) return null
    map[c] = i
  }
  /* Its own columns, so a stranger with a "date" and an "amount" is not
     read as Trade Republic. */
  if (!at.includes('asset_class') || !at.includes('transaction_id')) return null
  return map
}

const num = (s: string) => {
  const t = s.trim()
  if (t === '') return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const round2 = (n: number) => Math.round(n * 100) / 100

export function readTrCsv(
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): TrCsvReading | null {
  const c = trColumns(header)
  if (c === null) return null
  const out: TrCsvReading = { transactions: [], trades: [], skipped: {} }
  const skip = (why: string) => (out.skipped[why] = (out.skipped[why] ?? 0) + 1)
  for (const r of rows) {
    if (r.every((x) => x.trim() === '')) continue
    const cell = (k: Column) => (r[c[k]] ?? '').trim()
    const occurredAt = parseDay(cell('date') || cell('datetime'), 'ymd')
    const amount = num(cell('amount'))
    const fee = num(cell('fee'))
    const tax = num(cell('tax'))
    const currency = cell('currency').toUpperCase() || 'EUR'
    const category = cell('category').toUpperCase()
    const type = cell('type').toUpperCase()
    if (
      occurredAt === undefined ||
      Number.isNaN(amount) ||
      Number.isNaN(fee) ||
      Number.isNaN(tax)
    ) {
      skip('unreadable')
      continue
    }
    const time = parseClock(cell('datetime'))
    out.first = Math.min(out.first ?? Infinity, occurredAt)
    out.last = Math.max(out.last ?? -Infinity, occurredAt)
    if (category === 'TRADING') {
      const shares = num(cell('shares'))
      const price = num(cell('price'))
      const side = type === 'BUY' ? 'buy' : type === 'SELL' ? 'sell' : null
      if (side === null || !(shares > 0) || !(price > 0)) {
        skip(`${category} · ${type || '—'}`)
        continue
      }
      out.trades.push({
        occurredAt,
        name: cell('name'),
        isin: cell('symbol') || undefined,
        side,
        shares,
        price,
        currency,
        fee: round2(-(fee + tax)),
      })
      continue
    }
    const description = cell('description')
    /* A top-up: what was sent, and its fee as a row of its own — the
       statement's shape, so the same top-up from either is one row. */
    const cost = round2(fee + tax)
    if (type !== 'DIVIDEND' && amount !== 0 && cost !== 0) {
      const self =
        type === 'CUSTOMER_INPAYMENT' || type === 'CUSTOMER_OUTPAYMENT'
      const merchant = description || cell('name') || type
      const at = { occurredAt, ...(time ? { time } : {}) }
      out.transactions.push(
        {
          ...at,
          merchant,
          raw: merchant,
          amount: round2(amount),
          currency,
          pending: false,
          self,
        },
        {
          ...at,
          merchant: 'Transfer fee',
          raw: `${merchant} · fee`,
          amount: cost,
          currency,
          pending: false,
          self: false,
        },
      )
      continue
    }
    /* Money: what moved the cash, tax taken off. */
    const net = round2(amount + fee + tax)
    if (net === 0) {
      skip(`${category} · ${type || '—'}`)
      continue
    }
    const merchant =
      type === 'DIVIDEND'
        ? 'Cash Dividend'
        : description || cell('name') || type
    out.transactions.push({
      occurredAt,
      ...(time ? { time } : {}),
      merchant,
      raw: description || merchant,
      amount: net,
      currency,
      pending: false,
      self: type === 'CUSTOMER_INPAYMENT' || type === 'CUSTOMER_OUTPAYMENT',
    })
  }
  return out
}

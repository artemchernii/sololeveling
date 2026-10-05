import { parseDay, parseMoney } from './csv'
import type { DateOrder } from './csv'
import type { ReadTrade, ReadTransaction } from './intake'

/* A CSV's column map (Treasury, 27 Sep). The model sees the header, a few
   sample rows and the distinct values of the short columns, and says which
   column is which — a couple of thousand tokens, under a cent. The code
   then reads every row, so a six-year trading history costs what a
   one-line one does, and nothing is left out because a reply ran long.
   A map is remembered by the file's header (csvLayouts), so the next export
   from the same bank is read with no model at all. */

export type CsvLayout = {
  kind: 'transactions' | 'trades'
  institution?: string
  accountTail?: string
  currency?: string
  dateColumn: number
  dateOrder: DateOrder
  decimal: '.' | ','
  descriptionColumn?: number
  amountColumn?: number
  outColumn?: number
  inColumn?: number
  feeColumn?: number
  currencyColumn?: number
  balanceColumn?: number
  stateColumn?: number
  pendingValues: Array<string>
  skipValues: Array<string>
  tickerColumn?: number
  nameColumn?: number
  isinColumn?: number
  typeColumn?: number
  buyPrefixes: Array<string>
  sellPrefixes: Array<string>
  splitPrefixes: Array<string>
  quantityColumn?: number
  priceColumn?: number
}

const col = { type: ['integer', 'null'] }
const list = { type: 'array', items: { type: 'string' } }

export const LAYOUT_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['transactions', 'trades', 'unknown'] },
    /* Text that may be absent is an empty string, not null: the API takes
       at most 16 nullable fields, and the fifteen columns need them (5 Oct
       — eighteen made every new CSV fail with a 400). */
    institution: { type: 'string' },
    account_tail: { type: 'string' },
    currency: { type: 'string' },
    date_column: col,
    date_order: { type: 'string', enum: ['ymd', 'dmy', 'mdy'] },
    decimal: { type: 'string', enum: ['.', ','] },
    description_column: col,
    amount_column: col,
    out_column: col,
    in_column: col,
    fee_column: col,
    currency_column: col,
    balance_column: col,
    state_column: col,
    pending_values: list,
    skip_values: list,
    ticker_column: col,
    name_column: col,
    isin_column: col,
    type_column: col,
    buy_prefixes: list,
    sell_prefixes: list,
    split_prefixes: list,
    quantity_column: col,
    price_column: col,
  },
  required: [
    'kind',
    'institution',
    'account_tail',
    'currency',
    'date_column',
    'date_order',
    'decimal',
    'description_column',
    'amount_column',
    'out_column',
    'in_column',
    'fee_column',
    'currency_column',
    'balance_column',
    'state_column',
    'pending_values',
    'skip_values',
    'ticker_column',
    'name_column',
    'isin_column',
    'type_column',
    'buy_prefixes',
    'sell_prefixes',
    'split_prefixes',
    'quantity_column',
    'price_column',
  ],
  additionalProperties: false,
} as const

/** Rows the model sees: the start, the middle and the end of the file. */
export function sampleRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
): Array<ReadonlyArray<string>> {
  if (rows.length <= 25) return [...rows]
  const mid = Math.floor(rows.length / 2)
  return [
    ...rows.slice(0, 10),
    ...rows.slice(mid - 4, mid + 4),
    ...rows.slice(-7),
  ]
}

/** Every value of a column with few of them — so a type seen once in six
    years ("STOCK SPLIT") is still in front of the model. */
export function shortColumns(
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): Array<{ column: number; name: string; values: Array<string> }> {
  const out = []
  for (const [i, name] of header.entries()) {
    const seen = new Set<string>()
    for (const r of rows) {
      const v = (r[i] ?? '').trim()
      if (v !== '') seen.add(v)
      if (seen.size > 30) break
    }
    if (seen.size > 0 && seen.size <= 30 && /[a-z]/i.test([...seen].join('')))
      out.push({ column: i, name, values: [...seen] })
  }
  return out
}

export function layoutPrompt(opts: {
  header: ReadonlyArray<string>
  rows: ReadonlyArray<ReadonlyArray<string>>
  total: number
  fileName?: string
}): string {
  const line = (r: ReadonlyArray<string>) =>
    r.map((c) => JSON.stringify(c)).join(',')
  const cols = opts.header.map((h, i) => `${i}: ${h}`).join('\n')
  const short = shortColumns(opts.header, opts.rows)
    .map((c) => `column ${c.column} (${c.name}): ${c.values.join(' | ')}`)
    .join('\n')
  return [
    `A CSV exported from a bank or broker${opts.fileName ? ` (${opts.fileName})` : ''}, ${opts.total} rows. Say which column is which; code will read every row with your answer.`,
    `Columns (0-based):\n${cols}`,
    `Sample rows:\n${sampleRows(opts.rows).map(line).join('\n')}`,
    short
      ? `Every value of the short columns, across the whole file:\n${short}`
      : '',
    'kind = "transactions" for cash moving (a bank or card statement), "trades" for buying and selling shares (a broker\'s order or trade history), else "unknown".',
    'institution: the bank or broker, if the columns or values make it clear (e.g. Revolut exports "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance" for the bank and "Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate" for trading), else an empty string. account_tail only if an IBAN or card number is in the file, else an empty string. currency: the currency when no column says it, else an empty string.',
    'date_column: the date the money moved or the trade happened (for a bank with started and completed dates, the started one). date_order: how the day, month and year are ordered when not ISO. decimal: the decimal mark numbers use.',
    'Transactions: description_column; amount_column when one signed column holds the amount, else out_column and in_column; fee_column if a fee is charged apart from the amount; currency_column; balance_column (the balance after the row) if any; state_column if rows have a state, with pending_values (states that are not final yet, e.g. PENDING) and skip_values (states to leave out, e.g. REVERTED, DECLINED, FAILED).',
    'Trades: ticker_column, name_column, isin_column (whichever exist); type_column; buy_prefixes and sell_prefixes — short uppercase prefixes that start every buy or sell value (e.g. ["BUY"], ["SELL"]), never matching dividends, fees, top-ups, withdrawals or splits; split_prefixes for stock splits (e.g. ["STOCK SPLIT"]; the quantity on such a row is the shares added); quantity_column (shares); price_column (price per share, not the total).',
    'Use null for a column that does not exist and [] for a list that does not apply. Never guess a column you cannot see.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const idx = (v: unknown, width: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < width
    ? v
    : undefined
const words = (v: unknown) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.trim().toUpperCase())
        .slice(0, 20)
    : []
const text = (v: unknown, max = 60) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

export function parseLayout(
  raw: string,
  width: number,
): { ok: true; layout: CsvLayout } | { ok: false; error: string } {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'The reader answered in a shape it should not.' }
  }
  if (j.kind !== 'transactions' && j.kind !== 'trades') {
    return {
      ok: false,
      error: 'That CSV does not look like a statement or a list of trades.',
    }
  }
  const dateColumn = idx(j.date_column, width)
  if (dateColumn === undefined) {
    return { ok: false, error: 'No date column was found in that CSV.' }
  }
  const layout: CsvLayout = {
    kind: j.kind,
    institution: text(j.institution),
    accountTail: /\d{4}$/.exec(
      String(j.account_tail ?? '').replace(/\D/g, ''),
    )?.[0],
    currency: text(j.currency, 3)?.toUpperCase(),
    dateColumn,
    dateOrder:
      j.date_order === 'dmy' || j.date_order === 'mdy' ? j.date_order : 'ymd',
    decimal: j.decimal === ',' ? ',' : '.',
    descriptionColumn: idx(j.description_column, width),
    amountColumn: idx(j.amount_column, width),
    outColumn: idx(j.out_column, width),
    inColumn: idx(j.in_column, width),
    feeColumn: idx(j.fee_column, width),
    currencyColumn: idx(j.currency_column, width),
    balanceColumn: idx(j.balance_column, width),
    stateColumn: idx(j.state_column, width),
    pendingValues: words(j.pending_values),
    skipValues: words(j.skip_values),
    tickerColumn: idx(j.ticker_column, width),
    nameColumn: idx(j.name_column, width),
    isinColumn: idx(j.isin_column, width),
    typeColumn: idx(j.type_column, width),
    buyPrefixes: words(j.buy_prefixes),
    sellPrefixes: words(j.sell_prefixes),
    splitPrefixes: words(j.split_prefixes),
    quantityColumn: idx(j.quantity_column, width),
    priceColumn: idx(j.price_column, width),
  }
  if (layout.kind === 'transactions') {
    if (layout.descriptionColumn === undefined)
      return {
        ok: false,
        error: 'No description column was found in that CSV.',
      }
    if (
      layout.amountColumn === undefined &&
      layout.outColumn === undefined &&
      layout.inColumn === undefined
    )
      return { ok: false, error: 'No amount column was found in that CSV.' }
  } else {
    if (
      layout.tickerColumn === undefined &&
      layout.nameColumn === undefined &&
      layout.isinColumn === undefined
    )
      return {
        ok: false,
        error: 'No ticker or name column was found in that CSV.',
      }
    if (
      layout.typeColumn === undefined ||
      layout.quantityColumn === undefined ||
      layout.priceColumn === undefined ||
      layout.buyPrefixes.length === 0
    )
      return {
        ok: false,
        error:
          'The buy, sell, shares or price column was not found in that CSV.',
      }
  }
  return { ok: true, layout }
}

/** "Bolt.euo2609161656" → "Bolt"; "Card payment *4521" → "Card payment". */
export function cleanMerchant(description: string): string {
  const s = description
    .replace(/[.*#]\s*[a-z]*\d{5,}\w*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (s || description.trim()).slice(0, 80)
}

/** Words that mean his own money moving, not spending. */
export function selfHint(description: string): boolean {
  return /\b(top.?up|exchanged? to|exchange to|to pocket|from pocket|savings|vault|to investment|from investment|transfer to own|own account)\b/i.test(
    description,
  )
}

export type CsvReading = {
  kind: 'transactions' | 'trades'
  transactions: Array<ReadTransaction>
  trades: Array<ReadTrade>
  /** Stock splits: the shares a split added, on its day. */
  splits: Array<{ occurredAt: number; name: string; shares: number }>
  /** What was left out and why: "DIVIDEND" → 184, "REVERTED" → 3. */
  skipped: Record<string, number>
  balance?: { value: number; currency: string; asOf: number }
  first?: number
  last?: number
  tickers: number
}

const cell = (r: ReadonlyArray<string>, i: number | undefined) =>
  i === undefined ? '' : (r[i] ?? '').trim()
const starts = (v: string, prefixes: ReadonlyArray<string>) => {
  const u = v.toUpperCase()
  return prefixes.some((p) => u === p || u.startsWith(p))
}

export function applyLayout(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  layout: CsvLayout,
): CsvReading {
  const skipped: Record<string, number> = {}
  const skip = (why: string) => {
    skipped[why] = (skipped[why] ?? 0) + 1
  }
  const transactions: Array<ReadTransaction> = []
  const trades: Array<ReadTrade> = []
  const splits: CsvReading['splits'] = []
  let balance: CsvReading['balance']
  let first: number | undefined
  let last: number | undefined
  const tickers = new Set<string>()
  const money = (v: string) => parseMoney(v, layout.decimal)

  for (const r of rows) {
    const at = parseDay(cell(r, layout.dateColumn), layout.dateOrder)
    if (at === undefined) {
      skip('no date')
      continue
    }
    if (layout.kind === 'transactions') {
      const state = cell(r, layout.stateColumn).toUpperCase()
      if (state && starts(state, layout.skipValues)) {
        skip(state)
        continue
      }
      let amount: number | undefined
      let currency = cell(r, layout.currencyColumn).toUpperCase() || undefined
      if (layout.amountColumn !== undefined) {
        const m = money(cell(r, layout.amountColumn))
        amount = m?.value
        currency ??= m?.currency
      } else {
        const out = money(cell(r, layout.outColumn))
        const inn = money(cell(r, layout.inColumn))
        if (out || inn) amount = (inn?.value ?? 0) - Math.abs(out?.value ?? 0)
        currency ??= out?.currency ?? inn?.currency
      }
      const fee = money(cell(r, layout.feeColumn))?.value ?? 0
      if (amount !== undefined) amount -= Math.abs(fee)
      const description = cell(r, layout.descriptionColumn)
      if (amount === undefined || Math.abs(amount) < 0.005 || !description) {
        skip('no amount')
        continue
      }
      const pending = state !== '' && starts(state, layout.pendingValues)
      const cur = (currency ?? layout.currency ?? 'EUR').slice(0, 3)
      const self = selfHint(description)
      transactions.push({
        occurredAt: at,
        merchant: cleanMerchant(description),
        raw: description.slice(0, 160),
        amount: Math.round(amount * 100) / 100,
        currency: cur,
        pending,
        counterparty: self ? description.slice(0, 80) : undefined,
        self,
      })
      const bal = money(cell(r, layout.balanceColumn))
      if (bal && !pending && (balance === undefined || at >= balance.asOf)) {
        balance = { value: bal.value, currency: cur, asOf: at }
      }
    } else {
      const type = cell(r, layout.typeColumn).toUpperCase()
      if (layout.splitPrefixes.length && starts(type, layout.splitPrefixes)) {
        const name = cell(r, layout.nameColumn) || cell(r, layout.tickerColumn)
        const shares = money(cell(r, layout.quantityColumn))?.value ?? 0
        if (name && shares > 0) splits.push({ occurredAt: at, name, shares })
        else skip('unreadable')
        continue
      }
      const side = starts(type, layout.buyPrefixes)
        ? 'buy'
        : starts(type, layout.sellPrefixes)
          ? 'sell'
          : null
      if (side === null) {
        skip(type || 'no type')
        continue
      }
      const ticker = cell(r, layout.tickerColumn)
      const name = cell(r, layout.nameColumn) || ticker
      const isinCell = cell(r, layout.isinColumn).toUpperCase()
      const shares = Math.abs(money(cell(r, layout.quantityColumn))?.value ?? 0)
      const price = money(cell(r, layout.priceColumn))
      if (!name || shares <= 0 || !price || price.value <= 0) {
        skip('unreadable')
        continue
      }
      tickers.add(ticker || name)
      trades.push({
        occurredAt: at,
        name: name.slice(0, 120),
        isin: /^[A-Z]{2}[A-Z0-9]{10}$/.test(isinCell) ? isinCell : undefined,
        side,
        shares,
        price: price.value,
        currency: (
          price.currency ??
          (cell(r, layout.currencyColumn).toUpperCase() || undefined) ??
          layout.currency ??
          'EUR'
        ).slice(0, 3),
      })
    }
    first = first === undefined ? at : Math.min(first, at)
    last = last === undefined ? at : Math.max(last, at)
  }
  return {
    kind: layout.kind,
    transactions,
    trades,
    splits,
    skipped,
    balance,
    first,
    last,
    tickers: tickers.size,
  }
}

const DAY_FMT = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** "Revolut · trades · Jun 8, 2020 → Sep 18, 2026" */
export function csvTitle(
  institution: string | undefined,
  reading: CsvReading,
): string {
  const what = reading.kind === 'trades' ? 'trades' : 'statement'
  const span =
    reading.first !== undefined && reading.last !== undefined
      ? ` · ${DAY_FMT.format(reading.first)} → ${DAY_FMT.format(reading.last)}`
      : ''
  return `${institution ?? 'CSV'} · ${what}${span}`
}

/** "184 dividend, 126 cash top-up left out" — what the file had that this
    does not bring in, in the file's own words. */
export function skippedNote(
  skipped: Record<string, number>,
): string | undefined {
  const parts = Object.entries(skipped)
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `${n} ${why.toLowerCase()}`)
  return parts.length ? `Left out: ${parts.join(', ')}.` : undefined
}

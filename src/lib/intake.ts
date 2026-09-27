/* The intake (Treasury, 27 Sep): what he drops on + — a statement, a
   history screenshot, a broker's holdings — read once by Claude Haiku 4.5,
   then checked by him. This file is the part that must be right every
   time, so it is pure and tested: what the reader is asked for, what is
   accepted back, and the rules that turn rows into something he can trust
   — merchants cleaned, moves told apart from spending, duplicates caught,
   things that come round found, and holdings completed from market data.

   Shaped on his real examples: a Revolut PDF (41 rows; €6,601 out on
   paper, €561 of it spent — the rest moved to TR, 212 and Revolut's own
   broker), a Revolut history screenshot (the same rows a day off, the
   posting day vs the spending day), a Trade Republic holdings screenshot
   (value and % since buy, no shares). */

export const INTAKE_MODEL = 'claude-haiku-4-5'
export const INTAKE_MODEL_NAME = 'Claude Haiku 4.5'
export const MAX_INTAKE_FILES = 6
export const MAX_INTAKE_BYTES = 10 * 1024 * 1024
export const INTAKES_PER_WINDOW = 40
export const INTAKE_WINDOW_MS = 30 * 86_400_000

export type ReadableFile =
  | { block: 'document'; mediaType: 'application/pdf' }
  | { block: 'image'; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { block: 'text'; mediaType: 'text/csv' }

export function readableFile(
  contentType: string,
  name = '',
): ReadableFile | null {
  const t = contentType.toLowerCase()
  if (t === 'application/pdf') return { block: 'document', mediaType: t }
  if (t === 'image/png' || t === 'image/jpeg' || t === 'image/webp') {
    return { block: 'image', mediaType: t }
  }
  if (
    t === 'text/csv' ||
    t === 'application/vnd.ms-excel' ||
    name.toLowerCase().endsWith('.csv')
  ) {
    return { block: 'text', mediaType: 'text/csv' }
  }
  return null
}

/* ---- What the reader is asked for ------------------------------------- */

export const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['transactions', 'holdings', 'unknown'] },
    institution: { type: ['string', 'null'] },
    holder_name: { type: ['string', 'null'] },
    title: { type: 'string' },
    currency: { type: ['string', 'null'] },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          merchant: { type: 'string' },
          raw: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          pending: { type: 'boolean' },
          counterparty: { type: ['string', 'null'] },
          self_transfer: { type: 'boolean' },
          category: { type: ['string', 'null'] },
        },
        required: [
          'date',
          'merchant',
          'raw',
          'amount',
          'currency',
          'pending',
          'counterparty',
          'self_transfer',
          'category',
        ],
        additionalProperties: false,
      },
    },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          isin: { type: ['string', 'null'] },
          shares: { type: ['number', 'null'] },
          average_price_eur: { type: ['number', 'null'] },
          value_eur: { type: ['number', 'null'] },
          change_pct: { type: ['number', 'null'] },
        },
        required: [
          'name',
          'isin',
          'shares',
          'average_price_eur',
          'value_eur',
          'change_pct',
        ],
        additionalProperties: false,
      },
    },
    closing_balance: { type: ['number', 'null'] },
    closing_balance_date: { type: ['string', 'null'] },
    cash_eur: { type: ['number', 'null'] },
    total_eur: { type: ['number', 'null'] },
  },
  required: [
    'kind',
    'institution',
    'holder_name',
    'title',
    'currency',
    'transactions',
    'positions',
    'closing_balance',
    'closing_balance_date',
    'cash_eur',
    'total_eur',
  ],
  additionalProperties: false,
} as const

export const SPEND_CATEGORY_IDS = [
  'groceries',
  'eating out',
  'transport',
  'car',
  'home',
  'health',
  'fun',
  'clothes',
  'shopping',
  'subscriptions',
  'travel',
  'other',
] as const

export function intakePrompt(opts: {
  files: number
  today: string
  accounts: ReadonlyArray<string>
}): string {
  return [
    `${opts.files === 1 ? 'This is one file' : `These are ${opts.files} files`} a person dropped into their personal finance app. Today is ${opts.today}.`,
    'Decide what it is. kind = "transactions" for a bank or card statement (PDF or CSV) or a screenshot of a transaction history; kind = "holdings" for a broker screen listing investment positions; otherwise "unknown".',
    'title: a short human label, e.g. "Revolut statement · EUR · Aug 1 → Sep 27" or "Trade Republic · holdings". institution: the bank or broker. holder_name: the account holder\'s name if printed.',
    'For transactions: every row, once, including rows under a "pending" heading (pending = true). date as YYYY-MM-DD (for "Yesterday" or a weekday, resolve against today). amount is signed: money out negative, money in positive, in the row\'s own currency. merchant: a clean human name ("Bolt", not "Bolt.euo2609161656"; "Claude subscription" for "Anthropic* Claude Sub"). raw: the description as printed, one line.',
    "counterparty: for transfers, who is on the other side. self_transfer = true when money goes to or comes from the holder's own name, another of their own accounts, a card top-up, a savings or investment account inside the same bank, or a known broker the person uses (their accounts: " +
      (opts.accounts.join(', ') || 'unknown') +
      '). A card payment to a broker such as Trade Republic or Trading 212 is a deposit to that broker — self_transfer = true.',
    `category (spending only, else null): one of ${SPEND_CATEGORY_IDS.join(', ')}.`,
    'closing_balance: the final balance printed for the account (completed transactions only) and closing_balance_date; else null.',
    'For holdings: every position, once. value_eur: its current value as printed. change_pct: the % gain or loss since buying if printed (negative for a loss). shares and average_price_eur only if printed. cash_eur: uninvested cash if shown; total_eur: the account total if shown.',
    'Read numbers exactly: a European comma decimal (1.234,56) is 1234.56. Never invent a number that is not printed — use null. Leave the array that does not apply empty.',
  ].join('\n')
}

/* ---- What is accepted back ------------------------------------------- */

export type ReadTransaction = {
  occurredAt: number
  merchant: string
  raw: string
  amount: number
  currency: string
  pending: boolean
  counterparty?: string
  self: boolean
  category?: string
}

export type ReadPosition = {
  name: string
  isin?: string
  shares?: number
  priceEur?: number
  valueEur?: number
  changePct?: number
}

export type Reading = {
  kind: 'transactions' | 'holdings'
  title: string
  institution?: string
  holderName?: string
  currency?: string
  transactions: Array<ReadTransaction>
  positions: Array<ReadPosition>
  balance?: { value: number; asOf: number }
  cashEur?: number
  totalEur?: number
}

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const pos = (v: unknown) => {
  const n = num(v)
  return n !== undefined && n > 0 ? n : undefined
}
const str = (v: unknown, max = 120) =>
  typeof v === 'string' && v.trim().length > 0
    ? v.trim().slice(0, max)
    : undefined

/** "2026-09-24" → local noon that day: a statement's day, not an instant. */
export function dayToMs(date: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  if (!m) return undefined
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12)
  return Number.isNaN(d.getTime()) ? undefined : d.getTime()
}

export function parseReading(
  text: string,
): ({ ok: true } & Reading) | { ok: false; error: string } {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'The reader answered in a shape it should not.' }
  }
  if (j.kind !== 'transactions' && j.kind !== 'holdings') {
    return {
      ok: false,
      error:
        'That does not look like a statement, a history or a broker screen.',
    }
  }
  const transactions: Array<ReadTransaction> = []
  for (const r of Array.isArray(j.transactions)
    ? (j.transactions as Array<Record<string, unknown>>)
    : []) {
    const at = typeof r.date === 'string' ? dayToMs(r.date) : undefined
    const amount = num(r.amount)
    const merchant = str(r.merchant, 80)
    if (
      at === undefined ||
      amount === undefined ||
      amount === 0 ||
      merchant === undefined
    )
      continue
    const currency =
      str(r.currency, 3)?.toUpperCase() ??
      str(j.currency, 3)?.toUpperCase() ??
      'EUR'
    const category = str(r.category, 24)?.toLowerCase()
    transactions.push({
      occurredAt: at,
      merchant,
      raw: str(r.raw, 160) ?? merchant,
      amount: Math.round(amount * 100) / 100,
      currency,
      pending: r.pending === true,
      counterparty: str(r.counterparty, 80),
      self: r.self_transfer === true,
      category:
        category &&
        (SPEND_CATEGORY_IDS as ReadonlyArray<string>).includes(category)
          ? category
          : undefined,
    })
  }
  const positions: Array<ReadPosition> = []
  for (const r of Array.isArray(j.positions)
    ? (j.positions as Array<Record<string, unknown>>)
    : []) {
    const name = str(r.name)
    if (name === undefined) continue
    const isin =
      typeof r.isin === 'string' && /^[A-Z]{2}[A-Z0-9]{10}$/.test(r.isin)
        ? r.isin
        : undefined
    positions.push({
      name,
      isin,
      shares: pos(r.shares),
      priceEur: pos(r.average_price_eur),
      valueEur: pos(r.value_eur),
      changePct: num(r.change_pct),
    })
  }
  if (j.kind === 'transactions' && transactions.length === 0) {
    return { ok: false, error: 'No transactions were found in it.' }
  }
  if (j.kind === 'holdings' && positions.length === 0) {
    return { ok: false, error: 'No positions were found on it.' }
  }
  const balanceValue = num(j.closing_balance)
  const balanceAt =
    typeof j.closing_balance_date === 'string'
      ? dayToMs(j.closing_balance_date)
      : undefined
  const cash = num(j.cash_eur)
  return {
    ok: true,
    kind: j.kind,
    title:
      str(j.title, 80) ?? (j.kind === 'holdings' ? 'Holdings' : 'Transactions'),
    institution: str(j.institution, 60),
    holderName: str(j.holder_name, 80),
    currency: str(j.currency, 3)?.toUpperCase(),
    transactions: transactions.slice(0, 1000),
    positions: positions.slice(0, 100),
    balance:
      balanceValue !== undefined
        ? { value: balanceValue, asOf: balanceAt ?? Date.now() }
        : undefined,
    cashEur: cash !== undefined && cash >= 0 ? cash : undefined,
    totalEur: pos(j.total_eur),
  }
}

/* ---- Rules --------------------------------------------------------- */

/**
 * The key a merchant is remembered by: "Bolt.euo2609161656" and "Bolt" are
 * one merchant; so are "Bnp Toc, Lisboa" and "BNP TOC". Lower case, no
 * references or digits, no trailing place.
 */
export function merchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .split(/[,*]/)[0]
    .replace(/\.[a-z]*\d[\w.]*/g, '')
    .replace(/\d+/g, ' ')
    .replace(/[^a-zÀ-ɏ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ExistingRow = {
  occurredAt: number
  amount: number // signed, same convention as a read row
  merchant: string
}

const DAY = 86_400_000

/**
 * The row already in his history this one repeats — same amount to the
 * cent, same merchant, within two days either way (a screenshot shows the
 * day he spent, a statement the day it posted). Each existing row can
 * absorb only one new row, so two real €6.70 lunches on consecutive days
 * stay two.
 */
export function findDuplicates(
  incoming: ReadonlyArray<
    Pick<ReadTransaction, 'occurredAt' | 'amount' | 'merchant'>
  >,
  existing: ReadonlyArray<ExistingRow>,
): Array<number | null> {
  const used = new Set<number>()
  return incoming.map((r) => {
    const key = merchantKey(r.merchant)
    let best: number | null = null
    let bestGap = Infinity
    existing.forEach((e, i) => {
      if (used.has(i)) return
      if (Math.abs(e.amount - r.amount) > 0.005) return
      if (merchantKey(e.merchant) !== key) return
      const gap = Math.abs(e.occurredAt - r.occurredAt)
      if (gap <= 2 * DAY + 3_600_000 && gap < bestGap) {
        best = i
        bestGap = gap
      }
    })
    if (best !== null) used.add(best)
    return best
  })
}

export type Recurring = {
  key: string
  merchant: string
  amount: number
  day: number
  months: number
}

/**
 * What comes round: a merchant charged about the same amount (±5%) in at
 * least two different months, on about the same day (±3). The Claude
 * subscription on the 5th, twice, is one; eight lunches at Bnp Toc are not
 * (different amounts, no steady day).
 */
export function findRecurring(
  rows: ReadonlyArray<
    Pick<ReadTransaction, 'occurredAt' | 'amount' | 'merchant'>
  >,
): Array<Recurring> {
  const byKey = new Map<string, Array<(typeof rows)[number]>>()
  for (const r of rows) {
    if (r.amount >= 0) continue
    const k = merchantKey(r.merchant)
    byKey.set(k, [...(byKey.get(k) ?? []), r])
  }
  const out: Array<Recurring> = []
  for (const [key, list] of byKey) {
    const groups: Array<Array<(typeof rows)[number]>> = []
    for (const r of list) {
      const g = groups.find(
        (g) => Math.abs(g[0].amount - r.amount) <= Math.abs(g[0].amount) * 0.05,
      )
      if (g) g.push(r)
      else groups.push([r])
    }
    for (const g of groups) {
      const months = new Set(
        g.map((r) => {
          const d = new Date(r.occurredAt)
          return `${d.getFullYear()}-${d.getMonth()}`
        }),
      )
      if (months.size < 2 || months.size !== g.length) continue
      const days = g.map((r) => new Date(r.occurredAt).getDate())
      if (Math.max(...days) - Math.min(...days) > 3) continue
      out.push({
        key,
        merchant: g[0].merchant,
        amount:
          Math.round((g.reduce((t, r) => t + r.amount, 0) / g.length) * 100) /
          100,
        day: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
        months: months.size,
      })
    }
  }
  return out
}

/**
 * Which of his accounts a move went to or came from, by name: "Trade
 * Republic", "To investment account" (the same bank's broker), "Trading
 * 212". Null when it cannot tell — he picks, once.
 */
export function matchAccount(
  counterparty: string | undefined,
  accounts: ReadonlyArray<{ id: string; name: string; domain?: string }>,
  sameInstitutionId?: string,
): string | null {
  if (!counterparty) return null
  const c = counterparty.toLowerCase()
  if (
    sameInstitutionId &&
    /(investment|invest|savings|vault|pocket|stocks)/.test(c)
  ) {
    return sameInstitutionId
  }
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  const alias = (name: string) => {
    const n = name.toLowerCase()
    if (/^tr$|trade republic/.test(n))
      return ['trade republic', 'traderepublic']
    if (/^212$|trading 212|t212/.test(n))
      return ['trading 212', 'trading212', 't212']
    return [n]
  }
  for (const a of accounts) {
    const names = [
      ...alias(a.name),
      ...(a.domain ? [a.domain.split('.')[0]] : []),
    ]
    if (names.some((n) => c.includes(n))) return a.id
    const w = words(a.name)
    if (w.length > 0 && w.every((x) => x.length > 2 && words(c).includes(x)))
      return a.id
  }
  return null
}

/* ---- Holdings completed from market data ------------------------------ */

/**
 * A position as a broker's list shows it, completed. TR prints the value
 * and % since buy, not shares: what he paid is value ÷ (1 + %), shares are
 * value ÷ today's price in euros. Each filled field says it was worked
 * out, so a number never passes for one he read.
 */
export function completePosition(
  p: ReadPosition,
  priceEurToday: number | undefined,
): {
  shares?: number
  priceEur?: number
  sharesCalculated: boolean
  priceCalculated: boolean
} {
  let shares = p.shares
  let priceEur = p.priceEur
  let sharesCalculated = false
  let priceCalculated = false
  if (
    shares === undefined &&
    p.valueEur !== undefined &&
    priceEurToday &&
    priceEurToday > 0
  ) {
    shares = Math.round((p.valueEur / priceEurToday) * 1e6) / 1e6
    sharesCalculated = true
  }
  if (priceEur === undefined && shares && shares > 0) {
    const paid =
      p.valueEur !== undefined &&
      p.changePct !== undefined &&
      p.changePct > -100
        ? p.valueEur / (1 + p.changePct / 100)
        : undefined
    if (paid !== undefined) {
      priceEur = Math.round((paid / shares) * 10000) / 10000
      priceCalculated = true
    }
  }
  return { shares, priceEur, sharesCalculated, priceCalculated }
}

/**
 * The share class a broker's name asks for. "Alphabet (A)" is GOOGL, not
 * GOOG — and Yahoo lists GOOG first, so taking the top result would file
 * the wrong share silently. Returns the preferred symbol among candidates.
 */
export function preferClass(
  name: string,
  candidates: ReadonlyArray<{ symbol: string; exchange: string; type: string }>,
): number {
  const cls = /\((?:class\s*)?([ABC])\)|\bclass\s+([ABC])\b/i.exec(name)
  const letter = (cls?.[1] ?? cls?.[2])?.toUpperCase()
  const scored = candidates.map((c, i) => {
    let s = 0
    if (c.type === 'EQUITY' || c.type === 'ETF') s += 10
    if (/\.(TO|NE|V)$/.test(c.symbol)) s -= 8 // Canadian receipts, not the share
    if (/=F$/.test(c.symbol)) s -= 20 // futures
    if (letter === 'A' && /GOOGL$|BRK-A$/.test(c.symbol)) s += 6
    if (letter === 'C' && /GOOG$/.test(c.symbol)) s += 6
    if (letter === 'A' && c.symbol === 'GOOG') s -= 6
    return { i, s }
  })
  scored.sort((a, b) => b.s - a.s || a.i - b.i)
  return scored.length > 0 ? scored[0].i : -1
}

/** "Alphabet (A)" → "Alphabet": what a ticker search can find. */
export function searchableName(name: string): string {
  return name
    .replace(/\((?:class\s*)?[ABC]\)/gi, '')
    .replace(/\b(inc|corp|corporation|plc|ag|sa|nv|ltd|holdings?)\b\.?/gi, '')
    .replace(/\.com\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

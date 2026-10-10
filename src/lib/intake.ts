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
/* Bumped whenever what the reader is asked changes: a file read by an
   older reader is read again rather than its reading reused (3 Oct — a
   reused reading kept "1 100.00" as 100 after the prompt was fixed). */
export const READER_VERSION = 7
export const INTAKE_MODEL_NAME = 'Claude Haiku 4.5'
export const MAX_INTAKE_FILES = 6
/* UPDATE ALL (3 Oct): a year of four banks' monthly statements. */
export const MAX_BATCH_FILES = 60
export const MAX_INTAKE_BYTES = 10 * 1024 * 1024
export const INTAKES_PER_WINDOW = 40
export const INTAKE_WINDOW_MS = 30 * 86_400_000
/* A reading silent this long has died with its action (the platform stops
   one at ten minutes): shown as stopped, and it can be tried again. */
export const READING_DEAD_MS = 11 * 60_000

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

/* The API takes at most 16 fields that may be null (3 Oct: a seventeenth
   — the ticker — made every reading fail with a 400). A field that is
   only text says "none" with an empty string instead; a test counts. */
export const MAX_NULLABLE_FIELDS = 16

export const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['transactions', 'holdings', 'trades', 'unknown'],
    },
    institution: { type: ['string', 'null'] },
    account_tail: { type: ['string', 'null'] },
    holder_name: { type: ['string', 'null'] },
    title: { type: 'string' },
    currency: { type: 'string' },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          merchant: { type: 'string' },
          raw: { type: 'string' },
          amount: { type: 'number' },
          amount_text: { type: 'string' },
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
          'amount_text',
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
          symbol: { type: 'string' },
          shares: { type: ['number', 'null'] },
          average_price_eur: { type: ['number', 'null'] },
          value_eur: { type: ['number', 'null'] },
          change_pct: { type: ['number', 'null'] },
        },
        required: [
          'name',
          'isin',
          'symbol',
          'shares',
          'average_price_eur',
          'value_eur',
          'change_pct',
        ],
        additionalProperties: false,
      },
    },
    trades: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          name: { type: 'string' },
          isin: { type: ['string', 'null'] },
          side: { type: 'string', enum: ['buy', 'sell', 'reward'] },
          shares: { type: 'number' },
          price: { type: 'number' },
          currency: { type: 'string' },
          fee: { type: ['number', 'null'] },
          crypto: { type: 'boolean' },
        },
        required: [
          'date',
          'name',
          'isin',
          'side',
          'shares',
          'price',
          'currency',
          'fee',
          'crypto',
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
    'account_tail',
    'holder_name',
    'title',
    'currency',
    'transactions',
    'positions',
    'trades',
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
  'phone',
  'health',
  'fun',
  'clothes',
  'shopping',
  'subscriptions',
  'services',
  'travel',
  'other',
] as const

export function intakePrompt(opts: {
  files: number
  today: string
  accounts: ReadonlyArray<string>
  /** What the person typed about it, if anything. */
  hint?: string | null
}): string {
  return [
    ...(opts.hint
      ? [
          `The person says what it is: "${opts.hint.replace(/"/g, "'")}". Trust it for what the file is and whose it is (institution, kind); it never gives you numbers.`,
        ]
      : []),
    `${opts.files === 1 ? 'This is one file' : `These are ${opts.files} files`} a person dropped into their personal finance app. Today is ${opts.today}.`,
    'Decide what it is — what happened to money, or what is held:',
    '  kind = "transactions" — cash moving: a bank or card statement (PDF or CSV), or a screenshot of a transaction history (payments, transfers, top-ups, salary).',
    '  kind = "holdings" — a snapshot of what is held: a broker or investing screen listing positions with their value (Trade Republic, Trading 212, Revolut Invest portfolio).',
    '  kind = "trades" — buying and selling shares: a broker\'s order or trade history, or a trade confirmation, with a date, shares and a price per trade.',
    '  otherwise "unknown". A screen of positions is holdings even when it shows a daily change; a list of orders is trades even when it shows a total.',
    'title: a short human label, e.g. "Revolut statement · EUR · Aug 1 → Sep 27", "Trade Republic · holdings", "Trading 212 · orders". institution: the bank or broker the file is FROM, e.g. "Revolut" or "Revolut Invest". account_tail: the last four digits of the IBAN or card number the file is about, if printed (e.g. "0120" for PT50 … 0120), else null. holder_name: the account holder\'s name if printed.',
    'For transactions: every row, once, including rows under a "pending" heading (pending = true). Several screenshots of one history overlap: a row on two of them is still one row. A number printed under or beside a row\'s amount, smaller, is the balance after it — never the amount. A row cut off at the edge of a screenshot, its amount not shown, is left out (it is whole on another). A pending heading shown only as a total, its lines folded away ("Pending  -1.205,20"), is one row: merchant "Pending", that total as the amount, pending = true. date as YYYY-MM-DD (for "Yesterday" or a weekday, resolve against today). amount is signed: money out negative, money in positive, in the row\'s own currency. amount_text: the amount exactly as it is printed, every character kept ("1 100.00", "-1.205,20"). merchant: a clean human name ("Bolt", not "Bolt.euo2609161656"; "Claude subscription" for "Anthropic* Claude Sub"). raw: the description as printed, one line.',
    'counterparty: for transfers, who is on the other side — the name and any IBAN or card digits printed for it ("ARTEM CHERNII, PT50…0120", "card ••2789"). self_transfer = true when money goes to or comes from the holder\'s own name, another of their own accounts, a card top-up, a savings or investment account inside the same bank, or a known broker the person uses (their accounts: ' +
      (opts.accounts.join(', ') || 'unknown') +
      '). A card payment to a broker such as Trade Republic or Trading 212 is a deposit to that broker — self_transfer = true.',
    `category (spending only, else null): one of ${SPEND_CATEGORY_IDS.join(', ')}.`,
    'closing_balance: the final balance printed for the account (completed transactions only) and closing_balance_date; else null.',
    'For holdings: every position, once. value_eur: its current value as printed. change_pct: the % gain or loss since buying if printed (negative for a loss). shares and average_price_eur only if printed — a number printed under or beside the name together with a ticker ("7.36542714 IGLN" on Trading 212) is the shares, and the ticker is symbol (else an empty string). cash_eur: uninvested cash if shown; total_eur: the account total if shown. An account summary screen with a total and cash but no list of positions (Trading 212\'s "Account value … Cash") is holdings with no positions.',
    'For trades: every buy and sell, once — date as YYYY-MM-DD, name as printed, isin if printed, side, shares, price per share and its currency, fee as printed (in the same currency, else null). Skip cancelled or rejected orders. crypto = false for shares and funds.',
    'A crypto statement (e.g. Revolut Digital Assets) is trades: name = the coin\'s symbol as printed (BTC, ETH, SOL), crypto = true, each buy and sell with its quantity, price, currency and fee; each staking reward is side "reward" with its quantity, price 0, currency "EUR". Its account summary\'s closing amount of every coin still held (more than 0) goes in positions: symbol and name = the coin\'s symbol, shares = the closing amount, value_eur = its closing value. closing_balance = the statement\'s total closing value and closing_balance_date = the last day of its period.',
    'Read numbers exactly: a European comma decimal (1.234,56) is 1234.56; thousands set apart by a space ("1 100.00", "1 277,35") are one number — 1100.00, never 100.00. Never invent a number that is not printed — use null. Leave the arrays that do not apply empty.',
  ].join('\n')
}

/* ---- What is accepted back ------------------------------------------- */

export type ReadTransaction = {
  occurredAt: number
  /** "13:20", when the file prints a time (a CSV does, a PDF does not). */
  time?: string
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
  /** The ticker printed beside it, when the screen prints one. */
  symbol?: string
  shares?: number
  priceEur?: number
  valueEur?: number
  changePct?: number
}

export type ReadTrade = {
  occurredAt: number
  name: string
  isin?: string
  side: 'buy' | 'sell' | 'reward'
  shares: number
  price: number
  currency: string
  /** As printed, in `currency`. */
  fee?: number
  /** A coin: priced as SYM-EUR. */
  crypto?: boolean
}

export type Reading = {
  kind: 'transactions' | 'holdings' | 'trades'
  title: string
  institution?: string
  accountTail?: string
  trades: Array<ReadTrade>
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
  if (
    j.kind !== 'transactions' &&
    j.kind !== 'holdings' &&
    j.kind !== 'trades'
  ) {
    return {
      ok: false,
      error:
        'That does not look like a statement, a history, a broker screen or a list of trades.',
    }
  }
  const transactions = txRows(j)
  const positions = positionRows(j)
  const trades = tradeRows(j)
  if (j.kind === 'trades' && trades.length === 0) {
    return { ok: false, error: 'No buys or sells were found in it.' }
  }
  const tailRaw = typeof j.account_tail === 'string' ? j.account_tail : ''
  const accountTail = /\d{4}$/.exec(tailRaw.replace(/\D/g, ''))?.[0]
  if (j.kind === 'transactions' && transactions.length === 0) {
    return { ok: false, error: 'No transactions were found in it.' }
  }
  /* An account summary — total and cash, the positions on another screen
     (Trading 212, 3 Oct) — is a holdings read with no rows. */
  if (
    j.kind === 'holdings' &&
    positions.length === 0 &&
    num(j.cash_eur) === undefined &&
    num(j.total_eur) === undefined
  ) {
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
      str(j.title, 80) ??
      (j.kind === 'holdings'
        ? 'Holdings'
        : j.kind === 'trades'
          ? 'Trades'
          : 'Transactions'),
    institution: str(j.institution, 60),
    accountTail,
    holderName: str(j.holder_name, 80),
    currency: str(j.currency, 3)?.toUpperCase(),
    transactions: transactions.slice(0, 1000),
    positions: positions.slice(0, 100),
    trades: trades.slice(0, 500),
    balance:
      balanceValue !== undefined
        ? { value: balanceValue, asOf: balanceAt ?? Date.now() }
        : undefined,
    cashEur: cash !== undefined && cash >= 0 ? cash : undefined,
    totalEur: pos(j.total_eur),
  }
}

/**
 * An amount as a bank prints it → its size: "1 100.00", "1.100,00",
 * "1,100.00", "−1.205,20", "1 100" → 1100 / 1205.2. The last separator
 * with one or two digits after it is the decimal point; every other
 * separator — dot, comma, space, apostrophe — only groups thousands.
 * Undefined when there is no number in it.
 */
export function printedAmount(text: string): number | undefined {
  const t = text.replace(/[^\d.,'\s]/g, '').trim()
  if (!/\d/.test(t)) return undefined
  const m = /[.,](\d{1,2})$/.exec(t)
  const whole = (m ? t.slice(0, m.index) : t).replace(/\D/g, '')
  const cents = m ? m[1].padEnd(2, '0') : '00'
  const n = Number(`${whole || '0'}.${cents}`)
  return Number.isFinite(n) ? n : undefined
}

function txRows(j: Record<string, unknown>): Array<ReadTransaction> {
  const transactions: Array<ReadTransaction> = []
  for (const r of Array.isArray(j.transactions)
    ? (j.transactions as Array<Record<string, unknown>>)
    : []) {
    const at = typeof r.date === 'string' ? dayToMs(r.date) : undefined
    /* The number as printed, worked out here rather than trusted to the
       model: it read ActivoBank's "1 100.00" as 100 twice, rule or no rule
       (3 Oct). Its own number keeps the sign. */
    const read = num(r.amount)
    const printed =
      typeof r.amount_text === 'string'
        ? printedAmount(r.amount_text)
        : undefined
    const amount =
      read !== undefined && printed !== undefined && printed > 0
        ? Math.sign(read || 1) * printed
        : read
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
  return transactions
}

function positionRows(j: Record<string, unknown>): Array<ReadPosition> {
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
    const symbol =
      typeof r.symbol === 'string' && /^[A-Z0-9.]{1,12}$/.test(r.symbol.trim())
        ? r.symbol.trim()
        : undefined
    positions.push({
      name,
      isin,
      symbol,
      shares: pos(r.shares),
      priceEur: pos(r.average_price_eur),
      valueEur: pos(r.value_eur),
      changePct: num(r.change_pct),
    })
  }
  return positions
}

function tradeRows(j: Record<string, unknown>): Array<ReadTrade> {
  const trades: Array<ReadTrade> = []
  for (const r of Array.isArray(j.trades)
    ? (j.trades as Array<Record<string, unknown>>)
    : []) {
    const at = typeof r.date === 'string' ? dayToMs(r.date) : undefined
    const name = str(r.name)
    const shares = pos(r.shares)
    /* A staking reward is given, at price 0. */
    const price = r.side === 'reward' ? 0 : pos(r.price)
    const fee = num(r.fee)
    if (
      at === undefined ||
      name === undefined ||
      shares === undefined ||
      price === undefined ||
      (r.side !== 'buy' && r.side !== 'sell' && r.side !== 'reward')
    )
      continue
    trades.push({
      occurredAt: at,
      name,
      isin:
        typeof r.isin === 'string' && /^[A-Z]{2}[A-Z0-9]{10}$/.test(r.isin)
          ? r.isin
          : undefined,
      side: r.side,
      shares,
      price,
      currency: str(r.currency, 3)?.toUpperCase() ?? 'EUR',
      ...(fee !== undefined && fee > 0 ? { fee } : {}),
      ...(r.crypto === true ? { crypto: true } : {}),
    })
  }
  return trades
}

/* ---- A reading in progress --------------------------------------------- */

/** The objects of a JSON array that are complete so far, in text the
    model is still writing. */
function completeObjects(
  text: string,
  key: string,
): Array<Record<string, unknown>> {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text)
  if (!m) return []
  const out: Array<Record<string, unknown>> = []
  let depth = 0
  let inString = false
  let start = -1
  for (let i = m.index + m[0].length; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          out.push(
            JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>,
          )
        } catch {
          /* a row it wrote badly: the final parse decides */
        }
        start = -1
      }
    } else if (c === ']' && depth === 0) break
  }
  return out
}

function scalar(text: string, key: string): string | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text)
  if (!m) return undefined
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return undefined
  }
}

/**
 * What can be known from the reader's answer so far — it streams, in the
 * schema's order: what it is, the bank, the title, then the rows one by
 * one, the balance last. Rows go through the same checks as the final
 * parse; anything unfinished is left for later.
 */
const READING_KINDS: ReadonlyArray<Reading['kind']> = [
  'transactions',
  'holdings',
  'trades',
]

export function partialReading(text: string) {
  const j: Record<string, unknown> = {
    currency: scalar(text, 'currency'),
    transactions: completeObjects(text, 'transactions'),
    positions: completeObjects(text, 'positions'),
    trades: completeObjects(text, 'trades'),
  }
  const kind = scalar(text, 'kind')
  const tail = /\d{4}$/.exec(
    (scalar(text, 'account_tail') ?? '').replace(/\D/g, ''),
  )?.[0]
  const balance = /"closing_balance"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(text)
  const balanceDate = scalar(text, 'closing_balance_date')
  return {
    kind: READING_KINDS.find((k) => k === kind),
    institution: str(scalar(text, 'institution'), 60),
    title: str(scalar(text, 'title'), 80),
    accountTail: tail,
    transactions: txRows(j),
    positions: positionRows(j),
    trades: tradeRows(j),
    balance:
      balance && balanceDate && dayToMs(balanceDate) !== undefined
        ? { value: Number(balance[1]), asOf: dayToMs(balanceDate) as number }
        : undefined,
    currency: str(j.currency, 3)?.toUpperCase(),
  }
}

/* What a reading costs (Claude Haiku 4.5: $1 in, $5 out per million
   tokens), from the API's own counts. */
export const INTAKE_USD_PER_TOKEN = { input: 1 / 1e6, output: 5 / 1e6 }

export function readingCost(usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}): number {
  const input =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.1
  return (
    input * INTAKE_USD_PER_TOKEN.input +
    usage.output_tokens * INTAKE_USD_PER_TOKEN.output
  )
}

/** "$0.23", "$0.004", "under $0.001", "$0". */
export function usd(n: number): string {
  if (n === 0) return '$0'
  if (n < 0.001) return 'under $0.001'
  if (n < 0.01) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
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
  /** The line as the bank printed it, when the row came from a file. */
  raw?: string
}

/* The words a bank's own line is told apart by: "SEGURO", "ALLIANZ",
   "EMPRESTIMO" — not "TRF", dates or numbers. */
function lineWords(text: string): Set<string> {
  return new Set(
    plain(text)
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4),
  )
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
    Pick<ReadTransaction, 'occurredAt' | 'amount' | 'merchant'> & {
      raw?: string
    }
  >,
  existing: ReadonlyArray<ExistingRow>,
): Array<number | null> {
  const used = new Set<number>()
  /* A row this file holds more than once (a coffee bought every few
     days) never gets the week-long window: a week apart, it is another. */
  const repeats = new Map<string, number>()
  for (const r of incoming) {
    const k = `${merchantKey(r.merchant)}:${Math.round(r.amount * 100)}`
    repeats.set(k, (repeats.get(k) ?? 0) + 1)
  }
  /* Every pair that could be the same row, closest in time first — so a
     row takes the stored row of its own day before a neighbour can (10
     Oct: in a file printed newest first, the 16th's lunch took the 15th's
     place and the 15th's was written again). */
  const pairs: Array<{ r: number; e: number; gap: number }> = []
  for (const [ri, r] of incoming.entries()) {
    const key = merchantKey(r.merchant)
    const often = (repeats.get(`${key}:${Math.round(r.amount * 100)}`) ?? 0) > 1
    /* The same row read twice can come back named twice ("Seguro Allianz"
       from the statement, "Insurance" from a screenshot — 3 Oct): the
       bank's own line, shared, says it is the same. */
    const words = lineWords(`${r.merchant} ${r.raw ?? ''}`)
    for (const [i, e] of existing.entries()) {
      if (Math.abs(e.amount - r.amount) > 0.005) continue
      const shared = [...lineWords(`${e.merchant} ${e.raw ?? ''}`)].filter(
        (w) => words.has(w),
      ).length
      if (merchantKey(e.merchant) !== key && shared === 0) continue
      const gap = Math.abs(e.occurredAt - r.occurredAt)
      /* A statement can date a row by its value day, the app by the day it
         moved — Est Servico on 9 Sep here, 14 Sep there (3 Oct). The
         bank's own line, closely shared, stretches the window to a week. */
      const window =
        shared >= 2 && !often ? 7 * DAY + 3_600_000 : 2 * DAY + 3_600_000
      if (gap <= window) pairs.push({ r: ri, e: i, gap })
    }
  }
  pairs.sort((x, y) => x.gap - y.gap || x.r - y.r || x.e - y.e)
  const out: Array<number | null> = incoming.map(() => null)
  for (const p of pairs) {
    if (out[p.r] !== null || used.has(p.e)) continue
    out[p.r] = p.e
    used.add(p.e)
  }
  return out
}

/**
 * Rows of one account that are the same row twice — two files that named
 * it differently, before duplicates were matched by the bank's own line
 * (3 Oct). The later-written of each pair is returned, to remove.
 */
export function storedDuplicates(
  rows: ReadonlyArray<{
    id: string
    written: number
    occurredAt: number
    amount: number
    merchant: string
    raw?: string
    /** The file it came from: two rows of one file are two rows. */
    file?: string
  }>,
): Array<string> {
  /* File by file, oldest first, each laid against what came before it —
     the same comparison a new file gets. A typed row is its own file. */
  const groups = new Map<string, Array<(typeof rows)[number]>>()
  for (const r of [...rows].sort((x, y) => x.written - y.written)) {
    const k = r.file ?? `typed:${r.id}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const kept: Array<ExistingRow> = []
  const out: Array<string> = []
  for (const group of groups.values()) {
    const hits = findDuplicates(group, kept)
    for (const [i, r] of group.entries()) {
      if (hits[i] === null) kept.push(r)
      else out.push(r.id)
    }
  }
  return out
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
        (grp) =>
          Math.abs(grp[0].amount - r.amount) <= Math.abs(grp[0].amount) * 0.05,
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

/* How far a listing's price today may sit from the one a screen implies
   and still be the same fund: a day's move, not a different share. */
const PRICE_FIT = 0.15

/**
 * The listing a holdings screen showed, by its price. When the screen
 * printed both value and shares, value ÷ shares is the price per share —
 * a listing whose price today is far from it is another fund. Trading 212
 * prints "SHLD" for iShares Digital Security; Yahoo's top "SHLD" is a US
 * defence ETF at four times the price (3 Oct: €2,885 shown, €2,014 held).
 * Among listings that fit, the printed ticker's own line, then the
 * closest. Returns -1 when none fits.
 */
export function fitByPrice(
  printedEur: number,
  candidates: ReadonlyArray<{ symbol: string }>,
  pricesEur: ReadonlyArray<number | undefined>,
  symbol?: string,
): number {
  const base = symbol ? symbol.split('.')[0].toUpperCase() : undefined
  let best = -1
  let bestKey: [number, number] = [Infinity, Infinity]
  candidates.forEach((c, i) => {
    const p = pricesEur[i]
    if (p === undefined || !(p > 0) || !(printedEur > 0)) return
    const off = Math.abs(p - printedEur) / printedEur
    if (off > PRICE_FIT) return
    const key: [number, number] = [
      base !== undefined && c.symbol.split('.')[0].toUpperCase() === base
        ? 0
        : 1,
      off,
    ]
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = i
      bestKey = key
    }
  })
  return best
}

/**
 * Files the screen's unpriced tickers as frozen (UNPRICED) — only when
 * the market priced another position of the same screen. With no answer
 * at all Yahoo may be down, and a live fund filed as frozen would never
 * be priced again: then each stays asked (preferred -1). In place.
 */
export function settleFrozen<
  TPosition extends {
    candidates: Array<{
      symbol: string
      name: string
      exchange: string
      type: string
    }>
    preferred?: number
    todayPriceEur?: number
    todayAsOf?: number
  },
>(
  positions: Array<TPosition>,
  frozen: ReadonlyArray<{
    at: number
    candidate: { symbol: string; name: string; exchange: string; type: string }
    priceEur: number
  }>,
  now: number,
): void {
  const answered = positions.some(
    (p) =>
      p.todayPriceEur !== undefined &&
      p.preferred !== undefined &&
      p.preferred >= 0,
  )
  if (!answered) return
  for (const f of frozen)
    positions[f.at] = {
      ...positions[f.at],
      candidates: [f.candidate],
      preferred: 0,
      todayPriceEur: f.priceEur,
      todayAsOf: now,
    }
}

/** "Alphabet (A)" → "Alphabet": what a ticker search can find. */
export function searchableName(name: string): string {
  return brokerName(name)
    .replace(/\((?:class\s*)?[ABC]\)/gi, '')
    .replace(/\b(inc|corp|corporation|plc|ag|sa|nv|ltd|holdings?)\b\.?/gi, '')
    .replace(/\.com\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ---- A broker's cash statement: its trades ----------------------------- */

/* Trade Republic's statement prints each order as a cash row: "Buy trade
   US67066G1040 NVIDIA CORP. DL-,001, quantity: 0.186115" (27 Sep: 57 of
   his 113 rows, each asking "to which account?"). They are shares bought
   inside the account, not money leaving it — split out as trades, which
   fill in what he paid. The amount is what the order cost, fee and all. */
const TRADE_ROW =
  /^(buy trade|sell trade|savings plan execution|saveback execution|round ?up execution)\s+([A-Z]{2}[A-Z0-9]{9}\d)\s+(.+?),\s*quantity:\s*([\d.,]+)\s*$/i

export function tradeInRow(t: ReadTransaction): ReadTrade | null {
  const m = TRADE_ROW.exec(t.raw.trim())
  if (!m || t.pending) return null
  const q = m[4].includes('.') ? m[4].replace(/,/g, '') : m[4].replace(',', '.')
  const shares = Number(q)
  if (!Number.isFinite(shares) || shares <= 0 || Math.abs(t.amount) < 0.005)
    return null
  return {
    occurredAt: t.occurredAt,
    name: m[3].trim().slice(0, 120),
    isin: m[2].toUpperCase(),
    side: /^sell/i.test(m[1]) ? 'sell' : 'buy',
    shares,
    price: Math.round((Math.abs(t.amount) / shares) * 1e6) / 1e6,
    currency: t.currency,
  }
}

/* A dividend or interest paid into the account is money in, not his own
   money moving. */
const EARNED_ROW = /^(cash dividend|dividend\b|interest payment|interest\b)/i

/** A statement's rows, with its trades taken out and its earnings marked. */
export function splitStatement(rows: ReadonlyArray<ReadTransaction>): {
  transactions: Array<ReadTransaction>
  trades: Array<ReadTrade>
} {
  const transactions: Array<ReadTransaction> = []
  const trades: Array<ReadTrade> = []
  for (const r of rows) {
    const t = tradeInRow(r)
    if (t) trades.push(t)
    else if (r.amount > 0 && EARNED_ROW.test(r.raw.trim()))
      transactions.push({ ...r, self: false, counterparty: undefined })
    else transactions.push(r)
  }
  return { transactions, trades }
}

/** A reading kept from before this split: its trades are still rows. */
export function hasTradeRows(rows: ReadonlyArray<ReadTransaction>): boolean {
  return rows.some((r) => tradeInRow(r) !== null)
}

/* ---- His own money ------------------------------------------------------ */

/* Cash out of a machine, or into his wallet from one (1 Oct: a typed
   "withdraw +€20" in Cash was counted as income). */
const WITHDRAWAL = /\b(atm|withdraw(al)?|levantamento|cash out)\b/i
/* Money arriving on a top-up is his own card's. A top-up going OUT is a
   phone bill ("Vodafone carregamento"), so only money in counts. */
const TOP_UP = /\b(top[- ]?up|carregamento)\b/i

const plain = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * His own money, whatever the reader thought (1 Oct: ActivoBank's "TRF.
 * P/O ARTEM CHERNII" +€400 was filed as income). True for a transfer from
 * or to his own name, cash out of an ATM, money arriving on a top-up.
 * `names` are his — the statement's holder, his sign-in — and a name
 * counts only whole, every word of it, in either order.
 */
export function ownMoney(
  row: {
    amount: number
    merchant: string
    raw?: string
    counterparty?: string
  },
  names: ReadonlyArray<string>,
): boolean {
  const said = `${row.merchant} ${row.raw ?? ''}`
  if (WITHDRAWAL.test(said)) return true
  if (row.amount > 0 && TOP_UP.test(said)) return true
  /* Only who is on the other side counts — the merchant or counterparty
     the reader named — never the whole printed line: going out, "From:
     ARTEM" is the sender, him; coming in, a salary can print "To: ARTEM"
     as its receiver (1 Oct review). */
  const where = plain(`${row.merchant} ${row.counterparty ?? ''}`)
  const words = new Set(where.split(/[^a-z]+/).filter(Boolean))
  /* A Portuguese bank prints who is on the other side in the line itself:
     "TRF … P/ <IBAN> ARTEM CHERNII" — to him; "TRF. P/O ARTEM CHERNII" — by
     his order (3 Oct: BPI's screens, merchant "SEPA Transfer"). */
  const line = plain(row.raw ?? '')
  const after = row.amount < 0 ? /\bp\/\s(.*)$/ : /\bp\/o\s(.*)$/
  for (const w of after.exec(line)?.[1]?.split(/[^a-z]+/) ?? [])
    if (w) words.add(w)
  return names.some((n) => {
    const parts = plain(n)
      .split(/[^a-z]+/)
      .filter((w) => w.length > 1)
    return parts.length >= 2 && parts.every((w) => words.has(w))
  })
}

/* ---- A broker's own spelling of a company ------------------------------ */

/** Trade Republic's "ALPHABET INC.CL.A DL-,001" → "ALPHABET INC. (Class A)":
    the par value and currency tail gone, a share class said the way
    preferClass reads it. */
export function brokerName(name: string): string {
  return name
    .replace(/\s+(DL|EO|DK|SF|LS|SK|NK|YN|HD)\s*[-,.\d]+\s*$/i, '')
    .replace(/\s+[-,.\d]+\s*$/, '')
    .replace(/\s*ADR(\/\d+)?\b/i, '')
    .replace(/\s*\bCL\.?\s*([ABC])\b/i, ' (Class $1)')
    .replace(/\s+([ABC])$/i, ' (Class $1)')
    .replace(/\s+/g, ' ')
    .trim()
}

const WORD = (name: string) =>
  searchableName(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .find((w) => w.length >= 3)

/**
 * The instrument an account already holds that a broker's row means: the
 * same ISIN, or the same first word of the name ("META PLATF. A" is Meta
 * Platforms) and, when the row names a class, the same class. A statement
 * and a screenshot of one account must land on one ticker, or they never
 * meet. Returns the index, or -1.
 */
export function sameCompany(
  row: { name: string; isin?: string },
  held: ReadonlyArray<{ symbol: string; name: string; isin?: string }>,
): number {
  if (row.isin) {
    const i = held.findIndex((h) => h.isin === row.isin)
    if (i >= 0) return i
  }
  const word = WORD(row.name)
  if (!word) return -1
  const hits = held.flatMap((h, i) => (WORD(h.name) === word ? [i] : []))
  if (hits.length <= 1) return hits[0] ?? -1
  const pick = preferClass(
    brokerName(row.name),
    hits.map((i) => ({ ...held[i], exchange: '', type: 'EQUITY' })),
  )
  return pick >= 0 ? hits[pick] : -1
}

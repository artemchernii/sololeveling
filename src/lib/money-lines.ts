/* Typed money (27 Sep, "adding money"): one line, or a line each, in the
   words he would say — and a row he can check comes back, the same row a
   statement fills. What it understands:

     in 2900 salary              money in, filed as salary
     +350 irs return bpi         money in, into BPI
     out 1200 laptop revolut     money out, shopping would be a guess
     -48 groceries               money out
     bpi → tr 2000               a transfer (also ->, >, "to", "from x to y")
     transfer 500 revolut invest a transfer; the other side is asked for
     bought 3 msft 402 tr        a buy: shares, ticker, price per share
     sold 2 aapl @ 210 212       a sell
     … yesterday / mon / 12 sep  when, if not today
     $50, 50 usd                 a currency, if not euros

   Pure: accounts come in, a proposal goes out. Nothing here is a number
   the app shows — it is what he typed, read back to him. */

import { INCOME_CATEGORIES, SPEND_CATEGORIES } from './money'

export type LineAccount = {
  id: string
  name: string
  kinds: ReadonlyArray<'bank' | 'broker' | 'cash'>
  currencies: ReadonlyArray<string>
}

export type LineKind = 'in' | 'out' | 'transfer' | 'buy' | 'sell'

export type ParsedLine = {
  text: string
  kind: LineKind | null
  amount?: number
  currency: string
  /** in / out / buy / sell: where it happened. */
  accountId?: string
  /** transfer: from and to. */
  fromId?: string
  toId?: string
  category?: string
  note?: string
  /** buy / sell. */
  symbol?: string
  shares?: number
  price?: number
  occurredAt: number
  /** What it could not tell, in words for the row: "which account". */
  missing: Array<string>
}

const DAY = 86_400_000

/* An array read that may miss, typed as one. */
const nth = <T>(list: ReadonlyArray<T>, i: number): T | undefined =>
  i >= 0 && i < list.length ? list[i] : undefined

const CURRENCY_WORDS: Record<string, string> = {
  '€': 'EUR',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  $: 'USD',
  usd: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  '£': 'GBP',
  gbp: 'GBP',
  chf: 'CHF',
}

const IN_WORDS = ['in', 'got', 'received', 'earned', 'income', 'paid-in']
const OUT_WORDS = ['out', 'spent', 'spend', 'paid', 'pay', 'purchase']
const TRANSFER_WORDS = ['transfer', 'move', 'moved', 'sent', 'send', 'topup']
const BUY_WORDS = ['buy', 'bought']
const SELL_WORDS = ['sell', 'sold']
const ARROWS = ['→', '->', '=>', '>']
const FILLER = new Set(['x', '@', 'at', 'of', 'for', 'shares', 'share', 'sh'])

/* Money in he names — not the salary's only; a gift or the IRS too. */
const IN_EXTRA: Record<string, string> = {
  bonus: 'bonus',
  irs: 'irs return',
  refund: 'refund',
  gift: 'gift',
  dividend: 'dividend',
  dividends: 'dividend',
  interest: 'interest',
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

function toNumber(token: string): number | null {
  const t = token.replace(/[€$£]/g, '')
  if (!/^\d+([.,]\d+)?$/.test(t) && !/^\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(t))
    return null
  /* "1.234,56" and "1,234.56": the last separator is the decimal one when
     two or fewer digits follow it. */
  const last = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','))
  const decimals = last >= 0 ? t.length - last - 1 : 0
  const clean =
    last >= 0 && decimals <= 2
      ? t.slice(0, last).replace(/[.,]/g, '') + '.' + t.slice(last + 1)
      : t.replace(/[.,]/g, '')
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

/** Words an account answers to: its name, its name's words run together,
    its initials when it has two words or more ("tr"), its digits ("212"),
    and its first word when no other account starts with it. */
function aliases(
  a: LineAccount,
  all: ReadonlyArray<LineAccount>,
): Array<string> {
  const first = (x: LineAccount) => x.name.toLowerCase().trim().split(/\s+/)[0]
  const name = a.name.toLowerCase().trim()
  const words = name.split(/\s+/)
  const out = new Set([name, words.join('')])
  if (words.length > 1) out.add(words.map((w) => w[0]).join(''))
  for (const w of words) if (/^\d+$/.test(w)) out.add(w)
  if (all.filter((x) => first(x) === words[0]).length === 1) out.add(words[0])
  return [...out]
}

type Mention = { at: number; length: number; id: string }

/* Accounts named in the tokens, longest name first, each token used once:
   "revolut invest" is Invest, not Revolut followed by a word. */
function findAccounts(
  tokens: Array<string>,
  accounts: ReadonlyArray<LineAccount>,
): Array<Mention> {
  const names = accounts
    .flatMap((a) => aliases(a, accounts).map((alias) => ({ id: a.id, alias })))
    .sort((x, y) => y.alias.length - x.alias.length)
  const used = new Set<number>()
  const found: Array<Mention> = []
  for (const { id, alias } of names) {
    const parts = alias.split(/\s+/)
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (parts.some((p, j) => used.has(i + j) || tokens[i + j] !== p)) continue
      for (let j = 0; j < parts.length; j++) used.add(i + j)
      found.push({ at: i, length: parts.length, id })
      break
    }
  }
  return found.sort((x, y) => x.at - y.at)
}

/* "yesterday", "mon", "12 sep", "sep 12", "12/09", "2026-09-12" → a day;
   the tokens it used are cleared. A day not today is its local noon, like
   a statement's row; today is now. */
function findDay(
  tokens: Array<string>,
  today: number,
  now: number,
): { at: number; used: Array<number> } {
  const noon = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
  const base = new Date(today)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'today') return { at: now, used: [i] }
    if (t === 'yesterday') {
      return { at: noon(new Date(today - DAY / 2)), used: [i] }
    }
    const wd = Math.max(WEEKDAYS.indexOf(t), WEEKDAY_NAMES.indexOf(t))
    if (wd >= 0) {
      const back = (base.getDay() - wd + 7) % 7 || 7
      return {
        at: noon(
          new Date(base.getFullYear(), base.getMonth(), base.getDate() - back),
        ),
        used: [i],
      }
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
    if (iso) {
      return { at: noon(new Date(+iso[1], +iso[2] - 1, +iso[3])), used: [i] }
    }
    const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(t)
    if (dm) {
      return pastDay(+dm[1], +dm[2] - 1, base, [i])
    }
    const m = Math.max(
      MONTHS.indexOf(t),
      MONTH_NAMES.indexOf(t),
      t === 'sept' ? 8 : -1,
    )
    if (m >= 0) {
      const before = Number(nth(tokens, i - 1) ?? NaN)
      const after = Number(nth(tokens, i + 1) ?? NaN)
      if (Number.isInteger(before) && before >= 1 && before <= 31) {
        return pastDay(before, m, base, [i - 1, i])
      }
      if (Number.isInteger(after) && after >= 1 && after <= 31) {
        return pastDay(after, m, base, [i, i + 1])
      }
    }
  }
  return { at: now, used: [] }

  function pastDay(
    day: number,
    month: number,
    from: Date,
    used: Array<number>,
  ) {
    let d = new Date(from.getFullYear(), month, day, 12)
    if (d.getTime() > from.getTime() + DAY) {
      d = new Date(from.getFullYear() - 1, month, day, 12)
    }
    return { at: d.getTime(), used }
  }
}

/* "Bought" at a broker is a trade; at a bank it is a purchase. */
function atBroker(
  mentions: Array<Mention>,
  accounts: ReadonlyArray<LineAccount>,
): boolean {
  const a = accounts.find((x) => x.id === mentions[0]?.id)
  return a !== undefined && a.kinds.includes('broker')
}

export function parseLine(
  text: string,
  opts: {
    accounts: ReadonlyArray<LineAccount>
    /** Local midnight today. */
    today: number
    now: number
  },
): ParsedLine {
  const missing: Array<string> = []
  let raw = text.trim().toLowerCase()
  /* Arrows and signs become their own tokens. */
  raw = raw
    .replace(/→|->|=>/g, ' → ')
    .replace(/(^|\s)>(\s|$)/g, ' → ')
    .replace(/(^|\s)([+-])(?=\d)/g, '$1$2 ')
    .replace(/([€$£])(?=\d)/g, '$1 ')
    .replace(/(\d)([€$£])/g, '$1 $2')
    .replace(/@/g, ' @ ')
  let tokens = raw.split(/\s+/).filter(Boolean)

  const day = findDay(tokens, opts.today, opts.now)
  tokens = tokens.map((t, i) => (day.used.includes(i) ? '' : t))

  let currency = 'EUR'
  tokens = tokens.map((t) => {
    if (t in CURRENCY_WORDS) {
      currency = CURRENCY_WORDS[t]
      return ''
    }
    return t
  })

  const mentions = findAccounts(tokens, opts.accounts)
  const isMentioned = (i: number) =>
    mentions.some((m) => i >= m.at && i < m.at + m.length)

  const has = (words: Array<string>) =>
    tokens.findIndex((t, i) => !isMentioned(i) && words.includes(t))
  const arrow = tokens.findIndex((t) => ARROWS.includes(t))
  const toWord = tokens.findIndex(
    (t, i) => (t === 'to' || t === 'into') && !isMentioned(i),
  )
  const fromWord = tokens.findIndex((t, i) => t === 'from' && !isMentioned(i))

  const numbers: Array<{ i: number; n: number }> = []
  tokens.forEach((t, i) => {
    if (isMentioned(i)) return
    const n = toNumber(t)
    if (n !== null && n > 0) numbers.push({ i, n })
  })

  const sign = tokens.findIndex((t) => t === '+' || t === '-')
  let kind: LineKind | null = null
  const verbAt = (words: Array<string>) => has(words)
  if (verbAt(SELL_WORDS) >= 0) kind = 'sell'
  else if (
    verbAt(BUY_WORDS) >= 0 &&
    (numbers.length >= 2 || atBroker(mentions, opts.accounts))
  )
    kind = 'buy'
  else if (arrow >= 0 || verbAt(TRANSFER_WORDS) >= 0) kind = 'transfer'
  else if (mentions.length >= 2 && (toWord >= 0 || fromWord >= 0))
    kind = 'transfer'
  else if (sign >= 0) kind = tokens[sign] === '+' ? 'in' : 'out'
  else if (verbAt(IN_WORDS) >= 0) kind = 'in'
  else if (verbAt([...OUT_WORDS, ...BUY_WORDS]) >= 0) kind = 'out'

  /* Words left once the verb, numbers, accounts and signs are taken — the
     note, and where a category is read from. */
  const verbs = new Set([
    ...IN_WORDS,
    ...OUT_WORDS,
    ...TRANSFER_WORDS,
    ...BUY_WORDS,
    ...SELL_WORDS,
    ...ARROWS,
    '+',
    '-',
    'to',
    'into',
    'from',
  ])
  const rest = (skip: Set<number>) =>
    tokens.filter(
      (t, i) =>
        t !== '' &&
        !skip.has(i) &&
        !isMentioned(i) &&
        !verbs.has(t) &&
        !FILLER.has(t) &&
        toNumber(t) === null,
    )

  if (kind === null) {
    const words = rest(new Set())
    const income = words.find(
      (w) =>
        w in IN_EXTRA ||
        INCOME_CATEGORIES.some((c) => c.id === w || c.words.includes(w)),
    )
    kind = numbers.length > 0 ? (income ? 'in' : 'out') : null
  }

  const out: ParsedLine = {
    text: text.trim(),
    kind,
    currency,
    occurredAt: day.at,
    missing,
  }
  if (kind === null) {
    missing.push('an amount')
    return out
  }

  if (kind === 'buy' || kind === 'sell') {
    const words = rest(new Set())
    out.symbol = nth(words, 0)?.toUpperCase()
    out.shares = nth(numbers, 0)?.n
    out.price = nth(numbers, 1)?.n
    out.accountId = nth(mentions, 0)?.id
    if (!out.symbol) missing.push('which ticker')
    if (out.shares === undefined) missing.push('how many shares')
    if (out.price === undefined) missing.push('the price per share')
    if (!out.accountId) missing.push('which broker')
    return out
  }

  out.amount = nth(numbers, 0)?.n
  if (out.amount === undefined) missing.push('an amount')

  if (kind === 'transfer') {
    /* "x → y", "from x to y", "x to y", "to y from x", or just "x y". */
    const before = (at: number) => mentions.filter((m) => m.at < at)
    const after = (at: number) => mentions.filter((m) => m.at > at)
    const pivot = arrow >= 0 ? arrow : toWord
    if (pivot >= 0) {
      out.fromId = (fromWord >= 0 ? after(fromWord)[0] : before(pivot).at(-1))
        ?.id
      out.toId = after(pivot).find((m) => m.id !== out.fromId)?.id
    } else if (fromWord >= 0) {
      out.fromId = after(fromWord)[0]?.id
      out.toId = mentions.find((m) => m.id !== out.fromId)?.id
    } else {
      out.fromId = mentions[0]?.id
      out.toId = mentions[1]?.id
    }
    const note = rest(new Set()).join(' ')
    if (note) out.note = note
    if (!out.fromId) missing.push('from which account')
    if (!out.toId) missing.push('to which account')
    return out
  }

  out.accountId = mentions[0]?.id
  const words = rest(new Set())
  if (kind === 'out') {
    out.category = words
      .map(
        (w) =>
          SPEND_CATEGORIES.find(
            (c) => c.id.split(' ')[0] === w || c.words.includes(w),
          )?.id,
      )
      .find(Boolean)
    if (!out.category) missing.push('what it was')
  } else {
    const w = words.find(
      (x) =>
        x in IN_EXTRA ||
        INCOME_CATEGORIES.some((c) => c.id === x || c.words.includes(x)),
    )
    out.category =
      w === undefined
        ? (words[0] ?? 'other')
        : (IN_EXTRA[w] ??
          INCOME_CATEGORIES.find((c) => c.id === w || c.words.includes(w))?.id)
  }
  if (words.length > 0) out.note = words.join(' ')
  if (!out.accountId)
    missing.push(kind === 'in' ? 'into which account' : 'from which account')
  return out
}

/** Every line he typed, blank ones skipped. */
export function parseLines(
  text: string,
  opts: Parameters<typeof parseLine>[1],
): Array<ParsedLine> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 50)
    .map((l) => parseLine(l, opts))
}

/* Finances F1 (26 Sep): the words money is filed under, and how a euro is
   written. No React here — capture-parser.ts and the page both read it.

   A fixed short list, his pick: a spend lands in one of nine, from the
   first word after the amount when it is one of a category's words
   (`spend 12 coffee` is eating out), otherwise unsorted with a chip to
   file it. Stored in logs.meta.category as the id, which is lower case
   and short, as logs.setCategory requires. */

/** The one rule every money sum adds by — aggregate.moneySums and the rows
    it opens (logs.moneyRows) both use it, so they can never disagree. Euros
    only (PLAN.md §1: one currency per sum); a row in anything else is not
    added and not converted. */
export function isEuroAmount<T extends { value?: number; unit?: string }>(
  row: T,
): row is T & { value: number } {
  return (
    row.value !== undefined && Number.isFinite(row.value) && row.unit === 'eur'
  )
}

/** Money lent to someone, and the money back (4 Oct: €100 to Oleksandr
    on 28 Sep, back on 1 Oct). It left the account and came back — it is
    not spending and not money in, so no in/out sum adds it. Balances do:
    the euros really moved. */
export const LENT = 'lent'

export function isLent(row: { meta?: { category?: string } }): boolean {
  return row.meta?.category === LENT
}

/** A row that counts in money in / money out: euros, and not lent. */
export function countsInOut<
  T extends { value?: number; unit?: string; meta?: { category?: string } },
>(row: T): row is T & { value: number } {
  return isEuroAmount(row) && !isLent(row)
}

export type MoneyCategory = {
  id: string
  label: string
  /** What someone types after the amount that means this category. The id
      itself always counts. */
  words: ReadonlyArray<string>
}

export const SPEND_CATEGORIES: ReadonlyArray<MoneyCategory> = [
  {
    id: 'groceries',
    label: 'Groceries',
    words: ['grocery', 'supermarket', 'food', 'pingo', 'continente', 'lidl'],
  },
  {
    id: 'eating out',
    label: 'Eating out',
    words: [
      'eating',
      'restaurant',
      'cafe',
      'café',
      'coffee',
      'lunch',
      'dinner',
      'breakfast',
      'takeaway',
      'bar',
      'drinks',
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    words: ['uber', 'bolt', 'taxi', 'metro', 'bus', 'train', 'fuel', 'gas'],
  },
  {
    id: 'home',
    label: 'Home & bills',
    words: [
      'bills',
      'bill',
      'rent',
      'electricity',
      'water',
      'internet',
      'phone',
    ],
  },
  {
    id: 'health',
    label: 'Health',
    words: ['pharmacy', 'doctor', 'dentist', 'gym', 'supplements', 'protein'],
  },
  {
    id: 'fun',
    label: 'Fun',
    words: ['cinema', 'games', 'game', 'concert', 'party', 'subscription'],
  },
  {
    id: 'clothes',
    label: 'Clothes',
    words: ['clothing', 'shoes', 'jacket', 'shirt', 'haircut', 'barber'],
  },
  {
    id: 'travel',
    label: 'Travel',
    words: ['flight', 'hotel', 'airbnb', 'trip'],
  },
  /* Three more the statement reader files into (27 Sep, his real Revolut
     statement: Norauto, Amazon, the Claude subscription). */
  {
    id: 'car',
    label: 'Car',
    words: ['norauto', 'parking', 'toll', 'via verde'],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    words: [
      'amazon',
      'fnac',
      'worten',
      'ikea',
      'laptop',
      'computer',
      'macbook',
      'iphone',
      'headphones',
      'tv',
      'furniture',
    ],
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    words: ['netflix', 'spotify', 'claude', 'icloud', 'youtube'],
  },
  /* 4 Oct: Preply lessons are real money, and Languages money. */
  {
    id: 'learning',
    label: 'Learning',
    words: ['course', 'lesson', 'lessons', 'tutor', 'preply', 'book', 'books'],
  },
  { id: 'lent', label: 'Lent', words: ['lent', 'loan', 'lend'] },
  { id: 'other', label: 'Other', words: [] },
]

/* Money in, kept short: `salary` files itself, `earn 1200 freelance` from
   its word. */
export const INCOME_CATEGORIES: ReadonlyArray<MoneyCategory> = [
  { id: 'salary', label: 'Salary', words: ['paycheck', 'wage'] },
  {
    id: 'freelance',
    label: 'Freelance',
    words: ['client', 'invoice', 'contract', 'project'],
  },
  { id: 'lent', label: 'Paid back', words: ['payback', 'repaid'] },
  { id: 'other', label: 'Other', words: ['gift', 'refund', 'sold'] },
]

export type MoneyKind = 'expense' | 'income'

export function categoriesFor(kind: MoneyKind): ReadonlyArray<MoneyCategory> {
  return kind === 'expense' ? SPEND_CATEGORIES : INCOME_CATEGORIES
}

/** The category a note's first word names, or undefined — unsorted. */
export function categoryFromText(
  kind: MoneyKind,
  text: string | undefined,
): string | undefined {
  const first = text?.trim().split(/\s+/)[0]?.toLowerCase()
  if (!first) return undefined
  /* `eating out` is two words; its first is enough. */
  return categoriesFor(kind).find(
    (c) => c.id.split(' ')[0] === first || c.words.includes(first),
  )?.id
}

/** "Eating out" for 'eating out'; a word the list does not know, as typed. */
export function categoryLabel(kind: MoneyKind, id: string | null): string {
  if (id === null) return 'Unsorted'
  return categoriesFor(kind).find((c) => c.id === id)?.label ?? id
}

/** The labels a CategoryChip shows, by id. */
export function categoryLabels(kind: MoneyKind): Record<string, string> {
  return Object.fromEntries(categoriesFor(kind).map((c) => [c.id, c.label]))
}

const WHOLE = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const CENTS = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** €48, €12.50, €1,240 — cents only when there are some. */
export function euros(n: number): string {
  return Number.isInteger(n) ? WHOLE.format(n) : CENTS.format(n)
}

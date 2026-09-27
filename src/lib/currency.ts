/* The currencies an account can hold (Treasury, 27 Sep). The ECB publishes
   a daily rate into euros for each of these (Frankfurter serves them), so
   every pocket can be shown in euros from a stored reading — a currency
   with no published rate could never be added into a total honestly. */
export const CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'PLN',
  'CZK',
  'SEK',
  'NOK',
  'DKK',
  'HUF',
  'RON',
  'BGN',
  'JPY',
  'CAD',
  'AUD',
  'NZD',
  'CNY',
  'HKD',
  'SGD',
  'BRL',
  'TRY',
  'INR',
  'MXN',
  'ZAR',
  'KRW',
  'ILS',
] as const

export type Currency = (typeof CURRENCIES)[number]

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as ReadonlyArray<string>).includes(value)
}

const SYMBOL: Partial<Record<Currency, string>> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF ',
  PLN: 'zł ',
}

/** "€1,234.50", "$1,200", "PLN 300" — cents only when there are some. */
export function money(value: number, currency: string = 'EUR'): string {
  const sym = SYMBOL[currency as Currency] ?? `${currency} `
  const abs = Math.abs(value)
  const body = abs.toLocaleString('en', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '−' : ''}${sym}${body}`
}

/** What an account is — any of these, at least one. */
export const ACCOUNT_KINDS = ['bank', 'broker', 'cash'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

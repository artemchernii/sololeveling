/* Where money sits, known by name (27 Sep: "how to add accounts properly,
   not slop form with NAME AMOUNT"). He picks the bank and the app already
   knows what it is, how it looks, which currencies it usually holds, and
   how its name appears on someone else's statement. One place, used by
   + Account, the review (a move to a bank he has not added), and the
   reader's guess of which account a statement is.

   A product is one account at an institution: Revolut is two — the current
   account and Invest — because cash into Invest is a transfer between them. */

import type { AccountKind } from './currency'

export type Product = {
  /** Unique: 'revolut', 'revolut-invest'. */
  id: string
  /** The institution it belongs to — accounts of one are shown together. */
  institution: string
  name: string
  kind: AccountKind
  domain?: string
  currencies: Array<string>
  /** How it is written on statements and screenshots. */
  match: RegExp
}

export const PRODUCTS: ReadonlyArray<Product> = [
  {
    id: 'revolut',
    institution: 'revolut',
    name: 'Revolut',
    kind: 'bank',
    domain: 'revolut.com',
    currencies: ['EUR', 'USD'],
    match: /revolut/i,
  },
  {
    id: 'revolut-invest',
    institution: 'revolut',
    name: 'Revolut Invest',
    kind: 'broker',
    domain: 'revolut.com',
    currencies: ['EUR'],
    match: /revolut\s*(invest|trading|securities|stocks)/i,
  },
  {
    id: 'trade-republic',
    institution: 'trade-republic',
    name: 'Trade Republic',
    kind: 'broker',
    domain: 'traderepublic.com',
    currencies: ['EUR'],
    match: /trade\s*republic/i,
  },
  {
    id: 'trading-212',
    institution: 'trading-212',
    name: 'Trading 212',
    kind: 'broker',
    domain: 'trading212.com',
    currencies: ['EUR'],
    match: /trading\s*212|\bt212\b/i,
  },
  {
    id: 'bpi',
    institution: 'bpi',
    name: 'BPI',
    kind: 'bank',
    domain: 'bancobpi.pt',
    currencies: ['EUR'],
    match: /\bbpi\b|banco\s*bpi/i,
  },
  {
    id: 'activo',
    institution: 'activo',
    name: 'ActivoBank',
    kind: 'bank',
    domain: 'activobank.pt',
    currencies: ['EUR'],
    match: /activo/i,
  },
  {
    id: 'millennium',
    institution: 'millennium',
    name: 'Millennium bcp',
    kind: 'bank',
    domain: 'millenniumbcp.pt',
    currencies: ['EUR'],
    match: /millennium|\bbcp\b/i,
  },
  {
    id: 'cgd',
    institution: 'cgd',
    name: 'Caixa Geral',
    kind: 'bank',
    domain: 'cgd.pt',
    currencies: ['EUR'],
    match: /caixa\s*geral|\bcgd\b/i,
  },
  {
    id: 'novobanco',
    institution: 'novobanco',
    name: 'Novo Banco',
    kind: 'bank',
    domain: 'novobanco.pt',
    currencies: ['EUR'],
    match: /novo\s*banco/i,
  },
  {
    id: 'santander',
    institution: 'santander',
    name: 'Santander',
    kind: 'bank',
    domain: 'santander.pt',
    currencies: ['EUR'],
    match: /santander/i,
  },
  {
    id: 'wise',
    institution: 'wise',
    name: 'Wise',
    kind: 'bank',
    domain: 'wise.com',
    currencies: ['EUR', 'USD'],
    match: /\bwise\b|transferwise/i,
  },
  {
    id: 'n26',
    institution: 'n26',
    name: 'N26',
    kind: 'bank',
    domain: 'n26.com',
    currencies: ['EUR'],
    match: /\bn26\b/i,
  },
  {
    id: 'ibkr',
    institution: 'ibkr',
    name: 'Interactive Brokers',
    kind: 'broker',
    domain: 'interactivebrokers.com',
    currencies: ['EUR', 'USD'],
    match: /interactive\s*brokers|\bibkr\b/i,
  },
  {
    id: 'xtb',
    institution: 'xtb',
    name: 'XTB',
    kind: 'broker',
    domain: 'xtb.com',
    currencies: ['EUR'],
    match: /\bxtb\b/i,
  },
  {
    id: 'degiro',
    institution: 'degiro',
    name: 'DEGIRO',
    kind: 'broker',
    domain: 'degiro.com',
    currencies: ['EUR'],
    match: /degiro/i,
  },
  {
    id: 'cash',
    institution: 'cash',
    name: 'Cash',
    kind: 'cash',
    currencies: ['EUR'],
    match: /^cash$|\bnotes\b|wallet/i,
  },
]

export function productById(id: string | undefined): Product | undefined {
  return id === undefined ? undefined : PRODUCTS.find((p) => p.id === id)
}

/**
 * The product a piece of text names — "Trade Republic Bank GmbH", "To
 * investment account" is not one. The most specific match wins, so
 * "Revolut Invest" is Invest and not the current account.
 */
export function productIn(text: string | undefined): Product | undefined {
  if (!text) return undefined
  const hits = PRODUCTS.filter((p) => p.match.test(text))
  return hits.sort((a, b) => b.match.source.length - a.match.source.length)[0]
}

/** Products whose name starts with or contains what he typed. */
export function searchProducts(q: string): Array<Product> {
  const t = q.trim().toLowerCase()
  if (t === '') return [...PRODUCTS]
  return PRODUCTS.filter(
    (p) => p.name.toLowerCase().includes(t) || p.match.test(t),
  )
}

/**
 * "PT50 0035 0000 1234 5678 0120 1" → "0120": the last four digits that
 * identify an account on someone else's statement. Accepts what he types
 * too — "0120", "•• 2789".
 */
export function tail(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/** Every four-digit tail printed in a line — "card ••2789", "PT50…0120". */
export function tailsIn(text: string): Array<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/\d[\d\s]{2,}\d/g)) {
    const t = tail(m[0])
    if (t) out.add(t)
  }
  return [...out]
}

/* Payees (4 Oct; mockup design/treasury-mockup/payees.html). His words:
   "we have paypal and its not clear what it is. I want to name it", and
   "Juros Emprestimo … keep name but add my own explanation that its
   Mortgage". Who a row is paid to, as a key a name can hang on; the shops
   the app already knows; the bank phrases it can say plainly. Pure, so the
   server and the page agree. */

import { payeeKey } from './payee'

/* payeeIdOf lives with payeeKey (src/lib/payee), so a bill's key and
   a payee's are the same key; re-exported here where the page looks. */
export { payeeIdOf } from './payee'

export type Shop = {
  name: string
  domain: string
  category: string
  /** Matched against the payee key (upper case, words). */
  words: ReadonlyArray<string>
}

/* Shops he is likely to meet in Lisbon and online, recognised with no
   question. Short on purpose: a wrong guess costs more than a blank. */
export const SHOPS: ReadonlyArray<Shop> = [
  { name: 'Mango', domain: 'mango.com', category: 'clothes', words: ['MANGO'] },
  { name: 'GANT', domain: 'gant.com', category: 'clothes', words: ['GANT'] },
  { name: 'Zara', domain: 'zara.com', category: 'clothes', words: ['ZARA'] },
  { name: 'Nike', domain: 'nike.com', category: 'clothes', words: ['NIKE'] },
  {
    name: 'About You',
    domain: 'aboutyou.com',
    category: 'clothes',
    words: ['ABOUT YOU', 'ABOUTYOU'],
  },
  {
    name: 'H&M',
    domain: 'hm.com',
    category: 'clothes',
    words: ['H M', 'HM HENNES'],
  },
  {
    name: 'Primark',
    domain: 'primark.com',
    category: 'clothes',
    words: ['PRIMARK'],
  },
  {
    name: 'Decathlon',
    domain: 'decathlon.pt',
    category: 'shopping',
    words: ['DECATHLON'],
  },
  { name: 'IKEA', domain: 'ikea.com', category: 'shopping', words: ['IKEA'] },
  {
    name: 'Amazon',
    domain: 'amazon.com',
    category: 'shopping',
    words: ['AMAZON'],
  },
  { name: 'Fnac', domain: 'fnac.pt', category: 'shopping', words: ['FNAC'] },
  {
    name: 'Worten',
    domain: 'worten.pt',
    category: 'shopping',
    words: ['WORTEN'],
  },
  {
    name: 'Continente',
    domain: 'continente.pt',
    category: 'groceries',
    words: ['CONTINENTE'],
  },
  {
    name: 'Pingo Doce',
    domain: 'pingodoce.pt',
    category: 'groceries',
    words: ['PINGO DOCE'],
  },
  { name: 'Lidl', domain: 'lidl.pt', category: 'groceries', words: ['LIDL'] },
  {
    name: 'Mercadona',
    domain: 'mercadona.es',
    category: 'groceries',
    words: ['MERCADONA'],
  },
  {
    name: 'Auchan',
    domain: 'auchan.pt',
    category: 'groceries',
    words: ['AUCHAN'],
  },
  { name: 'Bolt', domain: 'bolt.eu', category: 'transport', words: ['BOLT'] },
  { name: 'Uber', domain: 'uber.com', category: 'transport', words: ['UBER'] },
  {
    name: 'Metro de Lisboa',
    domain: 'metrolisboa.pt',
    category: 'transport',
    words: ['METROPOLITANO'],
  },
  {
    name: 'CP',
    domain: 'cp.pt',
    category: 'transport',
    words: ['COMBOIOS DE PORTUGAL'],
  },
  {
    name: 'Via Verde',
    domain: 'viaverde.pt',
    category: 'car',
    words: ['VIAVERDE', 'VIA VERDE'],
  },
  { name: 'Galp', domain: 'galp.com', category: 'car', words: ['GALP'] },
  { name: 'Repsol', domain: 'repsol.com', category: 'car', words: ['REPSOL'] },
  {
    name: 'Glovo',
    domain: 'glovoapp.com',
    category: 'eating out',
    words: ['GLOVO'],
  },
  {
    name: 'Uber Eats',
    domain: 'ubereats.com',
    category: 'eating out',
    words: ['UBER EATS', 'UBEREATS'],
  },
  {
    name: 'Padaria Portuguesa',
    domain: 'apadariaportuguesa.pt',
    category: 'eating out',
    words: ['PADARIA PORTUGUESA'],
  },
  {
    name: 'Cinemas NOS',
    domain: 'cinemas.nos.pt',
    category: 'fun',
    words: ['CINEMAS NOS'],
  },
  {
    name: 'Netflix',
    domain: 'netflix.com',
    category: 'subscriptions',
    words: ['NETFLIX'],
  },
  {
    name: 'Spotify',
    domain: 'spotify.com',
    category: 'subscriptions',
    words: ['SPOTIFY'],
  },
  {
    name: 'Claude',
    domain: 'claude.ai',
    category: 'subscriptions',
    words: ['ANTHROPIC'],
  },
  {
    name: 'ChatGPT',
    domain: 'openai.com',
    category: 'subscriptions',
    words: ['OPENAI'],
  },
  {
    name: 'Apple',
    domain: 'apple.com',
    category: 'subscriptions',
    words: ['APPLE COM'],
  },
  {
    name: 'Google',
    domain: 'google.com',
    category: 'subscriptions',
    words: ['GOOGLE'],
  },
  {
    name: 'Preply',
    domain: 'preply.com',
    category: 'learning',
    words: ['PREPLY'],
  },
  {
    name: 'Solinca',
    domain: 'solinca.pt',
    category: 'health',
    words: ['SOLINCA'],
  },
  {
    name: 'Vodafone',
    domain: 'vodafone.pt',
    category: 'home',
    words: ['VODAFONE'],
  },
  { name: 'EDP', domain: 'edp.pt', category: 'home', words: ['EDP COMERCIAL'] },
]

/** The shop a payee key is, when the app knows it. */
export function knownShop(key: string): Shop | null {
  const k = ` ${key} `
  return SHOPS.find((s) => s.words.some((w) => k.includes(` ${w} `))) ?? null
}

export type Phrase = {
  name: string
  category: string
  partOf?: string
  /** Always a monthly bill: found from its first payment. */
  monthly?: boolean
  pattern: RegExp
}

/* What Portuguese banks print, said plainly. Proposed, never applied:
   he says yes (the mockup's "suggested names"). */
export const PHRASES: ReadonlyArray<Phrase> = [
  {
    pattern: /JUROS (DE )?EMPRESTIMO/i,
    name: 'Mortgage · interest',
    category: 'home',
    partOf: 'Mortgage',
  },
  {
    pattern: /AMORTIZACAO (DE )?CAPITAL/i,
    name: 'Mortgage · capital',
    category: 'home',
    partOf: 'Mortgage',
  },
  {
    pattern: /SEGURO.*MULTI/i,
    name: 'Home insurance',
    category: 'home',
  },
  {
    pattern: /SEGURO.*(VIDA|\bVP\b)/i,
    name: 'Life insurance',
    category: 'home',
  },
  { pattern: /\bEDP COMERCIAL/i, name: 'Electricity · EDP', category: 'home' },
  { pattern: /\b(EPAL|SMAS|AGUAS DE)\b/i, name: 'Water', category: 'home' },
  {
    pattern: /TRF P\/ COND\b|CONDOMINIO/i,
    name: 'Condominium',
    category: 'home',
    monthly: true,
  },
  { pattern: /\bIUC\b/i, name: 'Car tax', category: 'car' },
  { pattern: /\bIMI\b/i, name: 'Property tax', category: 'home' },
  {
    pattern: /COMISSAO|MANUTENCAO DE CONTA/i,
    name: 'Bank fee',
    category: 'other',
  },
  { pattern: /IMPOSTO DO SELO/i, name: 'Stamp duty', category: 'other' },
]

/** What the bank's line says, plainly, when the app knows the phrase. */
export function bankPhrase(line: string): Phrase | null {
  return PHRASES.find((p) => p.pattern.test(line)) ?? null
}

/** A site to take a logo from, guessed from a name he typed: "Preply" →
    preply.com. A known shop's own site wins. */
export function siteFor(name: string): string | null {
  const shop = knownShop(payeeKey(name))
  if (shop) return shop.domain
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return slug.length >= 3 ? `${slug}.com` : null
}

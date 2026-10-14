/* What a thing is in — a sector or a region — as a badge on its page
   (14 Oct, mockup position-rounds.html "4 · head line"; his "go, funds
   from the name"). A label, not a number: it is read once per
   instrument, stored with where it came from (convex/sector.ts), and
   never fetched at render. Nothing found is no badge. */

export const SECTORS = [
  'tech',
  'cyber security',
  'gold',
  'health',
  'energy',
  'finance',
  'consumer',
  'industry',
  'communication',
  'real estate',
  'utilities',
  'materials',
  'asia pacific',
  'japan',
  'europe',
  'emerging',
  'us',
  'world',
] as const
export type Sector = (typeof SECTORS)[number]

/* Yahoo's sector words for a share (v1/finance/search, `sector`). */
const YAHOO: Record<string, Sector> = {
  Technology: 'tech',
  Healthcare: 'health',
  Energy: 'energy',
  'Financial Services': 'finance',
  'Consumer Cyclical': 'consumer',
  'Consumer Defensive': 'consumer',
  Industrials: 'industry',
  'Communication Services': 'communication',
  'Real Estate': 'real estate',
  Utilities: 'utilities',
  'Basic Materials': 'materials',
}

export function fromYahoo(word: string | undefined): Sector | undefined {
  return word === undefined ? undefined : YAHOO[word.trim()]
}

/** The sector Yahoo's search gives for this symbol, if any. */
export function parseSector(json: unknown, symbol: string): string | undefined {
  const quotes = (json as { quotes?: unknown } | null)?.quotes
  if (!Array.isArray(quotes)) return undefined
  const q = (quotes as Array<Record<string, unknown>>).find(
    (r) => r.symbol === symbol,
  )
  return typeof q?.sector === 'string' && q.sector ? q.sector : undefined
}

/* Words in a fund's own name (Yahoo has no category for his London
   funds: fundProfile is empty for VDPG, VUAA, SHLD and IGLN). A theme
   before a region: "Digital Security … USD" is cyber security, and
   "Asia Pacific ex Japan" is Asia Pacific, not Japan. */
const WORDS: ReadonlyArray<[RegExp, Sector]> = [
  [/digital security|cyber/i, 'cyber security'],
  [/\bgold\b/i, 'gold'],
  [/technolog|nasdaq|semiconductor|\btech\b/i, 'tech'],
  [/health|biotech|pharma/i, 'health'],
  [/energy/i, 'energy'],
  [/financials|\bbanks\b/i, 'finance'],
  [/real estate|property|reit/i, 'real estate'],
  [/asia pacific|pacific/i, 'asia pacific'],
  [/japan|nikkei|topix/i, 'japan'],
  [/emerging/i, 'emerging'],
  [/europe|euro stoxx|stoxx 600|\bdax\b/i, 'europe'],
  [/s&p ?500|america|dow jones|russell/i, 'us'],
  /* Capitals only: "us" is a word, and "USD" a currency, not a place. */
  [/\bUS\b|\bUSA\b/, 'us'],
  [/all[- ]world|msci world|ftse world|global|\bworld\b/i, 'world'],
]

export function fromName(name: string): Sector | undefined {
  return WORDS.find(([re]) => re.test(name))?.[1]
}

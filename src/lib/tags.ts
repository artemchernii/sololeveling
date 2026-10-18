import type { Kind } from './logo'
import { fromName } from './sector'
import type { Sector } from './sector'

/* A position's two tags on Portfolio, and the parts of its bar (18 Oct,
   mockup tags-map.html, his "go emoji"). Labels, never numbers: a
   share's sector and country are Yahoo's, read once and stored
   (convex/sector.ts); a fund's come from words in its own name; a coin
   or gold has no country. Nothing stored yet is MISSING. */

export type Lens = 'kind' | 'sector' | 'region'

const REGIONS: ReadonlySet<Sector> = new Set([
  'asia pacific',
  'japan',
  'europe',
  'emerging',
  'us',
  'world',
])

export type SectorTag =
  | Exclude<
      Sector,
      'asia pacific' | 'japan' | 'europe' | 'emerging' | 'us' | 'world'
    >
  | 'etf'
  | 'coin'
  | 'missing'

export type RegionTag =
  | 'us'
  | 'europe'
  | 'asia'
  | 'emerging'
  | 'world'
  | 'other'
  | 'no country'
  | 'etf · no region'
  | 'missing'

/* Yahoo's country words, by region. A country not listed is OTHER. */
const EUROPE = new Set([
  'Austria',
  'Belgium',
  'Denmark',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Ireland',
  'Italy',
  'Luxembourg',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Spain',
  'Sweden',
  'Switzerland',
  'United Kingdom',
  'Czech Republic',
  'Hungary',
])
const ASIA = new Set([
  'Japan',
  'China',
  'Hong Kong',
  'Taiwan',
  'South Korea',
  'Korea',
  'Singapore',
  'India',
  'Australia',
  'New Zealand',
  'Indonesia',
  'Malaysia',
  'Thailand',
  'Philippines',
  'Vietnam',
])

export function regionOfCountry(country: string): RegionTag {
  if (country === 'United States') return 'us'
  if (EUROPE.has(country)) return 'europe'
  if (ASIA.has(country)) return 'asia'
  return 'other'
}

/* A fund's region word in its name, and its theme (WORDS in sector.ts
   puts a theme first, so the region is looked for in the name alone). */
const REGION_WORDS: ReadonlyArray<[RegExp, RegionTag]> = [
  [/asia pacific|pacific|japan|nikkei|topix|china/i, 'asia'],
  [/emerging/i, 'emerging'],
  [/europe|euro stoxx|stoxx 600|\bdax\b/i, 'europe'],
  [/s&p ?500|america|dow jones|russell|nasdaq/i, 'us'],
  [/\bUS\b|\bUSA\b/, 'us'],
  /* Not "global": Global X is an issuer. */
  [/all[- ]world|msci world|ftse world|\bworld\b/i, 'world'],
]

export type Tagged = {
  kind: Kind
  name: string
  /** Stored on the instrument, if read. */
  sector?: Sector
  country?: string
}

export function tagsOf(t: Tagged): { sector: SectorTag; region: RegionTag } {
  if (t.kind === 'crypto') return { sector: 'coin', region: 'no country' }
  if (t.kind === 'gold') return { sector: 'gold', region: 'no country' }
  if (t.kind === 'etf') {
    const theme = fromName(t.name)
    return {
      sector:
        theme === undefined || REGIONS.has(theme)
          ? 'etf'
          : (theme as SectorTag),
      region:
        REGION_WORDS.find(([re]) => re.test(t.name))?.[1] ?? 'etf · no region',
    }
  }
  return {
    sector:
      t.sector === undefined || REGIONS.has(t.sector)
        ? 'missing'
        : (t.sector as SectorTag),
    region: t.country ? regionOfCountry(t.country) : 'missing',
  }
}

/* Each tag's emoji and colour (a token), on the row and the bar. A
   colour names a part, never grades it. */
export const LOOK: Record<
  SectorTag | RegionTag,
  { emoji: string; tone: string }
> = {
  tech: { emoji: '💻', tone: 'var(--color-lav-400)' },
  'cyber security': { emoji: '🔐', tone: 'var(--ind-200)' },
  gold: { emoji: '🥇', tone: 'var(--money-cash)' },
  health: { emoji: '💊', tone: 'var(--state-good)' },
  energy: { emoji: '⚡', tone: 'var(--state-danger)' },
  finance: { emoji: '🏦', tone: 'var(--ind-rsi)' },
  consumer: { emoji: '🛒', tone: 'var(--area-knowledge)' },
  industry: { emoji: '🏭', tone: 'var(--color-ink-300)' },
  communication: { emoji: '📡', tone: 'var(--ind-200)' },
  'real estate': { emoji: '🏠', tone: 'var(--kind-reference)' },
  utilities: { emoji: '🔌', tone: 'var(--kind-idea)' },
  materials: { emoji: '⛏️', tone: 'var(--kind-book)' },
  etf: { emoji: '📈', tone: 'var(--ind-50)' },
  coin: { emoji: '🪙', tone: 'var(--state-warn)' },
  us: { emoji: '🇺🇸', tone: 'var(--color-lav-400)' },
  europe: { emoji: '🇪🇺', tone: 'var(--area-knowledge)' },
  asia: { emoji: '🌏', tone: 'var(--ind-200)' },
  emerging: { emoji: '🌱', tone: 'var(--kind-book)' },
  world: { emoji: '🌐', tone: 'var(--ind-50)' },
  other: { emoji: '🌍', tone: 'var(--color-ink-300)' },
  'no country': { emoji: '⚪', tone: 'var(--money-cash)' },
  'etf · no region': { emoji: '📈', tone: 'var(--ind-50)' },
  missing: { emoji: '⚠️', tone: 'var(--state-warn)' },
}

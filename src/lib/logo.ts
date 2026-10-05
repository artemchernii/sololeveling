/* Where a position's logo comes from (4 Oct: "those logos are annoy me …
   real logo"). By what the thing is, never by its ticker's letters alone:
   VUAA and SHLD are also US codes, and showed strangers' marks.
   - a coin: its own icon
   - a fund (ETF, ETC): its issuer's site, found in its name
   - a share: the company, by ticker, as before
   Null: letters will do. Pure, so it is tested. */

const COIN_ICONS =
  'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color'
const SITE_ICON = 'https://www.google.com/s2/favicons?sz=64&domain='
const SHARE_LOGO = 'https://financialmodelingprep.com/image-stock/'

/** A fund's issuer by a word in its name. */
const ISSUERS: ReadonlyArray<[RegExp, string]> = [
  [/\bishares\b/i, 'ishares.com'],
  [/\bvanguard\b/i, 'vanguard.com'],
  [/\bxtrackers\b/i, 'dws.com'],
  [/\bamundi\b|\blyxor\b/i, 'amundi.com'],
  [/\bspdr\b/i, 'ssga.com'],
  [/\binvesco\b/i, 'invesco.com'],
  [/\bwisdomtree\b/i, 'wisdomtree.eu'],
  [/\bvaneck\b/i, 'vaneck.com'],
  [/\bglobal x\b/i, 'globalxetfs.com'],
]

export type LogoOf = { symbol: string; type?: string; name?: string }

export function isCoin(p: LogoOf): boolean {
  return p.type === 'CRYPTOCURRENCY'
}

export function logoSrc(p: LogoOf): string | null {
  if (isCoin(p)) {
    const base = p.symbol.split('-')[0].toLowerCase()
    return /^[a-z0-9]{2,10}$/.test(base) ? `${COIN_ICONS}/${base}.svg` : null
  }
  if (p.type === 'ETF' || p.type === 'MUTUALFUND' || p.type === 'ETC') {
    const site = ISSUERS.find(([re]) => re.test(p.name ?? ''))?.[1]
    return site ? `${SITE_ICON}${site}` : null
  }
  const base = p.symbol.split('.')[0]
  return base ? `${SHARE_LOGO}${encodeURIComponent(base)}.png` : null
}

/** What kind of thing a position is, for Portfolio's split (4 Oct: "we
    gonna have etfs, stocks, crypto and gold"). */
export type Kind = 'stock' | 'etf' | 'gold' | 'crypto'

export function kindOf(p: LogoOf): Kind {
  if (isCoin(p)) return 'crypto'
  if (/\bgold\b/i.test(p.name ?? '')) return 'gold'
  if (p.type === 'ETF' || p.type === 'MUTUALFUND' || p.type === 'ETC')
    return 'etf'
  return 'stock'
}

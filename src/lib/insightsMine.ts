import { signals, verdict } from './indicators'
import type { Call, Reading } from './indicators'
import { regionOfCountry } from './tags'
import type { RegionTag, SectorTag } from './tags'

/* Insights, band 3 MINE (19 Oct, spec I2; mockup insights.html "3 MINE").
   Pure, so it is tested: the Portfolio verdict of a position from its
   stored closes, the heatmap's rows, and the allocation's five lines. */

/**
 * The verdict Portfolio shows on a position's page: `verdict()` on the
 * `signals()` of its stored closes of the last year (invest.priceLine
 * since 366 days, as PortfolioPosition reads it) and, for a share, its
 * latest stored fundamentals. The avg buy is not an input to the call,
 * so it is left out. Null where the lines cannot all be read.
 */
export function callOf(
  closes: ReadonlyArray<{ asOf: number; price: number }>,
  reading: Reading | null,
  now: number,
): Call | null {
  const pts = [...closes]
    .sort((a, b) => a.asOf - b.asOf)
    .map((c) => ({ t: c.asOf, v: c.price }))
  return verdict(signals(pts, null), { reading, now })?.call ?? null
}

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * The heatmap's boxes (20 Oct, his many case: rows made a €118 box as
 * wide as the row): a squarified treemap, each box's area its euros,
 * biggest first, in a space `aspect` wide and 1 tall; rects come back
 * in percent of it. A box under `floor` (5%) of the whole — or one with no
 * euros (frozen, no price yet) — is drawn at `floor`, so its words fit.
 */
export function treemap<T extends { eur: number | null }>(
  boxes: ReadonlyArray<T>,
  aspect: number,
  floor = 0.05,
): Array<T & Rect> {
  const total = boxes.reduce((t, b) => t + (b.eur ?? 0), 0)
  const least = total > 0 ? total * floor : 1
  const items = [...boxes]
    .map((b) => ({ b, v: Math.max(b.eur ?? 0, least) }))
    .sort((a, b) => b.v - a.v)
  const sum = items.reduce((t, i) => t + i.v, 0)
  const scale = sum > 0 ? aspect / sum : 0
  const out: Array<T & Rect> = []
  let x = 0
  let y = 0
  let w = aspect
  let h = 1
  const worst = (row: Array<number>, side: number) => {
    const t = row.reduce((a, b) => a + b, 0)
    const max = Math.max(...row)
    const min = Math.min(...row)
    return Math.max(
      (side * side * max) / (t * t),
      (t * t) / (side * side * min),
    )
  }
  let k = 0
  while (k < items.length) {
    const side = Math.min(w, h)
    const row: Array<number> = [items[k].v * scale]
    let n = k + 1
    while (n < items.length) {
      const next = [...row, items[n].v * scale]
      if (worst(next, side) > worst(row, side)) break
      row.push(items[n].v * scale)
      n++
    }
    const t = row.reduce((a, b) => a + b, 0)
    let at = 0
    for (let i = k; i < n; i++) {
      const a = items[i].v * scale
      const r =
        w >= h
          ? { x, y: y + at, w: t / h, h: a / (t / h) }
          : { x: x + at, y, w: a / (t / w), h: t / w }
      at += w >= h ? r.h : r.w
      out.push({
        ...items[i].b,
        x: (r.x / aspect) * 100,
        y: r.y * 100,
        w: (r.w / aspect) * 100,
        h: r.h * 100,
      })
    }
    if (w >= h) {
      x += t / h
      w -= t / h
    } else {
      y += t / w
      h -= t / w
    }
    k = n
  }
  return out
}

/* ---- ALLOCATION ---- */

export type AllocId = 'tech' | 'us' | 'europe' | 'world' | 'health' | 'gold'
export const ALLOC: ReadonlyArray<{
  id: AllocId
  emoji: string
  name: string
}> = [
  { id: 'tech', emoji: '💻', name: 'TECH · AI' },
  { id: 'us', emoji: '🇺🇸', name: 'US' },
  { id: 'europe', emoji: '🇪🇺', name: 'EUROPE' },
  { id: 'world', emoji: '🌐', name: 'WORLD' },
  { id: 'health', emoji: '💊', name: 'HEALTH' },
  { id: 'gold', emoji: '🥇', name: 'GOLD' },
]

/** What one position is made of, as fractions of it; a line left out is
    not known for it (a fund Yahoo cannot open, a tag not stored yet). */
export type Split = Partial<Record<AllocId, number>>

/** Yahoo's quoteSummary `topHoldings` and `assetProfile` for one symbol. */
export type Opened = {
  /** Whole-fund sector weights (technology, healthcare …), fractions. */
  sectors: Record<string, number> | null
  /** The fund's biggest holdings, each a fraction of the fund. */
  top: Array<{ symbol: string; name: string; pct: number }>
  /** A share's own sector and country. */
  sector: string | null
  country: string | null
}

const num = (x: unknown) =>
  typeof x === 'number'
    ? x
    : typeof (x as { raw?: unknown } | null)?.raw === 'number'
      ? (x as { raw: number }).raw
      : null

export function parseOpened(json: unknown): Opened | null {
  const r = (
    json as {
      quoteSummary?: { result?: Array<Record<string, unknown>> }
    } | null
  )?.quoteSummary?.result?.[0]
  if (!r) return null
  const th = r.topHoldings as
    { sectorWeightings?: unknown; holdings?: unknown } | undefined
  const ap = r.assetProfile as
    { sector?: unknown; country?: unknown } | undefined
  const sectors: Record<string, number> = {}
  if (Array.isArray(th?.sectorWeightings))
    for (const w of th.sectorWeightings as Array<Record<string, unknown>>)
      for (const [k, v] of Object.entries(w)) {
        const n = num(v)
        if (n !== null) sectors[k] = n
      }
  const top = Array.isArray(th?.holdings)
    ? (th.holdings as Array<Record<string, unknown>>).flatMap((h) => {
        const pct = num(h.holdingPercent)
        return typeof h.symbol === 'string' && pct !== null
          ? [{ symbol: h.symbol, name: String(h.holdingName ?? ''), pct }]
          : []
      })
    : []
  return {
    sectors: Object.keys(sectors).length > 0 ? sectors : null,
    top,
    sector: typeof ap?.sector === 'string' ? ap.sector : null,
    country: typeof ap?.country === 'string' ? ap.country : null,
  }
}

/** Portfolio's two tags of a position (src/lib/tags.ts `tagsOf`). */
export type PlaceTags = { sector: SectorTag; region: RegionTag }

const PLACES: Partial<Record<RegionTag, AllocId>> = {
  us: 'us',
  europe: 'europe',
  world: 'world',
}
/* A fund whose name gives no region, placed by Artem (20 Oct: "Count
   SHLD as US on the allocation"). Only on this room's lines. */
const PICKED: Partial<Record<string, RegionTag>> = { SHLD: 'us' }

/** Portfolio's tags with his picked region where the name gives none. */
export function placed(symbol: string, tags: PlaceTags | null) {
  const pick = PICKED[symbol.split('.')[0]]
  return tags && pick && UNPLACED.has(tags.region)
    ? { ...tags, region: pick }
    : tags
}

/* Not known where: no region in a fund's name, a share's country not
   stored yet. Every other tag is known to be in none of the three. */
const UNPLACED: ReadonlySet<RegionTag> = new Set(['etf · no region', 'missing'])

/**
 * What a position is made of (20 Oct, his pick): its place is Portfolio's
 * region tag, whole — a world fund is its own WORLD line, never split by
 * country. Tech and health: a fund's whole-fund sector weights where Yahoo
 * opens it, else its theme tag; a share's Yahoo sector, else its stored
 * tag. Gold is gold. What is not known is left out, never guessed.
 */
export function splitOf(
  kind: 'stock' | 'etf' | 'gold' | 'crypto',
  o: Opened | null,
  tags: PlaceTags | null,
): Split {
  const out: Split = { gold: kind === 'gold' ? 1 : 0 }
  /* A share whose country is not stored yet takes the one Yahoo's
     profile gives on this open (fetched, never saved). */
  const region =
    tags && !UNPLACED.has(tags.region)
      ? tags.region
      : kind === 'stock' && o?.country
        ? regionOfCountry(o.country)
        : null
  if (region !== null)
    for (const id of ['us', 'europe', 'world'] as const)
      out[id] = PLACES[region] === id ? 1 : 0
  if (kind === 'gold' || kind === 'crypto')
    return { ...out, tech: 0, health: 0 }
  const w: Partial<Record<string, number>> | null = o?.sectors ?? null
  if (kind === 'etf' && w) {
    out.tech = w.technology ?? 0
    out.health = w.healthcare ?? 0
    return out
  }
  if (kind === 'stock' && o?.sector) {
    out.tech = o.sector === 'Technology' ? 1 : 0
    out.health = o.sector === 'Healthcare' ? 1 : 0
    return out
  }
  const t = tags?.sector
  if (t && t !== 'missing' && !(kind === 'etf' && t === 'etf')) {
    out.tech = t === 'tech' || t === 'cyber security' ? 1 : 0
    out.health = t === 'health' ? 1 : 0
  }
  return out
}

/** The world column: MSCI World by IWDA's own sector weights, where Yahoo
    gives them — only tech, health and gold (none in it). Places have no
    source, so their lines show without it. */
export function worldOf(o: Opened | null): Split {
  const w: Partial<Record<string, number>> | null = o?.sectors ?? null
  return w
    ? { tech: w.technology ?? 0, health: w.healthcare ?? 0, gold: 0 }
    : {}
}
export type AllocRow = {
  id: AllocId
  /** Percent of the valued euros; null when no position could be read. */
  mine: number | null
  /** The world's (MSCI World, IWDA's split); null where not known. */
  world: number | null
  /** Positions whose part in this line is not known, by symbol. */
  notOpened: Array<string>
  /** Their euros as a percent of all valued euros; 0 when none. */
  unknown: number
}

/**
 * The five lines: each the euros of the positions in it over all valued
 * euros, as a percent. A position whose split does not know a line is
 * named under it, not guessed — its euros stay in the whole, so the
 * line's percent is what is known to be in it.
 */
export function allocation(
  parts: ReadonlyArray<{ symbol: string; eur: number; split: Split }>,
  world: Split,
): Array<AllocRow> {
  const total = parts.reduce((t, p) => t + p.eur, 0)
  return ALLOC.map(({ id }) => {
    const known = parts.filter((p) => p.split[id] !== undefined)
    const sum = known.reduce((t, p) => t + p.eur * (p.split[id] ?? 0), 0)
    const w = world[id]
    return {
      id,
      mine:
        total > 0 && known.length > 0
          ? Math.round((sum / total) * 1000) / 10
          : null,
      world: w === undefined ? null : Math.round(w * 1000) / 10,
      notOpened: parts
        .filter((p) => p.split[id] === undefined)
        .map((p) => p.symbol),
      unknown:
        total > 0
          ? Math.round(
              (parts
                .filter((p) => p.split[id] === undefined)
                .reduce((t, p) => t + p.eur, 0) /
                total) *
                1000,
            ) / 10
          : 0,
    }
  })
}

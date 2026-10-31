/* MOVERS on MARKET (31 Oct, design/treasury-mockup/market-world.html; his
   words: "Market is to track what is going on. We want to find
   opportunities and understand market", "not only stocks in US but
   EU/Asia/Brazil", "maybe not only brazil but South America"). Each
   region's biggest companies are fetched on open with Yahoo's spark; the
   week's move is two fetched closes, both on the row; the biggest up and
   down are shown, each with its newest headline. Nothing is stored. Pure:
   the fetches are in convex/marketSources/movers.ts. */

import { moveOf } from './insightsMarket'
import type { FlagCode, Series } from './insightsMarket'

export const MOVER_REGIONS = ['US', 'EUROPE', 'ASIA', 'SOUTH AMERICA'] as const
export type MoverRegion = (typeof MOVER_REGIONS)[number]

/** A region's chip: its flag, two for South America. */
export const REGION_FLAG: Record<MoverRegion, FlagCode | [FlagCode, FlagCode]> =
  { US: 'US', EUROPE: 'EU', ASIA: 'JP', 'SOUTH AMERICA': ['BR', 'AR'] }

/** symbol:domain, the domain for its logo. The biggest by value in each
    region, and a few the market watches (Reddit, Intel, Palantir). */
const LIST: Record<MoverRegion, string> = {
  US:
    'NVDA:nvidia.com MSFT:microsoft.com AAPL:apple.com GOOGL:google.com AMZN:amazon.com ' +
    'META:meta.com AVGO:broadcom.com TSLA:tesla.com BRK-B:berkshirehathaway.com ' +
    'JPM:jpmorganchase.com LLY:lilly.com V:visa.com MA:mastercard.com ' +
    'NFLX:netflix.com ORCL:oracle.com WMT:walmart.com COST:costco.com ' +
    'XOM:exxonmobil.com UNH:unitedhealthgroup.com PLTR:palantir.com AMD:amd.com ' +
    'INTC:intel.com CRM:salesforce.com ADBE:adobe.com UBER:uber.com ' +
    'RDDT:reddit.com SHOP:shopify.com CAT:caterpillar.com BA:boeing.com ' +
    'NKE:nike.com DIS:disney.com PYPL:paypal.com COIN:coinbase.com ' +
    'SNOW:snowflake.com MU:micron.com QCOM:qualcomm.com',
  EUROPE:
    'ASML.AS:asml.com SAP.DE:sap.com NOVO-B.CO:novonordisk.com MC.PA:lvmh.com ' +
    'SIE.DE:siemens.com NESN.SW:nestle.com ROG.SW:roche.com AZN.L:astrazeneca.com ' +
    'SHEL.L:shell.com TTE.PA:totalenergies.com OR.PA:loreal.com ' +
    'RMS.PA:hermes.com ALV.DE:allianz.com SAN.MC:santander.com ' +
    'BNP.PA:bnpparibas.com AIR.PA:airbus.com RHM.DE:rheinmetall.com ' +
    'STLAM.MI:stellantis.com KER.PA:kering.com ADYEN.AS:adyen.com ' +
    'SPOT:spotify.com UCG.MI:unicreditgroup.eu INGA.AS:ing.com',
  ASIA:
    '2330.TW:tsmc.com 005930.KS:samsung.com 7203.T:toyota.com 6758.T:sony.com ' +
    '0700.HK:tencent.com 9988.HK:alibaba.com 1211.HK:byd.com ' +
    '3690.HK:meituan.com 9984.T:softbank.jp 6861.T:keyence.com ' +
    '8306.T:mufg.jp 000660.KS:skhynix.com RELIANCE.NS:ril.com ' +
    'INFY.NS:infosys.com 1810.HK:mi.com 7974.T:nintendo.com',
  'SOUTH AMERICA':
    'PETR4.SA:petrobras.com.br VALE3.SA:vale.com ITUB4.SA:itau.com.br ' +
    'BBDC4.SA:bradesco.com.br ABEV3.SA:ambev.com.br WEGE3.SA:weg.net ' +
    'MELI:mercadolibre.com NU:nubank.com.br YPF:ypf.com GGAL:gfgsa.com ' +
    'SQM:sqm.com FALABELLA.SN:falabella.com EMBJ:embraer.com ' +
    'BAP:credicorpnet.com',
}

export type Listed = { symbol: string; domain: string }

export const UNIVERSE: Record<MoverRegion, Array<Listed>> = Object.fromEntries(
  MOVER_REGIONS.map((r) => [
    r,
    LIST[r].split(' ').map((x) => {
      const [symbol, domain] = x.split(':')
      return { symbol, domain }
    }),
  ]),
) as Record<MoverRegion, Array<Listed>>

/** How many rows each side shows. */
export const MOVER_ROWS = 5

export type Mover = Listed & {
  name: string
  change: number
  base: number
  baseAt: number
  price: number
  currency: string | null
}

/**
 * A region's week: every company with a close a week back, biggest up and
 * biggest down. A company on both sides (fewer than ten moved) stays on
 * its own side only.
 */
export function weekMovers(
  region: MoverRegion,
  series: ReadonlyMap<string, Series>,
  names: ReadonlyMap<string, { name: string; currency: string | null }>,
  now: number,
): { up: Array<Mover>; down: Array<Mover> } {
  const all = UNIVERSE[region].flatMap((l): Array<Mover> => {
    const s = series.get(l.symbol)
    const m = s ? moveOf(s, '1W', now) : null
    if (!m || m.baseAt === null) return []
    const n = names.get(l.symbol)
    return [
      {
        ...l,
        name: n?.name ?? l.symbol,
        currency: n?.currency ?? null,
        change: m.change,
        base: m.base,
        baseAt: m.baseAt,
        price: m.price,
      },
    ]
  })
  const up = all
    .filter((m) => m.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, MOVER_ROWS)
  const down = all
    .filter((m) => m.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, MOVER_ROWS)
  return { up, down }
}

/** Yahoo's quote answer: each symbol's short name and currency. */
export function parseNames(
  json: unknown,
): Map<string, { name: string; currency: string | null }> {
  const out = new Map<string, { name: string; currency: string | null }>()
  const rows = (
    json as {
      quoteResponse?: { result?: Array<Record<string, unknown>> }
    } | null
  )?.quoteResponse?.result
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    const name = r.shortName ?? r.longName
    if (typeof r.symbol === 'string' && typeof name === 'string')
      out.set(r.symbol, {
        name: name.replace(
          /,? (Inc|Corp|Corporation|N\.V|S\.A|AG|SE|plc|Ltd|Limited)\.?$/i,
          '',
        ),
        currency: typeof r.currency === 'string' ? r.currency : null,
      })
  }
  return out
}

const GENERIC = new Set(
  'and the company companies group holding holdings global technologies platforms international industries corporation'.split(
    ' ',
  ),
)

/**
 * The newest headline that is about this company and from this week:
 * published on or after the week's base day, its title naming the ticker
 * or a word of the name (Yahoo's search answers with loose matches, like
 * an old election story for Walmart). None when nothing fits.
 */
export function pickHeadline<THeadline extends { title: string; at: number }>(
  news: ReadonlyArray<THeadline>,
  m: { symbol: string; name: string; baseAt: number },
): THeadline | null {
  const words = [
    m.symbol.split(/[.-]/)[0],
    ...m.name
      .split(/[\s,.&()]+/)
      .filter((w) => w.length >= 4 && !GENERIC.has(w.toLowerCase())),
  ].map((w) => w.toLowerCase())
  const about = (t: string) => {
    const lower = t.toLowerCase()
    return words.some((w) =>
      new RegExp(
        `(^|[^a-z0-9])${w.replace(/[^a-z0-9]/g, '')}([^a-z0-9]|$)`,
      ).test(lower),
    )
  }
  return (
    [...news]
      .sort((a, b) => b.at - a.at)
      .find((h) => h.at >= m.baseAt && about(h.title)) ?? null
  )
}

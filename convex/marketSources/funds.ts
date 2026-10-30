import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from '../_generated/server'
import { requireUser } from '../auth'
import {
  FUNDS,
  FUNDS_SOURCE,
  biggestMoves,
  holdingsFile,
  lastTwo,
  parseHoldings,
  readable,
} from '../../src/lib/bigFunds'
import type { FundBook } from '../../src/lib/bigFunds'
import { MAX_COMPANIES } from '../../src/lib/companies'

/* BIG FUNDS (YOUR COMPANIES' fourth column): when MARKET opens, five
   funds' two latest 13F filings from SEC EDGAR — per fund the filing
   list, two indexes and two holdings files, 25 requests paced under the
   SEC's 10 a second. Nothing is stored. EDGAR asks for a contact in the
   User-Agent (`SEC_USER_AGENT`); without it, or no answer, `reached:
   false` and the column alone says so. Canned on the test backend. */

const move = v.object({
  symbol: v.string(),
  fund: v.string(),
  was: v.number(),
  now: v.number(),
  wasPeriod: v.string(),
  nowPeriod: v.string(),
})
const answer = v.object({
  source: v.string(),
  fetchedAt: v.number(),
  reached: v.boolean(),
  moves: v.array(move),
})
type Answer = Infer<typeof answer>

const GAP_MS = 125

export const funds = action({
  args: {
    held: v.array(v.object({ symbol: v.string(), name: v.string() })),
  },
  returns: answer,
  handler: async (ctx, args): Promise<Answer> => {
    await requireUser(ctx)
    const now = Date.now()
    const held = args.held.slice(0, MAX_COMPANIES)
    if (process.env.E2E === '1') return canned(held, now)
    const agent = process.env.SEC_USER_AGENT
    const none = {
      source: FUNDS_SOURCE,
      fetchedAt: now,
      reached: false,
      moves: [],
    }
    if (!agent || held.length === 0) return none
    /* One request every 125 ms across all five funds: 8 a second. */
    let next = Date.now()
    const slot = () => {
      const at = Math.max(Date.now(), next)
      next = at + GAP_MS
      return new Promise((r) => setTimeout(r, at - Date.now()))
    }
    const get = async (url: string, as: 'json' | 'text') => {
      await slot()
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': agent },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return null
        return as === 'json'
          ? ((await res.json()) as unknown)
          : await res.text()
      } catch {
        return null
      }
    }
    const holdings = async (cik: string, accession: string) => {
      const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}`
      const file = holdingsFile(await get(`${dir}/index.json`, 'json'))
      if (!file) return null
      const xml = await get(`${dir}/${file}`, 'text')
      return typeof xml === 'string' ? parseHoldings(xml) : null
    }
    const books = await Promise.all(
      FUNDS.map(async (f): Promise<FundBook | null> => {
        const list = await get(
          `https://data.sec.gov/submissions/CIK${f.cik.padStart(10, '0')}.json`,
          'json',
        )
        const two = lastTwo(list)
        if (two.length < 2) return null
        const [a, b] = two
        const [nowH, wasH] = await Promise.all([
          holdings(f.cik, a.accession),
          holdings(f.cik, b.accession),
        ])
        if (!readable(nowH) || !readable(wasH)) return null
        return {
          fund: f.name,
          now: nowH,
          was: wasH,
          nowPeriod: a.period,
          wasPeriod: b.period,
        }
      }),
    )
    const read = books.filter((b): b is FundBook => b !== null)
    if (read.length === 0) return none
    return {
      source: FUNDS_SOURCE,
      fetchedAt: now,
      reached: true,
      moves: biggestMoves(held, read),
    }
  },
})

function canned(
  held: Array<{ symbol: string; name: string }>,
  now: number,
): Answer {
  const at = { wasPeriod: '2026-03-31', nowPeriod: '2026-06-30' }
  const shapes = [
    { fund: 'Berkshire', was: 17_800_000, now: 19_224_000 },
    { fund: 'Bridgewater', was: 412_000, now: 284_000 },
  ]
  return {
    source: FUNDS_SOURCE,
    fetchedAt: now,
    reached: true,
    moves: held
      .slice(0, 2)
      .map((h, i) => ({ symbol: h.symbol, ...shapes[i], ...at })),
  }
}

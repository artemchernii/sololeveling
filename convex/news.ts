import { v } from 'convex/values'

import { internal } from './_generated/api'
import { action } from './_generated/server'
import { requireUser } from './auth'
import { parseNews } from '../src/lib/yahooFundamentals'
import type { Headline } from '../src/lib/yahooFundamentals'

/* A company's headlines on its NEWS tab (13 Oct: "we dont want to
   store news, we simply fetch it and show"): Yahoo Finance's search
   for the ticker, asked when the tab's page opens, at most eight,
   nothing written, no summary. Not an input to the verdict. */

const headline = v.object({
  title: v.string(),
  publisher: v.string(),
  at: v.number(),
  link: v.string(),
})

export const of = action({
  args: { instrumentId: v.id('instruments') },
  returns: v.object({ at: v.number(), items: v.array(headline) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ at: number; items: Array<Headline> }> => {
    const ownerId = await requireUser(ctx)
    const inst: { symbol: string; type: string } | null = await ctx.runQuery(
      internal.fundamentals.symbolOf,
      {
        ownerId,
        instrumentId: args.instrumentId,
      },
    )
    if (inst === null) throw new Error('No such share')
    if (process.env.E2E === '1') return await canned(inst.symbol)
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(inst.symbol)}&quotesCount=0&newsCount=8`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (SoloLeveling personal app)' } },
    )
    if (!res.ok) throw new Error(`Yahoo said ${res.status}`)
    return { at: Date.now(), items: parseNews(await res.json()) }
  },
})

/* The test backend's headlines, by symbol, a moment late so the
   loading rows are seen: AVGO eight, a fund three, QUIET none, DOWN
   a failure. */
async function canned(symbol: string) {
  await new Promise((r) => setTimeout(r, 1200))
  if (symbol === 'DOWN') throw new Error('Yahoo said 500')
  const now = Date.now()
  const H = 3_600_000
  const rows: Array<[string, string, number]> = [
    ['Reuters', 'Broadcom to supply custom AI chips in multi-year deal', 1],
    ['Bloomberg', 'Broadcom shares rise as AI networking orders build', 3],
    ['CNBC', 'Chip stocks slide as new export curbs weigh on the sector', 26],
    [
      "Barron's",
      'Broadcom stock: analysts keep raising their price targets',
      30,
    ],
    ['MarketWatch', "Broadcom's VMware unit lifts software revenue again", 50],
    ['Motley Fool', 'Broadcom after its pullback from all-time highs', 74],
    ["Investor's Business Daily", 'Broadcom tests its 50-day line', 98],
    ['Yahoo Finance', 'Broadcom declares quarterly dividend of $0.59', 146],
  ]
  const n = symbol === 'AVGO' ? 8 : symbol === 'QUIET' ? 0 : 3
  const items: Array<Headline> = rows
    .slice(0, n)
    .map(([publisher, title, h], i) => ({
      title,
      publisher,
      at: now - h * H,
      link: `https://finance.yahoo.com/news/e2e-${i + 1}.html`,
    }))
  return { at: now, items }
}

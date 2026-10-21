import { describe, expect, test } from 'vitest'

import {
  allocation,
  treemap,
  parseOpened,
  placed,
  splitOf,
  worldOf,
} from './insightsMine'

describe('treemap', () => {
  test('areas follow euros, a tiny or frozen box at the floor, all inside', () => {
    const boxes = [3000, 2000, 1000, 118, 1, null].map((eur, i) => ({ i, eur }))
    const r = treemap(boxes, 1.6)
    expect(r.map((b) => b.i)).toEqual([0, 1, 2, 3, 4, 5])
    const area = (b: (typeof r)[number]) => b.w * b.h
    expect(area(r[0]) / area(r[1])).toBeCloseTo(1.5, 1)
    /* 118 and 1 and the frozen one are drawn at 5% of €6,119. */
    expect(area(r[4])).toBeCloseTo(area(r[5]), 5)
    expect(area(r[3])).toBeCloseTo(area(r[4]), 5)
    const all = r.reduce((t, b) => t + area(b), 0)
    expect(all).toBeCloseTo(100 * 100, 0)
    for (const b of r) {
      expect(b.x + b.w).toBeLessThanOrEqual(100.0001)
      expect(b.y + b.h).toBeLessThanOrEqual(100.0001)
    }
  })
})

describe('parseOpened', () => {
  test("reads Yahoo's sector weights, top holdings, sector and country", () => {
    const o = parseOpened({
      quoteSummary: {
        result: [
          {
            topHoldings: {
              sectorWeightings: [
                { technology: { raw: 0.31 } },
                { healthcare: { raw: 0.1 } },
              ],
              holdings: [
                {
                  symbol: 'NVDA',
                  holdingName: 'NVIDIA',
                  holdingPercent: { raw: 0.07 },
                },
              ],
            },
            assetProfile: { sector: 'Technology', country: 'United States' },
          },
        ],
      },
    })
    expect(o).toEqual({
      sectors: { technology: 0.31, healthcare: 0.1 },
      top: [{ symbol: 'NVDA', name: 'NVIDIA', pct: 0.07 }],
      sector: 'Technology',
      country: 'United States',
    })
    expect(parseOpened({ quoteSummary: { result: [] } })).toBeNull()
  })
})

describe('allocation', () => {
  test('places by region tag, a world fund its own line; tech from Yahoo, else tags', () => {
    const fund = splitOf(
      'etf',
      {
        sectors: { technology: 0.3, healthcare: 0.1 },
        top: [],
        sector: null,
        country: null,
      },
      { sector: 'etf', region: 'us' },
    )
    /* Yahoo opens nothing: its stored tags still place it. */
    const share = splitOf('stock', null, { sector: 'tech', region: 'europe' })
    const world = splitOf('etf', null, { sector: 'etf', region: 'world' })
    const rows = allocation(
      [
        { symbol: 'VUAA', eur: 400, split: fund },
        { symbol: 'SAP', eur: 200, split: share },
        { symbol: 'IWDA', eur: 200, split: world },
        {
          symbol: 'GOLD',
          eur: 200,
          split: splitOf('gold', null, {
            sector: 'gold',
            region: 'no country',
          }),
        },
      ],
      worldOf({
        sectors: { technology: 0.26, healthcare: 0.1 },
        top: [],
        sector: null,
        country: null,
      }),
    )
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by.us).toMatchObject({ mine: 40, world: null, notOpened: [] })
    expect(by.europe).toMatchObject({ mine: 20, world: null })
    expect(by.world).toMatchObject({ mine: 20, world: null })
    expect(by.gold).toMatchObject({ mine: 20, world: 0 })
    /* IWDA unopened: named under tech and health, not guessed. */
    expect(by.tech).toMatchObject({
      mine: 32,
      world: 26,
      notOpened: ['IWDA'],
      unknown: 20,
    })
    expect(by.health).toMatchObject({ mine: 4, world: 10 })
  })

  test('no region in a fund name, no stored country: named under the places', () => {
    const rows = allocation(
      [
        {
          symbol: 'X',
          eur: 10,
          split: splitOf('etf', null, {
            sector: 'etf',
            region: 'etf · no region',
          }),
        },
      ],
      {},
    )
    expect(rows.find((r) => r.id === 'us')).toMatchObject({
      mine: null,
      notOpened: ['X'],
      unknown: 100,
    })
    /* A share with no stored country: Yahoo's profile on this open. */
    expect(
      splitOf(
        'stock',
        { sectors: null, top: [], sector: null, country: 'Russia' },
        { sector: 'missing', region: 'missing' },
      ),
    ).toMatchObject({ us: 0, europe: 0, world: 0 })
  })
})

test('SHLD counts as US, his pick; a name with a region keeps its own', () => {
  const none = { sector: 'etf', region: 'etf · no region' } as const
  expect(placed('SHLD.L', none)?.region).toBe('us')
  expect(placed('OTHER', none)?.region).toBe('etf · no region')
  expect(placed('SHLD', { sector: 'etf', region: 'europe' })?.region).toBe(
    'europe',
  )
})

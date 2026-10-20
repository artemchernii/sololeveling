import { describe, expect, test } from 'vitest'

import {
  allocation,
  heatRows,
  parseOpened,
  splitOf,
  worldOf,
} from './insightsMine'

describe('heatRows', () => {
  test('biggest first, rows of three, four, five; no euros last at the smallest width', () => {
    const boxes = [5, 40, null, 10, 30, 20, 1, 2, 3].map((eur, i) => ({
      i,
      eur,
    }))
    const rows = heatRows(boxes)
    expect(rows.map((r) => r.length)).toEqual([3, 4, 2])
    expect(rows[0].map((b) => b.eur)).toEqual([40, 30, 20])
    expect(rows[2].at(-1)).toMatchObject({ eur: null, w: 1 })
    expect(heatRows(boxes.slice(0, 4)).map((r) => r.length)).toEqual([4])
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
    expect(by.tech).toMatchObject({ mine: 32, world: 26, notOpened: ['IWDA'] })
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
    })
  })
})

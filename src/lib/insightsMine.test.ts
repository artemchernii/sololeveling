import { describe, expect, test } from 'vitest'

import { allocation, heatRows, parseOpened, splitOf } from './insightsMine'

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
  test('both numbers a line; a fund with no countries is named, not guessed', () => {
    const fund = splitOf('etf', {
      sectors: { technology: 0.3, healthcare: 0.1 },
      top: [],
      sector: null,
      country: null,
    })
    const share = splitOf('stock', {
      sectors: null,
      top: [],
      sector: 'Technology',
      country: 'Germany',
    })
    const rows = allocation(
      [
        { symbol: 'VUAA', eur: 600, split: fund },
        { symbol: 'SAP', eur: 200, split: share },
        { symbol: 'GOLD', eur: 200, split: splitOf('gold', null) },
      ],
      { tech: 0.26, health: 0.1 },
    )
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by.tech).toMatchObject({ mine: 38, world: 26, notOpened: [] })
    expect(by.gold).toMatchObject({ mine: 20, world: null })
    expect(by.europe).toMatchObject({ mine: 20, notOpened: ['VUAA'] })
    expect(by.health).toMatchObject({ mine: 6, world: 10 })
  })

  test('nothing opened: no number, every position named', () => {
    const rows = allocation(
      [{ symbol: 'X', eur: 10, split: splitOf('etf', null) }],
      {},
    )
    expect(rows[0]).toMatchObject({ mine: null, world: null, notOpened: ['X'] })
  })
})

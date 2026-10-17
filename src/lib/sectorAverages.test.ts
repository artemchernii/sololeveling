import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { MARKET, industryOf, parsePeTable } from './sectorAverages'

const sample = readFileSync(
  new URL('./samples/damodaran-pedata.html', import.meta.url),
  'utf8',
)

describe("Damodaran's P/E table", () => {
  it('reads each industry, its firms and forward P/E, and the year', () => {
    const t = parsePeTable(sample)
    expect(t?.year).toBe(2026)
    expect(t?.rows.find((r) => r.industry === 'Semiconductor')).toEqual({
      industry: 'Semiconductor',
      firms: 66,
      forwardPe: 37.29,
    })
    expect(t?.rows.find((r) => r.industry === MARKET)?.forwardPe).toBe(27.66)
    expect(
      t?.rows.find((r) => r.industry === 'Software (System & Application)'),
    ).toBeDefined()
  })

  it('says nothing for a page without the table', () => {
    expect(parsePeTable('<html>Too Many Requests</html>')).toBeNull()
  })

  it("maps Yahoo's industry to Damodaran's, or to none", () => {
    expect(industryOf('Semiconductors')).toBe('Semiconductor')
    expect(industryOf('Banks - Regional')).toBe('Banks (Regional)')
    expect(industryOf('Shell Companies')).toBeUndefined()
    expect(industryOf(undefined)).toBeUndefined()
  })
})

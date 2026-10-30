import { describe, expect, it } from 'vitest'

import {
  biggestMoves,
  holdingsFile,
  issuerKey,
  lastTwo,
  moveWord,
  parseHoldings,
  quarter,
  readable,
  sharesShort,
} from './bigFunds'

const row = (name: string, shares: number, extra = '') => `
  <infoTable>
    <nameOfIssuer>${name}</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <shrsOrPrnAmt><sshPrnamt>${shares}</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    ${extra}
  </infoTable>`

describe('bigFunds', () => {
  it('the two latest 13F-HR filings, amendments and other forms left out', () => {
    const recent = {
      form: ['4', '13F-HR', '13F-HR/A', '13F-HR', '13F-HR'],
      accessionNumber: ['a0', 'a1', 'a2', 'a3', 'a4'],
      reportDate: ['', '2026-06-30', '2025-03-31', '2026-03-31', '2025-12-31'],
    }
    expect(lastTwo({ filings: { recent } })).toEqual([
      { accession: 'a1', period: '2026-06-30' },
      { accession: 'a3', period: '2026-03-31' },
    ])
    expect(lastTwo(null)).toEqual([])
  })

  it('finds the holdings file, not the cover', () => {
    const item = [
      { name: 'x-index.html' },
      { name: 'primary_doc.xml' },
      { name: 'Q2_2026.xml' },
    ]
    expect(holdingsFile({ directory: { item } })).toBe('Q2_2026.xml')
    expect(holdingsFile({})).toBeNull()
  })

  it('names in the file and in the app meet on the first two words', () => {
    expect(issuerKey('META PLATFORMS INC')).toBe('META PLATFORMS')
    expect(issuerKey('Meta Platforms, Inc.')).toBe('META PLATFORMS')
    expect(issuerKey('ALPHABET INC')).toBe('ALPHABET')
    expect(issuerKey('Alphabet Inc. (Class A)')).toBe('ALPHABET')
    expect(issuerKey('AMAZON COM INC')).toBe(issuerKey('Amazon.com, Inc.'))
    expect(issuerKey('BANK OF AMERICA CORP')).toBe(
      issuerKey('Bank of America Corporation'),
    )
    expect(issuerKey('APPLE HOSPITALITY REIT')).not.toBe(issuerKey('Apple'))
  })

  it('adds every class and manager; leaves options and bonds out', () => {
    const xml = `<informationTable>${row('ALPHABET INC', 100)}${row('ALPHABET INC', 50)}${row(
      'NVIDIA CORPORATION',
      10,
      '<putCall>Call</putCall>',
    )}${row('NVIDIA CORPORATION', 7)}<ns1:infoTable><ns1:nameOfIssuer>ORACLE CORP</ns1:nameOfIssuer><ns1:sshPrnamt>9</ns1:sshPrnamt><ns1:sshPrnamtType>PRN</ns1:sshPrnamtType></ns1:infoTable></informationTable>`
    const h = parseHoldings(xml)
    expect(h.get('ALPHABET')).toBe(150)
    expect(h.get('NVIDIA')).toBe(7)
    expect(h.has('ORACLE')).toBe(false)
  })

  it('a cover with its holdings kept confidential holds nothing', () => {
    const h = parseHoldings(
      `<informationTable>${row('NA', 0)}</informationTable>`,
    )
    expect(h.size).toBe(0)
    expect(readable(h)).toBe(false)
    expect(readable(null)).toBe(false)
  })

  it('each held company gets the fund that moved the most, both counts kept', () => {
    const book = (fund: string, was: number, now: number) => ({
      fund,
      was: new Map([['ALPHABET', was]]),
      now: new Map([['ALPHABET', now]]),
      wasPeriod: '2026-03-31',
      nowPeriod: '2026-06-30',
    })
    const held = [
      { symbol: 'GOOGL', name: 'Alphabet Inc.' },
      { symbol: 'XYZ', name: 'Nobody Holds It' },
    ]
    expect(
      biggestMoves(held, [
        book('Norges Bank', 1000, 1040),
        book('Berkshire', 200, 120),
        book('Duquesne', 5, 5),
      ]),
    ).toEqual([
      {
        symbol: 'GOOGL',
        fund: 'Berkshire',
        was: 200,
        now: 120,
        wasPeriod: '2026-03-31',
        nowPeriod: '2026-06-30',
      },
    ])
    expect(
      biggestMoves(held, [book('Norges Bank', 1000, 1040), book('X', 0, 3)])[0]
        .fund,
    ).toBe('X')
  })

  it('reads short: the quarter, the shares, the move', () => {
    expect(quarter('2026-06-30')).toBe('Q2')
    expect(quarter('2025-12-31')).toBe('Q4')
    expect(sharesShort(12_561_737)).toBe('12.6M')
    expect(sharesShort(840_000)).toBe('840K')
    expect(moveWord({ was: 100, now: 108 })).toBe('+8% shares')
    expect(moveWord({ was: 100, now: 69 })).toBe('−31% shares')
    expect(moveWord({ was: 0, now: 5 })).toBe('NEW')
    expect(moveWord({ was: 5, now: 0 })).toBe('ALL SOLD')
  })
})

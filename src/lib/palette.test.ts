import { describe, expect, it } from 'vitest'

import { PALETTE_PAGES, matchPalette } from './palette'

describe('matchPalette', () => {
  it('lists everything on an empty query, so the palette documents itself', () => {
    const { commands, pages } = matchPalette('')
    expect(commands.map((c) => c.slash)).toEqual(['/log'])
    expect(pages).toHaveLength(PALETTE_PAGES.length)
  })

  it('matches a page by its label, without a slash', () => {
    const { pages } = matchPalette('languages')
    expect(pages.map((p) => p.target)).toEqual([
      { kind: 'page', to: '/languages' },
    ])
  })

  it('is case-insensitive and matches inside the label', () => {
    expect(matchPalette('FINANCES').pages).toHaveLength(1)
    expect(matchPalette('ack').pages.map((p) => p.label)).toEqual(['Backlog'])
  })

  it('narrows to the route when the query starts with a slash', () => {
    const { commands, pages } = matchPalette('/fin')
    expect(commands).toHaveLength(0)
    expect(pages.map((p) => p.slash)).toEqual(['/finances'])
  })

  it('finds the log command by slash and by name', () => {
    expect(matchPalette('/log').commands.map((c) => c.target)).toEqual([
      { kind: 'capture' },
    ])
    expect(matchPalette('log').commands).toHaveLength(1)
  })

  it('carries what followed the command through as a prefill', () => {
    expect(matchPalette('/log workout 60').prefill).toBe('workout 60')
    expect(matchPalette('/log').prefill).toBe('')
    expect(matchPalette('workout 60').prefill).toBe('')
  })

  it('returns nothing rather than everything when nothing matches', () => {
    const { commands, pages } = matchPalette('zzzz')
    expect(commands).toHaveLength(0)
    expect(pages).toHaveLength(0)
  })

  it('never lists a page the rail does not have', () => {
    expect(PALETTE_PAGES.every((p) => p.slash.startsWith('/'))).toBe(true)
    expect(new Set(PALETTE_PAGES.map((p) => p.slash)).size).toBe(
      PALETTE_PAGES.length,
    )
  })
})

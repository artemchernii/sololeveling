// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { FIRST, SLOTS, portsFor } from '../e2e/ports.ts'

/* Two checkouts on the same ports reach each other's test backend. */
describe('portsFor', () => {
  const main = '/Users/a/sololeveling'
  const tree = '/Users/a/sololeveling/.claude/worktrees/bank-card'

  it('gives one folder the same ports every time', () => {
    expect(portsFor(tree)).toEqual(portsFor(tree))
  })

  it('gives two folders ports that do not touch', () => {
    const a = Object.values(portsFor(main))
    const b = Object.values(portsFor(tree))
    expect(a.filter((p) => b.includes(p))).toEqual([])
  })

  it('hands out three in a row, inside its range', () => {
    for (let i = 0; i < 500; i++) {
      const { backend, site, app } = portsFor(`${tree}-${i}`)
      expect([site, app]).toEqual([backend + 1, backend + 2])
      expect(backend).toBeGreaterThanOrEqual(FIRST)
      expect(app).toBeLessThan(FIRST + SLOTS * 3)
      expect((backend - FIRST) % 3).toBe(0)
    }
  })

  it('lets E2E_PORT_BASE win, and ignores one that is not a number', () => {
    expect(portsFor(tree, '6100')).toEqual({
      backend: 6100,
      site: 6101,
      app: 6102,
    })
    expect(portsFor(tree, 'x')).toEqual(portsFor(tree))
    expect(portsFor(tree, '')).toEqual(portsFor(tree))
  })
})

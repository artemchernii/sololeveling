import { describe, expect, it } from 'vitest'

import { transferFor } from './gapMatch'
import type { Side } from './gapMatch'

const day = (d: number, month = 9) => new Date(2026, month, d, 12).getTime()

/* His accounts on 11 Oct: Trade Republic read €1,042.46 on 26 Sept and
   €1,543.09 on 3 Oct with no row between; ActivoBank's statement books
   −€505.20 to Trade Republic on 6 Oct. */
const gap = {
  accountId: 'tr',
  cents: 50063,
  from: day(26, 8),
  to: day(3),
}
const sent: Side = {
  accountId: 'activo',
  at: day(6),
  cents: -50520,
  otherAccountId: 'tr',
  paired: false,
}

describe('transferFor', () => {
  it('his Trade Republic gap is the ActivoBank transfer, less a €4.57 fee', () => {
    expect(transferFor(gap, [sent])).toEqual({ row: sent, feeCents: 457 })
  })

  it('takes a row that names no account, and the exact amount with no fee', () => {
    const exact = { ...sent, cents: -50063, otherAccountId: null }
    expect(transferFor(gap, [sent, exact])).toEqual({ row: exact, feeCents: 0 })
  })

  it('money that left: the other account received a fee less', () => {
    const left = { ...gap, accountId: 'activo', cents: -50520 }
    const got = { ...sent, accountId: 'tr', cents: 50063, otherAccountId: null }
    expect(transferFor(left, [got])).toEqual({ row: got, feeCents: 457 })
  })

  it('refuses what is not it', () => {
    const not = (over: Partial<Side>) =>
      expect(transferFor(gap, [{ ...sent, ...over }])).toBeNull()
    not({ paired: true })
    not({ accountId: 'tr' })
    not({ otherAccountId: 'revolut' })
    /* The wrong way, less than arrived, and a fee too big to be one. */
    not({ cents: 50520 })
    not({ cents: -50000 })
    not({ cents: -51100 })
    /* Too long before the earlier balance, too long after the later. */
    not({ at: day(22, 8) })
    not({ at: day(9) })
    expect(transferFor({ ...gap, cents: 0 }, [sent])).toBeNull()
  })

  it('of two that fit, the nearer to the later balance', () => {
    const early = { ...sent, at: day(28, 8) }
    expect(transferFor(gap, [early, sent])?.row).toBe(sent)
  })
})

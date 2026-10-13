import { describe, expect, it } from 'vitest'
import { dayBars, inEur, outEur } from './flowMarks'

describe('a zero has no sign', () => {
  it('nothing spent is €0, not −€0', () => {
    expect(outEur(0)).toBe('€0')
    expect(outEur(0, true)).toBe('€0.00')
  })
  it('forty cents shown in whole euros is €0 too', () => {
    expect(outEur(0.4)).toBe('€0')
    expect(outEur(0.4, true)).toBe('−€0.40')
  })
  it('an amount keeps its sign, whichever sign it came with', () => {
    expect(outEur(127)).toBe('−€127')
    expect(outEur(-127)).toBe('−€127')
    expect(inEur(2500)).toBe('+€2,500')
    expect(inEur(0)).toBe('€0')
  })
})

describe("a day's two bars", () => {
  it('salary over a big payment: together they stay in the room', () => {
    const h = dayBars(2500, 700, 700)
    expect(h.in + h.out).toBeLessThanOrEqual(44.001)
    expect(h.in).toBeGreaterThan(h.out * 0.9)
  })
  it('one bar alone is as it was', () => {
    expect(dayBars(0, 700, 700)).toEqual({ in: 0, out: 44 })
    expect(dayBars(0, 1, 700).out).toBe(5)
    expect(dayBars(175, 0, 700).in).toBe(22)
  })
  it('nothing moved: no bars', () => {
    expect(dayBars(0, 0, 700)).toEqual({ in: 0, out: 0 })
  })
})

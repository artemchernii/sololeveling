import { priceEurNow, searchYahoo } from '../market'
import type { Candidate } from '../../src/lib/market'
import { preferClass, searchableName } from '../../src/lib/intake'

/* Split from ai/intake.ts on 21 Nov, when it passed 940 lines and the
   Trade Republic CSV needed the same ticker search. */

/* A name as the broker prints it → ticker candidates, and which one is the
   right share class. Once per name: a trade history repeats them. */
/* A ticker as a trading CSV prints it: "TSLA", "BRK.B". */
export const TICKER = /^[A-Z][A-Z0-9.]{0,7}$/

export class Tickers {
  private found = new Map<
    string,
    { candidates: Array<Candidate>; preferred?: number }
  >()
  async find(name: string, isin?: string, symbol?: string) {
    const key = isin ?? symbol ?? name
    const known = this.found.get(key)
    if (known) return known
    let candidates: Array<Candidate> = []
    /* A share or a fund: an ISIN search can come back with a coin or a
       future ("NOW-USD.SW" for Alphabet, 27 Sep) — then ask by name. */
    const listed = (c: Array<Candidate>) =>
      c.filter((x) => x.type === 'EQUITY' || x.type === 'ETF')
    try {
      if (isin) candidates = listed(await searchYahoo(isin))
      /* The ticker the screen printed (Trading 212's "7.36 IGLN"): its own
         listings first — a name search for "iShares Physical Gold" found
         an American OTC line (3 Oct). */
      if (candidates.length === 0 && symbol) {
        const base = symbol.split('.')[0]
        candidates = listed(await searchYahoo(symbol)).filter(
          (c) => c.symbol.split('.')[0] === base,
        )
      }
      if (candidates.length === 0)
        candidates = await searchYahoo(searchableName(name))
    } catch {
      candidates = []
    }
    candidates = candidates.slice(0, 6)
    const result = {
      candidates,
      preferred:
        candidates.length > 0 ? preferClass(name, candidates) : undefined,
    }
    this.found.set(key, result)
    return result
  }

  /** Listings a name search finds that `had` does not already hold. */
  async byName(name: string, had: ReadonlyArray<Candidate>) {
    let found: Array<Candidate> = []
    try {
      found = await searchYahoo(searchableName(name))
    } catch {
      found = []
    }
    const seen = new Set(had.map((c) => c.symbol))
    return found
      .filter((c) => c.type === 'EQUITY' || c.type === 'ETF')
      .filter((c) => !seen.has(c.symbol))
      .slice(0, 6)
  }

  /** Whether any of the ticker's own lines has a price at all. */
  async listed(symbol: string, had: ReadonlyArray<Candidate>) {
    const base = symbol.split('.')[0].toUpperCase()
    for (const c of had)
      if (
        c.symbol.split('.')[0].toUpperCase() === base &&
        (await this.price(c.symbol)) !== null
      )
        return true
    return (await this.price(symbol)) !== null
  }

  private prices = new Map<string, { priceEur: number; asOf: number } | null>()
  async price(symbol: string) {
    if (this.prices.has(symbol)) return this.prices.get(symbol) ?? null
    let p: { priceEur: number; asOf: number } | null
    try {
      p = await priceEurNow(symbol)
    } catch {
      p = null
    }
    this.prices.set(symbol, p)
    return p
  }
}

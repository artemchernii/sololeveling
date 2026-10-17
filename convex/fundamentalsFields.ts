import { v } from 'convex/values'

/* One reading of a company's fundamentals, as `fundamentals` stores it
   beside its owner and instrument (schema.ts) and as fundamentals.ts
   takes and returns it — kept apart so neither imports the other. */
export const readingFields = {
  asOf: v.number(),
  source: v.string(),
  /** Yahoo's industry: picks the sector average in the P/E card. */
  industry: v.optional(v.string()),
  /** The currency revenue is reported in. */
  currency: v.optional(v.string()),
  target: v.optional(
    v.object({
      mean: v.number(),
      low: v.number(),
      high: v.number(),
      count: v.number(),
    }),
  ),
  rating: v.optional(
    v.object({
      mean: v.number(),
      key: v.string(),
      strongBuy: v.number(),
      buy: v.number(),
      hold: v.number(),
      sell: v.number(),
      strongSell: v.number(),
    }),
  ),
  /** Last quarter on the same quarter a year before, a fraction. */
  revenueGrowth: v.optional(v.number()),
  revenue: v.optional(
    v.object({
      now: v.object({ asOf: v.number(), value: v.number() }),
      was: v.object({ asOf: v.number(), value: v.number() }),
    }),
  ),
  pe: v.optional(
    v.object({
      forward: v.optional(v.number()),
      trailing: v.optional(v.number()),
    }),
  ),
  dividend: v.optional(
    v.object({
      yield: v.number(),
      rate: v.optional(v.number()),
      exDay: v.optional(v.number()),
    }),
  ),
}

export const reading = v.object(readingFields)

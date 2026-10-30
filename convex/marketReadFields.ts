import { v } from 'convex/values'

import { KINDS, MOODS, TONES } from '../src/lib/marketRead'

/* The market read's shapes (I3, 19 Oct), kept beside the schema the way
   fundamentalsFields.ts is. The read's words are the model's; its numbers
   are `facts`, the room's own, stored with the read so a line always
   prints what it was given. */

export const marketFact = v.object({
  key: v.string(),
  label: v.string(),
  value: v.string(),
  tone: v.union(v.literal('good'), v.literal('bad'), v.null()),
})

const literals = <T extends string>(xs: ReadonlyArray<T>) =>
  v.union(...xs.map((x) => v.literal(x)))

export const marketReadBody = v.object({
  mood: literals(MOODS),
  lead: v.string(),
  rest: v.string(),
  summary: v.string(),
  kpis: v.array(v.string()),
  lines: v.array(
    v.object({
      kind: literals(KINDS),
      tone: literals(TONES),
      badge: v.string(),
      title: v.string(),
      line: v.string(),
      factKeys: v.array(v.string()),
      plain: v.string(),
      /* The IDEAS line its move opens (29 Oct). */
      idea: v.optional(v.string()),
    }),
  ),
  opinion: v.string(),
  ideas: v.array(
    v.object({
      ticker: v.string(),
      name: v.string(),
      why: v.string(),
      bull: v.string(),
      bear: v.string(),
      wrong: v.string(),
    }),
  ),
  sources: v.array(
    v.object({
      site: v.string(),
      title: v.string(),
      url: v.string(),
      day: v.string(),
    }),
  ),
})

export const payer = v.union(v.literal('pro'), v.literal('api'))

/** Who wrote it and what it cost: model, tokens, searches, dollars. */
export const readStamp = v.object({
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  searches: v.number(),
  cost: v.number(),
  paidBy: payer,
})

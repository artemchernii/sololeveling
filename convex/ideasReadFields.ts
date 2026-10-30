import { v } from 'convex/values'

import { AREAS, CALLS, LINE_PARTS } from '../src/lib/ideasRead'

/* The IDEAS board's read (29 Oct), kept beside the schema the way
   marketReadFields.ts is. The plan's words, calls and euros are the
   model's; the facts it was given are stored with it, so a NUMBERS row
   always prints what the read was given. */

const literals = <T extends string>(xs: ReadonlyArray<T>) =>
  v.union(...xs.map((x) => v.literal(x)))

export const ideasBody = v.object({
  take: v.string(),
  parts: v.object({
    keep: v.number(),
    protect: v.number(),
    add: v.number(),
    new: v.number(),
  }),
  lines: v.array(
    v.object({
      part: literals(LINE_PARTS),
      ticker: v.string(),
      name: v.string(),
      call: literals(CALLS),
      eur: v.number(),
      area: literals(AREAS),
      why: v.string(),
      eurWhy: v.string(),
      numbers: v.array(
        v.object({ key: v.string(), text: v.string(), url: v.string() }),
      ),
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

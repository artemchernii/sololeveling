import { v } from 'convex/values'

import { readStamp } from './marketReadFields'
import { LINE_AREAS } from '../src/lib/rowsAskPrompt'

/* R7 Ask AI's answer, as the action returns it; N4 (22 Oct) keeps one on
   the server until it is opened or a day passes (convex/askReplies.ts). */

export const rowsAnswerShape = v.object({
  headline: v.string(),
  tiles: v.array(v.string()),
  lines: v.array(
    v.object({
      area: v.union(...LINE_AREAS.map((a) => v.literal(a))),
      text: v.string(),
      factKeys: v.array(v.string()),
      stray: v.boolean(),
    }),
  ),
})

export const askReplyFields = {
  ownerId: v.string(),
  question: v.string(),
  from: v.number(),
  to: v.number(),
  title: v.string(),
  range: v.string(),
  answeredAt: v.number(),
  answer: v.optional(rowsAnswerShape),
  stamp: v.optional(readStamp),
  error: v.optional(v.string()),
  cost: v.optional(v.number()),
  /** On screen when it landed, or opened since: it does not ring. */
  seenAt: v.optional(v.number()),
  rangAt: v.optional(v.number()),
}

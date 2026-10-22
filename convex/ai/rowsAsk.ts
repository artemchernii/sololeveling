'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'
import type { Infer, ObjectType } from 'convex/values'

import { internal } from '../_generated/api'
import { action } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { rowsAnswerShape } from '../askReplyFields'
import { requireUser } from '../auth'
import { readStamp } from '../marketReadFields'
import {
  CAP_USD,
  MARKET_READ_MODEL,
  monthKey,
  readCost,
} from '../../src/lib/marketRead'
import type { Usage } from '../../src/lib/marketRead'
import { monthsOf, rowFacts, rowLines } from '../../src/lib/rowsAsk'
import {
  MAX_HISTORY,
  MAX_QUESTION,
  ROWS_SCHEMA,
  cannedRows,
  parseRows,
  rowsPrompt,
} from '../../src/lib/rowsAskPrompt'

/* R7 Ask AI when deployed: one question, one call — Sonnet 5.5, the model
   Insights asks with, under the same $2 a month. The rows are read here
   (rowsAsk.forOwner), counted by src/lib/rowsAsk.ts and handed over with
   the counts; no web search. Paid only on a press, never retried; what the
   response cost, from its own usage, is added usable or not. The question
   and the answer go back to the page and nowhere else. On the test backend
   (E2E=1) a canned answer, nothing leaves. On localhost the drawer asks
   Claude Code instead (vite/claudeRead.ts, /__claude/rows-ask). */

const askArgs = {
  question: v.string(),
  from: v.number(),
  to: v.number(),
  title: v.string(),
  range: v.string(),
  /** The page's getTimezoneOffset(): his days, not the server's. */
  offsetMin: v.number(),
  /** The thread so far on the page, oldest first; never stored. */
  history: v.optional(v.array(v.object({ q: v.string(), a: v.string() }))),
}

/* N4: every answer the model gave (or failed to) is kept a day in
   askReplies, so a phone locked while it ran can open it from the push;
   a question refused before any call (empty, at the cap) is not. */
export const ask = action({
  args: askArgs,
  returns: v.union(
    v.object({
      ok: v.literal(true),
      answer: rowsAnswerShape,
      stamp: readStamp,
      replyId: v.optional(v.id('askReplies')),
    }),
    v.object({
      ok: v.literal(false),
      error: v.string(),
      cost: v.number(),
      replyId: v.optional(v.id('askReplies')),
    }),
  ),
  handler: async (ctx, args): Promise<Asked> => {
    const ownerId = await requireUser(ctx)
    const res = await answer(ctx, args, ownerId)
    if (!res.ok && (res.error === 'NO QUESTION' || res.error === 'CAP REACHED'))
      return res
    const replyId: Id<'askReplies'> = await ctx.runMutation(
      internal.askReplies.keep,
      {
        ownerId,
        question: args.question.trim().slice(0, MAX_QUESTION),
        from: args.from,
        to: args.to,
        title: args.title,
        range: args.range,
        ...(res.ok
          ? { answer: res.answer, stamp: res.stamp }
          : { error: res.error, cost: res.cost }),
      },
    )
    return { ...res, replyId }
  },
})

type Answered =
  | {
      ok: true
      answer: Infer<typeof rowsAnswerShape>
      stamp: Infer<typeof readStamp>
    }
  | { ok: false; error: string; cost: number }
type Asked = Answered & { replyId?: Id<'askReplies'> }

async function answer(
  ctx: ActionCtx,
  args: ObjectType<typeof askArgs>,
  ownerId: string,
): Promise<Answered> {
  const month = monthKey(Date.now())
  const question = args.question.trim().slice(0, MAX_QUESTION)
  if (question === '')
    return { ok: false as const, error: 'NO QUESTION', cost: 0 }
  if (
    (await ctx.runQuery(internal.marketAsk.spent, { ownerId, month })) >=
    CAP_USD
  )
    return { ok: false as const, error: 'CAP REACHED', cost: 0 }
  const charge = (usd: number) =>
    ctx.runMutation(internal.marketAsk.charge, { ownerId, month, usd })

  const period = {
    from: args.from,
    to: args.to,
    title: args.title,
    range: args.range,
  }
  const { rows, areas } = await ctx.runQuery(internal.rowsAsk.forOwner, {
    ownerId,
    from: args.from,
    to: args.to,
  })
  const label = new Map(areas.map((a) => [a.slug, a.label]))
  const facts = rowFacts(
    rows,
    (s) => label.get(s) ?? s,
    args.offsetMin,
    monthsOf(period, args.offsetMin),
  )

  if (process.env.E2E === '1') {
    await new Promise((r) => setTimeout(r, 900))
    const shape = await ctx.runQuery(internal.e2eMarketRead.armed, {
      ownerId,
    })
    if (shape === 'fail')
      return { ok: false as const, error: 'NOT REACHED', cost: 0 }
    const parsed = parseRows(cannedRows(facts), facts)
    if (!parsed.ok) return { ok: false as const, error: parsed.error, cost: 0 }
    await charge(0.03)
    return {
      ok: true as const,
      answer: parsed.answer,
      stamp: {
        model: MARKET_READ_MODEL,
        inputTokens: 14_200,
        outputTokens: 410,
        searches: 0,
        cost: 0.03,
        paidBy: 'api' as const,
      },
    }
  }
  if (!process.env.ANTHROPIC_API_KEY)
    return { ok: false as const, error: 'NO KEY', cost: 0 }

  const usage: Usage = { input: 0, output: 0, searches: 0 }
  const failed = async (error: string) => {
    const cost = readCost(usage)
    await charge(cost)
    return { ok: false as const, error, cost }
  }
  try {
    const response = await new Anthropic().messages.create({
      model: MARKET_READ_MODEL,
      max_tokens: 3000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: ROWS_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: rowsPrompt({
            question,
            period,
            facts,
            lines: rowLines(rows, args.offsetMin),
            goals: rows.goals,
            more: rows.more,
            today: new Date(Date.now() - args.offsetMin * 60_000)
              .toISOString()
              .slice(0, 10),
            history: (args.history ?? []).slice(-MAX_HISTORY),
          }),
        },
      ],
    })
    const u = response.usage
    usage.input +=
      u.input_tokens +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0)
    usage.output += u.output_tokens
    if (response.stop_reason === 'refusal') return await failed('DECLINED')
    if (response.stop_reason === 'max_tokens') return await failed('TOO LONG')
    const parsed = parseRows(
      response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
      facts,
    )
    if (!parsed.ok) return await failed(parsed.error)
    const cost = readCost(usage)
    await charge(cost)
    return {
      ok: true as const,
      answer: parsed.answer,
      stamp: {
        model: MARKET_READ_MODEL,
        inputTokens: usage.input,
        outputTokens: usage.output,
        searches: 0,
        cost,
        paidBy: 'api' as const,
      },
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      return await failed('KEY REFUSED')
    if (error instanceof Anthropic.RateLimitError)
      return await failed('BUSY OR LIMIT')
    if (error instanceof Anthropic.APIError)
      return await failed(`ERROR ${error.status}`)
    return await failed('NOT REACHED')
  }
}

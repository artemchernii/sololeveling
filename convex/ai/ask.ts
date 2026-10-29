'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { aiAction } from '../write'
import { requireUser } from '../auth'
import { marketFact, readStamp } from '../marketReadFields'
import {
  ASK_KINDS,
  ASK_SCHEMA,
  CHART_RANGES,
  MAX_ASK_SEARCHES,
  MAX_HISTORY,
  MAX_QUESTION,
  askPrompt,
  parseAsk,
  shotOf,
} from '../../src/lib/marketAsk'
import { MARKET_READ_MODEL, monthKey, readCost } from '../../src/lib/marketRead'
import type { Usage } from '../../src/lib/marketRead'
import { CANNED_ASK } from '../../src/lib/marketAskCanned'

/* ASK when deployed (I4, 21 Oct). One question, one call: Sonnet 5.5,
   the same model as the read, on the facts the page sends and the latest
   stored read; it searches the web (always, since 29 Oct: "we need by
   default search"). From IDEAS it carries the line its ✦ opened on and a
   dropped screenshot, sent with the question and never stored. Paid only on a press,
   never retried. The month's spend is checked before and what the
   response cost — from its own usage — is added after, usable or not.
   The question and the answer go back to the page and nowhere else. On
   the test backend (E2E=1) a canned answer, nothing leaves. On localhost
   the page asks Claude Code instead (vite/claudeRead.ts). */

const CONTINUES = 2

const answerShape = v.object({
  kind: v.union(...ASK_KINDS.map((k) => v.literal(k))),
  answer: v.string(),
  factKeys: v.array(v.string()),
  sources: v.array(
    v.object({
      site: v.string(),
      title: v.string(),
      url: v.string(),
      day: v.string(),
    }),
  ),
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
  charts: v.array(
    v.object({
      tickers: v.array(v.string()),
      range: v.union(...CHART_RANGES.map((r) => v.literal(r))),
    }),
  ),
  tables: v.array(
    v.object({ head: v.array(v.string()), rows: v.array(v.array(v.string())) }),
  ),
})

export const ask = aiAction({
  args: {
    question: v.string(),
    facts: v.array(marketFact),
    /** The IDEAS line its ✦ opened on. */
    line: v.optional(
      v.object({
        ticker: v.string(),
        part: v.string(),
        call: v.string(),
        eur: v.number(),
        why: v.string(),
      }),
    ),
    /** A dropped screenshot as a data URL; sent on, never stored. */
    shot: v.optional(v.string()),
    /** The thread so far on the page, oldest first; never stored. */
    history: v.optional(v.array(v.object({ q: v.string(), a: v.string() }))),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), answer: answerShape, stamp: readStamp }),
    v.object({ ok: v.literal(false), error: v.string(), cost: v.number() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const month = monthKey(Date.now())
    const question = args.question.trim().slice(0, MAX_QUESTION)
    if (question === '')
      return { ok: false as const, error: 'NO QUESTION', cost: 0 }
    if (
      (await ctx.runQuery(internal.marketAsk.spent, { ownerId, month })) >=
      (await ctx.runQuery(internal.marketAsk.cap, { ownerId }))
    )
      return { ok: false as const, error: 'CAP REACHED', cost: 0 }
    const keys = args.facts.map((f) => f.key)
    const charge = (usd: number) =>
      ctx.runMutation(internal.marketAsk.charge, { ownerId, month, usd })

    const read = await ctx.runQuery(internal.marketAsk.context, {
      ownerId,
      month,
    })
    /* NEXT already shows the read's ideas: an answer does not name them again. */
    const skip = read?.ideas.map((i) => i.ticker) ?? []

    if (process.env.E2E === '1') {
      await new Promise((r) => setTimeout(r, 900))
      const shape = await ctx.runQuery(internal.e2eMarketRead.armed, {
        ownerId,
      })
      if (shape === 'fail')
        return { ok: false as const, error: 'NOT REACHED', cost: 0 }
      const parsed = parseAsk(
        CANNED_ASK[
          args.line
            ? 'line'
            : /idea/i.test(question)
              ? 'ideas'
              : /allocation/i.test(question)
                ? 'plain'
                : 'web'
        ],
        keys,
        skip,
      )
      if (!parsed.ok)
        return { ok: false as const, error: parsed.error, cost: 0 }
      const cost = 0.08
      await charge(cost)
      return {
        ok: true as const,
        answer: parsed.answer,
        stamp: {
          model: MARKET_READ_MODEL,
          inputTokens: 28_000,
          outputTokens: 420,
          searches: 2,
          cost,
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
    const img = args.shot ? shotOf(args.shot) : null
    try {
      const client = new Anthropic()
      const prompt = askPrompt(
        args.facts,
        read,
        question,
        true,
        new Date().toISOString().slice(0, 10),
        (args.history ?? []).slice(-MAX_HISTORY),
        { line: args.line ?? null, shot: img ? 'attached' : null },
      )
      const messages: Array<Anthropic.MessageParam> = [
        {
          role: 'user',
          content: img
            ? [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: img.mediaType as 'image/png',
                    data: img.data,
                  },
                },
                { type: 'text', text: prompt },
              ]
            : prompt,
        },
      ]
      let response: Anthropic.Message | null = null
      for (let turn = 0; turn <= CONTINUES; turn++) {
        response = await client.messages.create({
          model: MARKET_READ_MODEL,
          max_tokens: 4000,
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: ASK_SCHEMA },
          },
          tools: [
            {
              type: 'web_search_20260209' as const,
              name: 'web_search' as const,
              max_uses: MAX_ASK_SEARCHES,
            },
          ],
          messages,
        })
        const u = response.usage
        usage.input +=
          u.input_tokens +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0)
        usage.output += u.output_tokens
        usage.searches += u.server_tool_use?.web_search_requests ?? 0
        if (response.stop_reason !== 'pause_turn') break
        messages.push({ role: 'assistant', content: response.content })
      }
      if (response === null || response.stop_reason === 'pause_turn')
        return await failed('TOO LONG')
      if (response.stop_reason === 'refusal') return await failed('DECLINED')
      const parsed = parseAsk(
        response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
        keys,
        skip,
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
          searches: usage.searches,
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
  },
})

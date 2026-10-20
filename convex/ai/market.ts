'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import {
  MARKET_READ_MODEL,
  MARKET_READ_SCHEMA,
  MAX_SEARCHES,
  marketReadPrompt,
  parseMarketRead,
  readCost,
} from '../../src/lib/marketRead'
import type { Usage } from '../../src/lib/marketRead'
import { CANNED_MARKET_READS } from '../../src/lib/marketReadCanned'

/* The deployed market read (I3, 19 Oct). Claude Sonnet 5.5 with web
   search, on the capped ANTHROPIC_API_KEY, given only the facts
   marketReads.run stored and answering in the shape MARKET_READ_SCHEMA
   fixes. What the response cost — tokens and searches from its own usage —
   is added to the month's spend whether or not the answer is usable.
   One call per press, no retry. On the test backend (E2E=1) a canned read
   answers and nothing leaves. Every path ends in finish or fail, so
   nothing stays "reading". */

/** Web search may pause a long turn; it is continued at most this often. */
const CONTINUES = 2

export const readMarket = internalAction({
  args: { readId: v.id('marketReads') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (error: string, cost = 0) =>
      ctx.runMutation(internal.marketReads.fail, {
        readId: args.readId,
        error,
        cost,
      })
    const job = await ctx.runQuery(internal.marketReads.forRead, {
      readId: args.readId,
    })
    if (job === null) return null
    const keys = job.facts.map((f) => f.key)

    if (process.env.E2E === '1') {
      await new Promise((r) => setTimeout(r, 900))
      const shape = await ctx.runQuery(internal.e2eMarketRead.armed, {
        ownerId: job.ownerId,
      })
      if (shape === 'fail') {
        await fail('NOT REACHED')
        return null
      }
      const parsed = parseMarketRead(CANNED_MARKET_READS[shape], keys)
      if (!parsed.ok) await fail(parsed.error)
      else
        await ctx.runMutation(internal.marketReads.finish, {
          readId: args.readId,
          read: parsed.read,
          stamp: {
            model: MARKET_READ_MODEL,
            inputTokens: 61_800,
            outputTokens: 3_100,
            searches: 8,
            cost: 0.24,
            paidBy: 'api',
          },
        })
      return null
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      await fail('NO KEY')
      return null
    }

    const usage: Usage = { input: 0, output: 0, searches: 0 }
    try {
      const client = new Anthropic()
      const messages: Array<Anthropic.MessageParam> = [
        {
          role: 'user',
          content: marketReadPrompt(
            job.facts,
            new Date().toISOString().slice(0, 10),
          ),
        },
      ]
      let response: Anthropic.Message | null = null
      for (let turn = 0; turn <= CONTINUES; turn++) {
        response = await client.messages.create({
          model: MARKET_READ_MODEL,
          max_tokens: 16000,
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: MARKET_READ_SCHEMA },
          },
          tools: [
            {
              type: 'web_search_20260209',
              name: 'web_search',
              max_uses: MAX_SEARCHES,
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
      const cost = readCost(usage)
      if (response === null || response.stop_reason === 'pause_turn') {
        await fail('TOO LONG', cost)
        return null
      }
      if (response.stop_reason === 'refusal') {
        await fail('DECLINED', cost)
        return null
      }
      const text = response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      const parsed = parseMarketRead(text, keys)
      if (!parsed.ok) {
        await fail(parsed.error, cost)
        return null
      }
      await ctx.runMutation(internal.marketReads.finish, {
        readId: args.readId,
        read: parsed.read,
        stamp: {
          model: MARKET_READ_MODEL,
          inputTokens: usage.input,
          outputTokens: usage.output,
          searches: usage.searches,
          cost,
          paidBy: 'api',
        },
      })
    } catch (error) {
      const cost = readCost(usage)
      if (error instanceof Anthropic.AuthenticationError)
        await fail('KEY REFUSED', cost)
      else if (error instanceof Anthropic.RateLimitError)
        await fail('BUSY OR LIMIT', cost)
      else if (error instanceof Anthropic.APIError)
        await fail(`ERROR ${error.status}`, cost)
      else await fail('NOT REACHED', cost)
    }
    return null
  },
})

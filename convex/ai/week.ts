'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import {
  CANNED_READS,
  WEEK_READ_MODEL,
  WEEK_READ_SCHEMA,
  parseWeekRead,
  weekReadPrompt,
} from '../../src/lib/weekRead'

/* The one place a week leaves for a model (R7, 15 Oct). Claude Haiku 5.5,
   like the Vault (his pick), on the same capped ANTHROPIC_API_KEY. It is
   given only the facts weekReads.run stored — the page's own numbers — and
   answers a verdict and four lines in the shape WEEK_READ_SCHEMA fixes.
   On the test backend (E2E=1) the canned read answers and nothing leaves.
   Every failure ends in `weekReads.fail`, so nothing stays "reading". */

export const readWeek = internalAction({
  args: { readId: v.id('weekReads') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (error: string) =>
      ctx.runMutation(internal.weekReads.fail, { readId: args.readId, error })

    const job = await ctx.runQuery(internal.weekReads.forRead, {
      readId: args.readId,
    })
    if (job === null) return null
    const keys = job.facts.map((f) => f.key)

    if (process.env.E2E === '1') {
      const canned = CANNED_READS[job.grill ? 'grill' : 'plain']
      const parsed = parseWeekRead(JSON.stringify(canned), keys)
      if (!parsed.ok) await fail(parsed.error)
      else
        await ctx.runMutation(internal.weekReads.finish, {
          readId: args.readId,
          ...parsed.read,
          inputTokens: 0,
          outputTokens: 0,
        })
      return null
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      await fail('No reader is set up yet (ANTHROPIC_API_KEY is missing).')
      return null
    }

    try {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: WEEK_READ_MODEL,
        max_tokens: 4000,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: WEEK_READ_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: weekReadPrompt(job.facts, job.grill, job.day),
          },
        ],
      })
      if (response.stop_reason === 'refusal') {
        await fail('The reader declined this week.')
        return null
      }
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
      const parsed = parseWeekRead(text, keys)
      if (!parsed.ok) {
        await fail(parsed.error)
        return null
      }
      await ctx.runMutation(internal.weekReads.finish, {
        readId: args.readId,
        ...parsed.read,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      })
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        await fail('The reader refused the key — check ANTHROPIC_API_KEY.')
      } else if (error instanceof Anthropic.RateLimitError) {
        await fail('The reader is busy or the spend limit is reached.')
      } else if (error instanceof Anthropic.APIError) {
        await fail(`The reader had a problem (${error.status}).`)
      } else {
        await fail('The reader could not be reached.')
      }
    }
    return null
  },
})

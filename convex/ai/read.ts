'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import {
  READING_MODEL,
  READING_SCHEMA,
  parseReading,
  readableKind,
  readingPrompt,
} from '../../src/lib/reading'

/* The one place a Vault sheet leaves for a model (R7a, 26 Sep). Claude
   Haiku 4.5, because his sheets are mostly scans and it reads the page
   itself; one call for the text, the summary, the conclusion and the
   words, in the shape READING_SCHEMA fixes. The key is ANTHROPIC_API_KEY in
   Convex's environment — a separate, capped Console workspace (his pick,
   so this can never spend Oreum's credits). It never reaches the browser.

   Every way this can go wrong ends in `vault.fail` with a sentence he can
   read, and the card offers Retry; nothing is left saying "reading…". */

export const readDocument = internalAction({
  args: { readingId: v.id('readings') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (error: string) =>
      ctx.runMutation(internal.vault.fail, { readingId: args.readingId, error })

    const job = await ctx.runQuery(internal.vault.forReading, {
      readingId: args.readingId,
    })
    if (job === null) return null

    if (!process.env.ANTHROPIC_API_KEY) {
      await fail('No reader is set up yet (ANTHROPIC_API_KEY is missing).')
      return null
    }
    const kind = readableKind(job.contentType)
    const blob = await ctx.storage.get(job.storageId)
    if (kind === null || blob === null) {
      await fail('The file could not be opened.')
      return null
    }
    const data = Buffer.from(await blob.arrayBuffer()).toString('base64')

    try {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: READING_MODEL,
        max_tokens: 16000,
        output_config: {
          format: { type: 'json_schema', schema: READING_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              kind.block === 'document'
                ? {
                    type: 'document',
                    source: {
                      type: 'base64',
                      media_type: kind.mediaType,
                      data,
                    },
                  }
                : {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: kind.mediaType,
                      data,
                    },
                  },
              { type: 'text', text: readingPrompt(job.language) },
            ],
          },
        ],
      })

      if (response.stop_reason === 'max_tokens') {
        await fail('The sheet had more on it than one reading can hold.')
        return null
      }
      if (response.stop_reason === 'refusal') {
        await fail('The reader declined this sheet.')
        return null
      }
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
      const parsed = parseReading(text)
      if (!parsed.ok) {
        await fail(parsed.error)
        return null
      }
      await ctx.runMutation(internal.vault.finish, {
        readingId: args.readingId,
        ...parsed.reading,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      })
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        await fail('The reader refused the key — check ANTHROPIC_API_KEY.')
      } else if (error instanceof Anthropic.RateLimitError) {
        await fail(
          'The reader is busy or the spend limit is reached — retry later.',
        )
      } else if (error instanceof Anthropic.BadRequestError) {
        await fail(`The reader could not take this file: ${error.message}`)
      } else if (error instanceof Anthropic.APIError) {
        await fail(`The reader had a problem (${error.status}) — retry.`)
      } else {
        await fail('The reader could not be reached — retry.')
      }
    }
    return null
  },
})

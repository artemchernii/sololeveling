'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { searchYahoo } from '../market'
import {
  IMPORT_MODEL,
  IMPORT_SCHEMA,
  importPrompt,
  parseImport,
} from '../../src/lib/market'
import type { Candidate } from '../../src/lib/market'

/* A broker screenshot, read once (Finances F4, 26 Sep): Artem, "make a
   screenshot of trade republic and read it with haiku > show what is read
   and me confirm ticker, my price and amount". The same reader and key as
   the Vault (convex/ai/read.ts). The rows are a proposal: each is matched to
   ticker candidates by ISIN, then by name, and nothing becomes a trade
   until he confirms it. */

type Media = 'image/png' | 'image/jpeg' | 'image/webp'

export const readScreenshots = internalAction({
  args: { importId: v.id('portfolioImports') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (error: string) =>
      ctx.runMutation(internal.invest.failImport, {
        importId: args.importId,
        error,
      })
    const job = await ctx.runQuery(internal.invest.forImport, {
      importId: args.importId,
    })
    if (job === null) return null
    if (!process.env.ANTHROPIC_API_KEY) {
      await fail('No reader is set up yet (ANTHROPIC_API_KEY is missing).')
      return null
    }

    const blocks: Array<Anthropic.ContentBlockParam> = []
    for (const file of job.files) {
      const blob = await ctx.storage.get(file.storageId)
      if (blob === null) {
        await fail('A screenshot could not be opened.')
        return null
      }
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.contentType as Media,
          data: Buffer.from(await blob.arrayBuffer()).toString('base64'),
        },
      })
    }
    if (blocks.length === 0) {
      await fail('There is no screenshot to read.')
      return null
    }

    let text: string
    try {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: IMPORT_MODEL,
        max_tokens: 8000,
        output_config: {
          format: { type: 'json_schema', schema: IMPORT_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              ...blocks,
              { type: 'text', text: importPrompt(blocks.length) },
            ],
          },
        ],
      })
      if (response.stop_reason === 'refusal') {
        await fail('The reader declined this screenshot.')
        return null
      }
      text = response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        await fail('The reader refused the key — check ANTHROPIC_API_KEY.')
      } else if (error instanceof Anthropic.RateLimitError) {
        await fail(
          'The reader is busy or the spend limit is reached — retry later.',
        )
      } else if (error instanceof Anthropic.APIError) {
        await fail(`The reader had a problem (${error.status}) — try again.`)
      } else {
        await fail('The reader could not be reached — try again.')
      }
      return null
    }

    const parsed = parseImport(text)
    if (!parsed.ok) {
      await fail(parsed.error)
      return null
    }

    /* Candidates by ISIN first — exact — then by name. A search that fails
       leaves the row with none, and he searches for it himself. */
    const rows = []
    for (const row of parsed.rows) {
      let candidates: Array<Candidate> = []
      try {
        if (row.isin) candidates = await searchYahoo(row.isin)
        if (candidates.length === 0) candidates = await searchYahoo(row.name)
      } catch {
        candidates = []
      }
      rows.push({ ...row, candidates: candidates.slice(0, 5) })
    }
    await ctx.runMutation(internal.invest.finishImport, {
      importId: args.importId,
      rows,
    })
    return null
  },
})

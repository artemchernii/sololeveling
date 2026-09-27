'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { priceEurNow, searchYahoo } from '../market'
import {
  INTAKE_MODEL,
  INTAKE_SCHEMA,
  intakePrompt,
  parseReading,
  preferClass,
  readableFile,
  searchableName,
} from '../../src/lib/intake'
import type { Candidate } from '../../src/lib/market'

/* The reader (Treasury, 27 Sep). One call to Claude Haiku 4.5 reads every
   file he dropped — a PDF statement, a CSV, screenshots — says what it is,
   and returns its rows in INTAKE_SCHEMA's shape. For holdings, each
   position is then matched to a ticker (the right share class — Alphabet
   (A) is GOOGL) and priced in euros today, so shares and cost can be
   worked out where the screen did not print them. Nothing is stored as a
   trade or a log here; intake.review and the confirms do that. The same
   key as the Vault: ANTHROPIC_API_KEY. */

export const read = internalAction({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (error: string) =>
      ctx.runMutation(internal.intake.fail, { intakeId: args.intakeId, error })
    const job = await ctx.runQuery(internal.intake.forReading, {
      intakeId: args.intakeId,
    })
    if (job === null) return null
    if (!process.env.ANTHROPIC_API_KEY) {
      await fail('No reader is set up yet (ANTHROPIC_API_KEY is missing).')
      return null
    }

    const blocks: Array<Anthropic.ContentBlockParam> = []
    for (const file of job.files) {
      const kind = readableFile(file.contentType)
      const blob = await ctx.storage.get(file.storageId)
      if (kind === null || blob === null) {
        await fail('A file could not be opened.')
        return null
      }
      const bytes = Buffer.from(await blob.arrayBuffer())
      if (kind.block === 'text') {
        blocks.push({
          type: 'text',
          text: `CSV file:\n${bytes.toString('utf8').slice(0, 200_000)}`,
        })
      } else if (kind.block === 'document') {
        blocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: kind.mediaType,
            data: bytes.toString('base64'),
          },
        })
      } else {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: kind.mediaType,
            data: bytes.toString('base64'),
          },
        })
      }
    }

    let text: string
    try {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: INTAKE_MODEL,
        max_tokens: 32000,
        output_config: {
          format: { type: 'json_schema', schema: INTAKE_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              ...blocks,
              {
                type: 'text',
                text: intakePrompt({
                  files: blocks.length,
                  today: new Date().toISOString().slice(0, 10),
                  accounts: job.accounts,
                }),
              },
            ],
          },
        ],
      })
      if (response.stop_reason === 'refusal') {
        await fail('The reader declined this file.')
        return null
      }
      if (response.stop_reason === 'max_tokens') {
        await fail(
          'There was more in it than one reading can hold — try a shorter period.',
        )
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
          'The reader is busy or the spend limit is reached — try later.',
        )
      } else if (error instanceof Anthropic.BadRequestError) {
        await fail(`The reader could not take this file: ${error.message}`)
      } else if (error instanceof Anthropic.APIError) {
        await fail(`The reader had a problem (${error.status}) — try again.`)
      } else {
        await fail('The reader could not be reached — try again.')
      }
      return null
    }

    const parsed = parseReading(text)
    if (!parsed.ok) {
      await fail(parsed.error)
      return null
    }

    const positions = []
    for (const p of parsed.positions) {
      let candidates: Array<Candidate> = []
      try {
        if (p.isin) candidates = await searchYahoo(p.isin)
        if (candidates.length === 0)
          candidates = await searchYahoo(searchableName(p.name))
      } catch {
        candidates = []
      }
      candidates = candidates.slice(0, 6)
      const preferred =
        candidates.length > 0 ? preferClass(p.name, candidates) : undefined
      let today: { priceEur: number; asOf: number } | null = null
      if (preferred !== undefined && preferred >= 0) {
        try {
          today = await priceEurNow(candidates[preferred].symbol)
        } catch {
          today = null
        }
      }
      positions.push({
        ...p,
        candidates,
        preferred,
        todayPriceEur: today?.priceEur,
        todayAsOf: today?.asOf,
      })
    }

    await ctx.runMutation(internal.intake.finish, {
      intakeId: args.intakeId,
      kind: parsed.kind,
      title: parsed.title,
      institution: parsed.institution,
      transactions:
        parsed.kind === 'transactions' ? parsed.transactions : undefined,
      positions: parsed.kind === 'holdings' ? positions : undefined,
      balance: parsed.balance
        ? {
            currency: parsed.currency ?? 'EUR',
            value: parsed.balance.value,
            asOf: parsed.balance.asOf,
          }
        : undefined,
      cashEur: parsed.cashEur,
      totalEur: parsed.totalEur,
    })
    return null
  },
})

'use node'

import Anthropic from '@anthropic-ai/sdk'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { backfillRates, priceEurNow, searchYahoo } from '../market'
import { metalHoldings, metalsTitle } from '../../src/lib/metals'
import {
  INTAKE_MODEL,
  INTAKE_MODEL_NAME,
  INTAKE_SCHEMA,
  intakePrompt,
  fitByPrice,
  settleFrozen,
  matchAccount,
  parseReading,
  partialReading,
  preferClass,
  readableFile,
  readingCost,
  searchableName,
  splitStatement,
} from '../../src/lib/intake'
import type { ReadTrade, ReadTransaction } from '../../src/lib/intake'
import { headerKey, parseCsv } from '../../src/lib/csv'
import {
  LAYOUT_SCHEMA,
  applyLayout,
  csvTitle,
  layoutPrompt,
  parseLayout,
  skippedNote,
} from '../../src/lib/csvLayout'
import type { CsvLayout, CsvReading } from '../../src/lib/csvLayout'
import { productIn } from '../../src/lib/institutions'
import { UNPRICED } from '../../src/lib/market'
import type { Candidate } from '../../src/lib/market'

/* The reader (Treasury, 27 Sep). What he dropped becomes rows he checks.
   A PDF or a screenshot goes to Claude Haiku 4.5, streamed, and what it
   has found so far is written as it arrives (intake.progress) so the
   screen shows the bank, the rows and the balance landing instead of
   "Reading…". A CSV is read in code: the model only says which column is
   which, and that map is remembered for the next export. Every reading
   records what it cost. Nothing is stored as money here; intake.review and
   the confirms do that. Same key as the Vault: ANTHROPIC_API_KEY. */

/** Rows in one intake row; a longer trade history goes to intakeTrades. */
const TRADES_INLINE = 300
const MAX_TRANSACTIONS = 2000
const FLUSH_MS = 1200
const BATCH = 400

type Job = {
  ownerId: string
  files: Array<{ storageId: Id<'_storage'>; contentType: string }>
  names: Array<string>
  accounts: Array<{ name: string; domain?: string }>
  hint: string | null
}

class ReadFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

export const read = internalAction({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.intake.forReading, {
      intakeId: args.intakeId,
    })
    if (job === null) return null
    await ctx.runMutation(internal.intake.clearHistory, {
      intakeId: args.intakeId,
    })
    const spent = { usd: 0 }
    try {
      const allCsv =
        job.files.length > 0 &&
        job.files.every(
          (f, i) => readableFile(f.contentType, job.names[i])?.block === 'text',
        )
      if (allCsv) await readCsv(ctx, args.intakeId, job, spent)
      else await readWithModel(ctx, args.intakeId, job, spent)
    } catch (error) {
      const failure = asFailure(error)
      await ctx.runMutation(internal.intake.fail, {
        intakeId: args.intakeId,
        error: failure.message,
        retryable: failure.retryable,
        costUsd: spent.usd,
      })
    }
    return null
  },
})

/* Every way a read can go wrong, said the way he would want it said, and
   whether a second try could help. */
function asFailure(error: unknown): ReadFailure {
  if (error instanceof ReadFailure) return error
  if (error instanceof Anthropic.AuthenticationError)
    return new ReadFailure(
      'The reader refused the key — check ANTHROPIC_API_KEY.',
      false,
    )
  if (error instanceof Anthropic.PermissionDeniedError)
    return new ReadFailure(
      'The reader’s spend limit is reached — raise it in the Anthropic console.',
      false,
    )
  if (error instanceof Anthropic.RateLimitError)
    return new ReadFailure(
      'The reader is busy, or its spend limit is reached — try again in a minute.',
      true,
    )
  if (error instanceof Anthropic.BadRequestError)
    return new ReadFailure(
      `The reader could not take this file: ${error.message.slice(0, 160)}`,
      false,
    )
  if (error instanceof Anthropic.APIConnectionError)
    return new ReadFailure(
      'The reader could not be reached — check the connection and try again.',
      true,
    )
  if (error instanceof Anthropic.APIError)
    return new ReadFailure(
      `The reader had a problem on its side (${error.status ?? 'no status'}) — try again.`,
      true,
    )
  console.error('intake read failed', error)
  return new ReadFailure(
    `Something broke while reading — try again.${error instanceof Error ? ` (${error.message.slice(0, 120)})` : ''}`,
    true,
  )
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new ReadFailure(
      'No reader is set up yet (ANTHROPIC_API_KEY is missing).',
      false,
    )
  return new Anthropic()
}

/* ---- PDFs and screenshots: the model reads every row ------------------- */

async function readWithModel(
  ctx: ActionCtx,
  intakeId: Id<'intakes'>,
  job: Job,
  spent: { usd: number },
) {
  const blocks: Array<Anthropic.ContentBlockParam> = []
  for (const [i, file] of job.files.entries()) {
    const kind = readableFile(file.contentType, job.names[i])
    const blob = await ctx.storage.get(file.storageId)
    if (kind === null || blob === null)
      throw new ReadFailure(
        `${job.names[i] ?? 'A file'} could not be opened — drop it again.`,
        false,
      )
    const bytes = Buffer.from(await blob.arrayBuffer())
    if (kind.block === 'text') {
      /* A CSV among PDFs or screenshots: whole, never cut. */
      blocks.push({
        type: 'text',
        text: `CSV file:\n${bytes.toString('utf8')}`,
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

  const sent = { tx: 0, trades: 0, positions: 0, meta: '' }
  let text = ''
  let lastFlush = 0
  let flushing: Promise<void> = Promise.resolve()

  /* What it has written so far → the screen. Only new rows are sent. */
  const flush = async () => {
    const part = partialReading(text)
    const meta = [part.institution, part.title, part.accountTail].join('|')
    const tx = part.transactions.slice(sent.tx)
    const trades = part.trades.slice(sent.trades)
    const positions = part.positions.slice(sent.positions)
    if (
      meta === sent.meta &&
      tx.length + trades.length + positions.length === 0 &&
      !part.balance
    )
      return
    sent.tx += tx.length
    sent.trades += trades.length
    sent.positions += positions.length
    sent.meta = meta
    await ctx.runMutation(internal.intake.progress, {
      intakeId,
      stage: sent.tx + sent.trades + sent.positions > 0 ? 'rows' : 'opening',
      kind: part.kind,
      institution: part.institution,
      title: part.title,
      accountTail: part.accountTail,
      balance: part.balance
        ? { ...part.balance, currency: part.currency ?? 'EUR' }
        : undefined,
      rows: tx.map((t) => ({
        occurredAt: t.occurredAt,
        merchant: t.merchant,
        amount: t.amount,
        currency: t.currency,
        self: t.self,
      })),
      items: [
        ...trades.map((t) => tradeItem(t)),
        ...positions.map((p) => ({
          occurredAt: Date.now(),
          label: p.name,
          amount: p.valueEur ?? 0,
          currency: 'EUR',
        })),
      ],
    })
  }

  /* Streamed: a long statement can take minutes, and the SDK refuses a
     plain request that could run past ten. */
  const stream = client().messages.stream({
    model: INTAKE_MODEL,
    max_tokens: 32000,
    output_config: { format: { type: 'json_schema', schema: INTAKE_SCHEMA } },
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
              accounts: job.accounts.map((a) => a.name),
              hint: job.hint,
            }),
          },
        ],
      },
    ],
  })
  stream.on('text', (delta) => {
    text += delta
    if (Date.now() - lastFlush < FLUSH_MS) return
    lastFlush = Date.now()
    flushing = flushing.then(flush).catch(() => undefined)
  })
  const response = await stream.finalMessage()
  await flushing
  spent.usd += readingCost(response.usage)

  if (response.stop_reason === 'refusal')
    throw new ReadFailure('The reader declined this file.', false)
  if (response.stop_reason === 'max_tokens')
    throw new ReadFailure(
      'There was more in it than one reading can hold. Export it as a CSV (read in seconds, any length), or split it into shorter periods.',
      false,
    )
  text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')

  const parsed = parseReading(text)
  if (!parsed.ok)
    throw new ReadFailure(parsed.error, parsed.error.includes('shape'))

  /* A broker's cash statement prints its orders as rows: they are
     trades inside the account, not money leaving it. */
  const split =
    parsed.kind === 'transactions'
      ? splitStatement(parsed.transactions)
      : { transactions: parsed.transactions, trades: parsed.trades }
  const readTrades = parsed.kind === 'holdings' ? [] : split.trades
  if (readTrades.length > 0 || parsed.positions.length > 0)
    await ctx.runMutation(internal.intake.progress, {
      intakeId,
      stage: 'tickers',
    })
  const tickers = new Tickers()
  const trades = []
  for (const t of readTrades)
    trades.push({
      ...t,
      ...(t.crypto ? coin(t.name) : await tickers.find(t.name, t.isin)),
    })
  /* A crypto statement's closing amounts: its coins, as the trades name
     them. */
  const coins = new Set(
    readTrades.filter((t) => t.crypto).map((t) => coinSymbol(t.name)),
  )

  /* Dollar trades from years back are priced at their own day's rate
     (4 Oct): the stored rates are filled back to the oldest trade. */
  const oldest = new Map<string, number>()
  for (const t of readTrades)
    if (t.currency !== 'EUR')
      oldest.set(
        t.currency,
        Math.min(oldest.get(t.currency) ?? Infinity, t.occurredAt),
      )
  for (const [currency, from] of oldest)
    await backfillRates(ctx, job.ownerId, currency, from)

  const positions = []
  const frozen: Array<{ at: number; candidate: Candidate; priceEur: number }> =
    []
  for (const { symbol, ...p } of parsed.positions) {
    if (parsed.kind === 'trades') {
      /* A crypto statement's closing amount: the coin, at today's price. */
      const sym = coinSymbol(symbol || p.name)
      if (!coins.has(sym)) continue
      const c = coin(sym)
      const today = await tickers.price(c.candidates[0].symbol)
      positions.push({
        ...p,
        name: sym,
        candidates: c.candidates,
        preferred: 0,
        todayPriceEur: today?.priceEur,
        todayAsOf: today?.asOf,
      })
      continue
    }
    let { candidates, preferred } = await tickers.find(p.name, p.isin, symbol)
    let today: { priceEur: number; asOf: number } | null = null
    const printedEur =
      p.valueEur !== undefined && p.shares !== undefined && p.shares > 0
        ? p.valueEur / p.shares
        : undefined
    if (printedEur !== undefined) {
      /* The screen says what one share is worth: the listing must agree
         (fitByPrice). The printed ticker's own lines first, then by name
         — "SHLD" alone is a US fund, iShares' is SHLD.L (3 Oct). */
      const fit = async (list: Array<Candidate>) => {
        const prices = await Promise.all(
          list.map((c) => tickers.price(c.symbol)),
        )
        const i = fitByPrice(
          printedEur,
          list,
          prices.map((x) => x?.priceEur),
          symbol,
        )
        return i >= 0 ? { list, i, today: prices[i] } : null
      }
      const found =
        (await fit(candidates)) ??
        (await fit(await tickers.byName(p.name, candidates)))
      if (found) {
        candidates = found.list
        preferred = found.i
        today = found.today
      } else if (symbol && !(await tickers.listed(symbol, candidates))) {
        /* The printed ticker has no price anywhere — frozen, if the market
           answered for the rest of the screen (decided below). */
        frozen.push({
          at: positions.length,
          candidate: {
            symbol,
            name: p.name,
            exchange: parsed.institution ?? 'Broker',
            type: UNPRICED,
          },
          priceEur: printedEur,
        })
        preferred = -1
      } else {
        /* No listing fits: asked, not filed under a stranger. */
        preferred = -1
      }
    } else if (preferred !== undefined && preferred >= 0) {
      today = await tickers.price(candidates[preferred].symbol)
    }
    positions.push({
      ...p,
      candidates,
      preferred,
      todayPriceEur: today?.priceEur,
      todayAsOf: today?.asOf,
    })
  }

  settleFrozen(positions, frozen, Date.now())

  await ctx.runMutation(internal.intake.finish, {
    intakeId,
    kind: parsed.kind,
    title: parsed.title,
    institution: parsed.institution,
    accountTail: parsed.accountTail,
    holderName: parsed.holderName,
    transactions:
      parsed.kind === 'transactions' ? split.transactions : undefined,
    positions:
      parsed.kind === 'holdings' ||
      (parsed.kind === 'trades' && positions.length > 0)
        ? positions
        : undefined,
    trades:
      parsed.kind === 'trades' ||
      (parsed.kind === 'transactions' && trades.length > 0)
        ? trades
        : undefined,
    balance: parsed.balance
      ? {
          currency: parsed.currency ?? 'EUR',
          value: parsed.balance.value,
          asOf: parsed.balance.asOf,
        }
      : undefined,
    cashEur: parsed.cashEur,
    totalEur: parsed.totalEur,
    costUsd: spent.usd,
  })
}

/* ---- CSVs: read in code ------------------------------------------------ */

async function readCsv(
  ctx: ActionCtx,
  intakeId: Id<'intakes'>,
  job: Job,
  spent: { usd: number },
) {
  let usedModel = false
  const readings: Array<{ layout: CsvLayout; reading: CsvReading }> = []

  for (const [i, file] of job.files.entries()) {
    const name = job.names[i] ?? 'That CSV'
    const blob = await ctx.storage.get(file.storageId)
    if (blob === null)
      throw new ReadFailure(
        `${name} could not be opened — drop it again.`,
        false,
      )
    const rows = parseCsv(await blob.text())
    if (rows.length < 2)
      throw new ReadFailure(`${name} has no rows in it.`, false)
    const [header, ...body] = rows
    const key = headerKey(header)

    let layout = await ctx.runQuery(internal.intake.layoutFor, {
      ownerId: job.ownerId,
      headerKey: key,
    })
    let fresh = false
    if (layout === null) {
      await ctx.runMutation(internal.intake.progress, {
        intakeId,
        stage: 'columns',
      })
      const response = await client().messages.create({
        model: INTAKE_MODEL,
        max_tokens: 4000,
        output_config: {
          format: { type: 'json_schema', schema: LAYOUT_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: layoutPrompt({
              header,
              rows: body,
              total: body.length,
              fileName: name,
            }),
          },
        ],
      })
      spent.usd += readingCost(response.usage)
      usedModel = true
      if (response.stop_reason === 'refusal')
        throw new ReadFailure('The reader declined this file.', false)
      const parsed = parseLayout(
        response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
        header.length,
      )
      if (!parsed.ok) throw new ReadFailure(parsed.error, false)
      layout = parsed.layout
      fresh = true
    }
    const reading = applyLayout(body, layout)
    const found =
      reading.transactions.length +
      reading.trades.length +
      reading.splits.length
    if (found === 0)
      throw new ReadFailure(
        layout.kind === 'trades'
          ? `No buys or sells were found in ${name}.`
          : `No transactions were found in ${name}.`,
        false,
      )
    /* Only a map that read something is worth remembering. */
    if (fresh)
      await ctx.runMutation(internal.intake.rememberLayout, {
        ownerId: job.ownerId,
        headerKey: key,
        layout,
      })
    readings.push({ layout, reading })
  }

  const kinds = new Set(readings.map((r) => r.layout.kind))
  if (kinds.size > 1)
    throw new ReadFailure(
      'Those CSVs are a statement and a trade history — drop them one at a time.',
      false,
    )
  const first = readings[0]
  const institution = first.layout.institution
  const accountTail = first.layout.accountTail
  const merged: CsvReading = {
    kind: first.layout.kind,
    transactions: readings.flatMap((r) => r.reading.transactions),
    trades: readings.flatMap((r) => r.reading.trades),
    splits: readings.flatMap((r) => r.reading.splits),
    skipped: {},
    balance: readings
      .map((r) => r.reading.balance)
      .filter((b) => b !== undefined)
      .sort((a, b) => b.asOf - a.asOf)[0],
    closings: Object.fromEntries(
      readings
        .flatMap((r) => Object.entries(r.reading.closings))
        .sort((x, y) => x[1].asOf - y[1].asOf),
    ),
    first: Math.min(...readings.map((r) => r.reading.first ?? Infinity)),
    last: Math.max(...readings.map((r) => r.reading.last ?? -Infinity)),
    tickers: 0,
  }
  for (const r of readings)
    for (const [why, n] of Object.entries(r.reading.skipped))
      merged.skipped[why] = (merged.skipped[why] ?? 0) + n
  merged.tickers = new Set([
    ...merged.trades.map((t) => t.name),
    ...merged.splits.map((t) => t.name),
  ]).size
  const title = csvTitle(institution, merged)
  const note = skippedNote(merged.skipped)
  const model = usedModel ? INTAKE_MODEL_NAME : 'its remembered columns'
  await ctx.runMutation(internal.intake.progress, {
    intakeId,
    stage: 'rows',
    kind: merged.kind,
    institution,
    title,
    accountTail,
  })

  /* Gold and silver (9 Oct): ounces, not money — what he holds, through
     the holdings check like a broker's screen. */
  const metals = merged.kind === 'transactions' ? metalHoldings(merged) : null
  if (metals !== null) {
    await ctx.runMutation(internal.intake.finish, {
      intakeId,
      kind: 'holdings',
      title: `${institution ?? 'Revolut'} · ${metalsTitle(metals.map((m) => m.name))}`,
      institution: institution ?? 'Revolut',
      accountTail,
      positions: metals.map((m) => ({
        name: m.name,
        shares: m.shares,
        preferred: 0,
        candidates: [m.candidate],
      })),
      costUsd: spent.usd,
      note,
      model,
    })
    return
  }

  if (merged.kind === 'transactions') {
    if (merged.transactions.length > MAX_TRANSACTIONS)
      throw new ReadFailure(
        `That CSV has ${merged.transactions.length} transactions — export a year or less at a time (up to ${MAX_TRANSACTIONS}).`,
        false,
      )
    const transactions = merged.transactions.map((t) =>
      ownMoney(t, job.accounts),
    )
    for (let i = 0; i < transactions.length; i += BATCH)
      await ctx.runMutation(internal.intake.progress, {
        intakeId,
        rows: transactions.slice(i, i + BATCH).map((t) => ({
          occurredAt: t.occurredAt,
          merchant: t.merchant,
          amount: t.amount,
          currency: t.currency,
          self: t.self,
        })),
      })
    if (merged.balance)
      await ctx.runMutation(internal.intake.progress, {
        intakeId,
        balance: merged.balance,
      })
    await ctx.runMutation(internal.intake.finish, {
      intakeId,
      kind: 'transactions',
      title,
      institution,
      accountTail,
      transactions,
      balance: merged.balance,
      costUsd: spent.usd,
      note,
      model,
    })
    return
  }

  /* Trades. A short list goes through the usual check, each name matched
     to a ticker; a whole history (his: 3,595 trades since 2020) is kept
     row by row for its own review. */
  if (merged.trades.length <= TRADES_INLINE && merged.splits.length === 0) {
    await ctx.runMutation(internal.intake.progress, {
      intakeId,
      stage: 'tickers',
      items: merged.trades.map(tradeItem),
    })
    const tickers = new Tickers()
    const trades = []
    for (const t of merged.trades)
      trades.push({ ...t, ...(await tickers.find(t.name, t.isin)) })
    await ctx.runMutation(internal.intake.finish, {
      intakeId,
      kind: 'trades',
      title,
      institution,
      accountTail,
      trades,
      costUsd: spent.usd,
      note,
      model,
    })
    return
  }

  const rows = [
    ...merged.trades.map((t) => ({
      occurredAt: t.occurredAt,
      name: t.name,
      isin: t.isin,
      side: t.side,
      shares: t.shares,
      price: t.price,
      currency: t.currency,
    })),
    ...merged.splits.map((s) => ({
      occurredAt: s.occurredAt,
      name: s.name,
      side: 'split' as const,
      shares: s.shares,
      price: 0,
      currency: 'EUR',
    })),
  ].sort((a, b) => a.occurredAt - b.occurredAt)
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await ctx.runMutation(internal.intake.storeHistory, {
      intakeId,
      trades: batch,
    })
    await ctx.runMutation(internal.intake.progress, {
      intakeId,
      items: batch.map((t) =>
        t.side === 'split'
          ? {
              occurredAt: t.occurredAt,
              label: `split ${t.name}`,
              amount: 0,
              currency: 'EUR',
            }
          : tradeItem(t),
      ),
    })
  }
  /* Each name matched to a ticker once, and the dollar rates stored back
     to the first trade — so applying it needs no fetch (9 Oct). */
  await ctx.runMutation(internal.intake.progress, {
    intakeId,
    stage: 'tickers',
  })
  const tickers = new Tickers()
  const names = new Map<string, string | undefined>()
  for (const r of rows)
    if (!names.get(r.name)) names.set(r.name, 'isin' in r ? r.isin : undefined)
  const historyFound = []
  for (const [name, isin] of names)
    historyFound.push({
      name,
      isin,
      ...(await tickers.find(name, isin, TICKER.test(name) ? name : undefined)),
    })
  const oldest = new Map<string, number>()
  for (const r of rows)
    if (r.currency !== 'EUR' && r.side !== 'split')
      oldest.set(
        r.currency,
        Math.min(oldest.get(r.currency) ?? Infinity, r.occurredAt),
      )
  for (const [currency, from] of oldest)
    await backfillRates(ctx, job.ownerId, currency, from)
  await ctx.runMutation(internal.intake.finish, {
    intakeId,
    kind: 'trades',
    title,
    institution,
    accountTail,
    trades: [],
    costUsd: spent.usd,
    note,
    model,
    historyTrades: rows.length,
    historyTickers: merged.tickers,
    historyFound,
  })
}

function tradeItem(
  t: Pick<
    ReadTrade,
    'occurredAt' | 'name' | 'side' | 'shares' | 'price' | 'currency'
  >,
) {
  return {
    occurredAt: t.occurredAt,
    label: `${t.side} ${t.name}`,
    amount:
      (Math.round(t.shares * t.price * 100) / 100) *
      (t.side === 'buy' ? -1 : 1),
    currency: t.currency,
  }
}

/* A CSV row to or from one of his accounts, or a broker, is his own money
   moving — the model marked these in a PDF; here the names do. */
function ownMoney(
  t: ReadTransaction,
  accounts: ReadonlyArray<{ name: string; domain?: string }>,
): ReadTransaction {
  if (t.self) return t
  const who = t.raw.replace(/^(to|from|transfer to|transfer from)\s+/i, '')
  const own =
    matchAccount(
      who,
      accounts.map((a, i) => ({
        id: String(i),
        name: a.name,
        domain: a.domain,
      })),
    ) !== null ||
    (productIn(who)?.kinds.includes('broker') ?? false)
  return own ? { ...t, self: true, counterparty: t.raw.slice(0, 80) } : t
}

/** Split an already-read statement's orders out in place, tickers and all
    — for readings kept from before splitStatement (27 Sep). */
export const resplit = internalAction({
  args: { intakeId: v.id('intakes') },
  returns: v.object({ trades: v.number() }),
  handler: async (ctx, args) => {
    const rows = await ctx.runQuery(internal.intake.unsplit, args)
    if (rows === null) return { trades: 0 }
    const split = splitStatement(rows)
    const tickers = new Tickers()
    const trades = []
    for (const t of split.trades)
      trades.push({ ...t, ...(await tickers.find(t.name, t.isin)) })
    await ctx.runMutation(internal.intake.applySplit, {
      intakeId: args.intakeId,
      transactions: split.transactions,
      trades,
    })
    return { trades: trades.length }
  },
})

/** "SOL", "Solana (SOL)" → "SOL". */
function coinSymbol(name: string): string {
  const inBrackets = /\(([A-Za-z0-9]{2,10})\)/.exec(name)?.[1]
  return (inBrackets ?? name).trim().toUpperCase().split(/\s+/)[0]
}

/* A coin is its Yahoo pair in euros, found without a search: a name
   search for "SOL" answers with shares called Sol. */
function coin(name: string) {
  const sym = coinSymbol(name)
  return {
    candidates: [
      {
        symbol: `${sym}-EUR`,
        name: sym,
        exchange: 'CCC',
        type: 'CRYPTOCURRENCY',
      },
    ],
    preferred: 0,
  }
}

/* A name as the broker prints it → ticker candidates, and which one is the
   right share class. Once per name: a trade history repeats them. */
/* A ticker as a trading CSV prints it: "TSLA", "BRK.B". */
const TICKER = /^[A-Z][A-Z0-9.]{0,7}$/

class Tickers {
  private found = new Map<
    string,
    { candidates: Array<Candidate>; preferred?: number }
  >()
  async find(name: string, isin?: string, symbol?: string) {
    const key = isin ?? symbol ?? name
    const known = this.found.get(key)
    if (known) return known
    let candidates: Array<Candidate> = []
    /* A share or a fund: an ISIN search can come back with a coin or a
       future ("NOW-USD.SW" for Alphabet, 27 Sep) — then ask by name. */
    const listed = (c: Array<Candidate>) =>
      c.filter((x) => x.type === 'EQUITY' || x.type === 'ETF')
    try {
      if (isin) candidates = listed(await searchYahoo(isin))
      /* The ticker the screen printed (Trading 212's "7.36 IGLN"): its own
         listings first — a name search for "iShares Physical Gold" found
         an American OTC line (3 Oct). */
      if (candidates.length === 0 && symbol) {
        const base = symbol.split('.')[0]
        candidates = listed(await searchYahoo(symbol)).filter(
          (c) => c.symbol.split('.')[0] === base,
        )
      }
      if (candidates.length === 0)
        candidates = await searchYahoo(searchableName(name))
    } catch {
      candidates = []
    }
    candidates = candidates.slice(0, 6)
    const result = {
      candidates,
      preferred:
        candidates.length > 0 ? preferClass(name, candidates) : undefined,
    }
    this.found.set(key, result)
    return result
  }

  /** Listings a name search finds that `had` does not already hold. */
  async byName(name: string, had: ReadonlyArray<Candidate>) {
    let found: Array<Candidate> = []
    try {
      found = await searchYahoo(searchableName(name))
    } catch {
      found = []
    }
    const seen = new Set(had.map((c) => c.symbol))
    return found
      .filter((c) => c.type === 'EQUITY' || c.type === 'ETF')
      .filter((c) => !seen.has(c.symbol))
      .slice(0, 6)
  }

  /** Whether any of the ticker's own lines has a price at all. */
  async listed(symbol: string, had: ReadonlyArray<Candidate>) {
    const base = symbol.split('.')[0].toUpperCase()
    for (const c of had)
      if (
        c.symbol.split('.')[0].toUpperCase() === base &&
        (await this.price(c.symbol)) !== null
      )
        return true
    return (await this.price(symbol)) !== null
  }

  private prices = new Map<string, { priceEur: number; asOf: number } | null>()
  async price(symbol: string) {
    if (this.prices.has(symbol)) return this.prices.get(symbol) ?? null
    let p: { priceEur: number; asOf: number } | null
    try {
      p = await priceEurNow(symbol)
    } catch {
      p = null
    }
    this.prices.set(symbol, p)
    return p
  }
}

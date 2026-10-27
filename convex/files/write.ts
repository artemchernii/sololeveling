import { DAY_MS, MAX_TRADES, keepUntil, sourceOf } from './shared'
import { learnTails, openSide } from './review'
import { costPrice } from '../../src/lib/tradeCost'
import { ConvexError } from 'convex/values'
import {
  balanceKey,
  hasBrokerCash,
  ownedAccount,
  writeBalance,
} from '../accounts'
import { movedSince } from '../reads/moves'
import { syncLedgers } from '../ledgers'
import { checkTrade, upsertInstrument } from '../invest'
import { landedCheck, pullBackAhead } from '../rowBalance'
import { euroRateAt, writeTransfer } from '../money'
import { sharesIn } from '../../src/lib/crypto'
import { heldCost } from '../../src/lib/holdings'
import { applyRow } from '../transferMatch'
import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { UNPRICED, screenSource, tickerBase } from '../../src/lib/market'
import type { Candidate } from '../../src/lib/market'
import { merchantKey, sameCompany } from '../../src/lib/intake'
import { otherTails, ownTail } from '../../src/lib/otherSide'

/* What a confirmed file writes: its transactions, holdings, trades and
   closing balance. Helpers for the mutations in intake.ts. */

export type ConfirmRow = {
  index: number
  kind: 'spend' | 'income' | 'move'
  category?: string
  otherAccountId?: Id<'accounts'>
  recurringId?: Id<'recurring'>
}

/* Writes the rows he kept from one statement, its orders and balance —
   shared by the single-file confirm and a batch's apply. */
export async function writeTransactions(
  ctx: MutationCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  account: Doc<'accounts'>,
  {
    rows,
    keepBalance,
    dayStart,
    pairs,
  }: {
    rows: ReadonlyArray<ConfirmRow>
    keepBalance: boolean
    dayStart: number
    /** Rows the check matched to a transfer: row → its other side. */
    pairs?: ReadonlyMap<number, string>
  },
) {
  const read = intake.transactions ?? []
  await pullBackAhead(ctx, ownerId, account._id, dayStart)
  /* What saving each matched row will do, before the balance is worked
     out: a row the account already has is not counted, its fee is. */
  const here = new Set<number>()
  let feeCents = 0
  for (const row of rows) {
    const sideId = pairs?.get(row.index)
    const r = read.at(row.index)
    if (sideId === undefined || r === undefined || r.pending) continue
    const plan = await applyRow(ctx, ownerId, {
      account,
      intakeId: intake._id,
      row: r,
      sideId,
      dry: true,
    })
    if (plan?.did !== 'skipped') continue
    here.add(row.index)
    feeCents += plan.feeCents
  }
  /* Before a row is written: what the account held, for the landed card. */
  const landed = await landedCheck(
    ctx,
    ownerId,
    account,
    intake,
    new Set(rows.map((r) => r.index).filter((i) => !here.has(i))),
    keepBalance,
    feeCents,
  )
  const seen = new Set<number>()
  let written = 0
  for (const row of rows) {
    const r = read[row.index] as (typeof read)[number] | undefined
    if (r === undefined || seen.has(row.index)) continue
    seen.add(row.index)
    if (r.pending) continue
    const sideId = pairs?.get(row.index)
    if (sideId !== undefined) {
      const did = await applyRow(ctx, ownerId, {
        account,
        intakeId: intake._id,
        row: r,
        sideId,
      })
      if (did !== null) {
        if (did.did === 'written') written++
        continue
      }
    }
    if (row.otherAccountId) await ownedAccount(ctx, ownerId, row.otherAccountId)
    if (row.recurringId) {
      const bill = await ctx.db.get(row.recurringId)
      if (bill === null || bill.ownerId !== ownerId)
        throw new Error('No such bill')
    }
    const category = row.category?.trim().toLowerCase() || undefined
    if (category && category.length > 24)
      throw new ConvexError('That category is too long.')
    const base = {
      ownerId,
      area: 'money',
      occurredAt: r.occurredAt,
      unit: r.currency.toLowerCase(),
      text: r.merchant,
      accountId: account._id,
    }
    if (row.kind === 'move') {
      const other = row.otherAccountId
        ? await ownedAccount(ctx, ownerId, row.otherAccountId)
        : null
      /* Answer once: the ending printed for the other side is his
         account's now, so the next statement lands it by itself. */
      if (other !== null && other._id !== account._id) {
        await learnTails(
          ctx,
          other,
          otherTails(`${r.counterparty ?? ''} ${r.raw}`),
        )
      }
      /* Both sides, unless the other account already has this transfer
         (its own statement came first) — then only this side, paired to
         it. An account that does not hold the currency gets no side. */
      const waiting =
        other === null || other._id === account._id
          ? null
          : await openSide(ctx, ownerId, other._id, -r.amount, r.occurredAt)
      /* A side that did not know where it came from (a Trading 212
         deposit read from Trading 212, 18 Oct) learns it here. */
      if (waiting !== null && waiting.meta?.otherAccountId === undefined)
        await ctx.db.patch(waiting._id, {
          meta: { ...waiting.meta, otherAccountId: account._id },
        })
      if (
        other !== null &&
        other._id !== account._id &&
        waiting === null &&
        other.currencies.includes(r.currency)
      ) {
        await writeTransfer(ctx, ownerId, {
          from: r.amount < 0 ? account : other,
          to: r.amount < 0 ? other : account,
          amount: Math.abs(r.amount),
          currency: r.currency,
          occurredAt: r.occurredAt,
          text: r.merchant,
          raw: r.raw,
          intakeId: intake._id,
        })
      } else {
        /* Signed: out of this account is negative. */
        await ctx.db.insert('logs', {
          ...base,
          kind: 'move',
          value: r.amount,
          meta: {
            merchant: r.merchant,
            raw: r.raw,
            intakeId: intake._id,
            otherAccountId: row.otherAccountId,
            pairOf: waiting?._id,
          },
        })
      }
    } else {
      await ctx.db.insert('logs', {
        ...base,
        kind: row.kind === 'income' ? 'income' : 'expense',
        value: Math.abs(r.amount),
        meta: {
          merchant: r.merchant,
          raw: r.raw,
          intakeId: intake._id,
          category,
          recurringId: row.recurringId,
        },
      })
      if (row.kind === 'spend' && category) {
        const key = merchantKey(r.merchant)
        const rule = await ctx.db
          .query('merchantRules')
          .withIndex('by_owner_key', (q) =>
            q.eq('ownerId', ownerId).eq('key', key),
          )
          .first()
        if (rule === null) {
          await ctx.db.insert('merchantRules', {
            ownerId,
            key,
            category,
            updatedAt: Date.now(),
          })
        } else if (rule.category !== category) {
          await ctx.db.patch(rule._id, { category, updatedAt: Date.now() })
        }
      }
    }
    written++
  }
  /* The orders a broker's cash statement printed (splitStatement):
     into its ledger, on the ticker the reader matched. One with no
     ticker found is left out and said. */
  let trades = { written: 0, skipped: 0, noTicker: 0 }
  const orders = intake.trades ?? []
  if (orders.length > 0) {
    if (!account.kinds.includes('broker')) {
      throw new ConvexError(
        `${account.name} is not a broker — these shares were bought in one.`,
      )
    }
    const items = orders.flatMap((t, index) => {
      const c = t.candidates.at(
        t.preferred !== undefined && t.preferred >= 0 ? t.preferred : 0,
      )
      return c ? [{ index, trade: t, candidate: c }] : []
    })
    trades = {
      ...(await writeTrades(ctx, ownerId, account, intake._id, items)),
      noTicker: orders.length - items.length,
    }
  }
  if (keepBalance && intake.balance) {
    /* A statement's balance is true at the end of its closing day. Its
       day is noon UTC; 18:00 UTC is still that day from Lisbon to New
       York (27 Sep: +12h put Aug 31 into Sep 1 in Lisbon). */
    await writeBalance(
      ctx,
      ownerId,
      account,
      intake.balance.currency,
      intake.balance.value,
      dayStart,
      intake.balance.asOf + 6 * 3_600_000,
      sourceOf(intake),
      'free',
      read
        .filter((r) => r.pending && r.currency === intake.balance?.currency)
        .reduce((t, r) => t + r.amount, 0),
      intake._id,
      read
        .filter((r) => r.pending && r.currency === intake.balance?.currency)
        .map((r) => ({
          merchant: r.merchant,
          amount: r.amount,
          at: r.occurredAt,
        })),
    )
    /* The account's other currencies (5 Oct: "When I upload csv it means
       usd should be updated as well"). Revolut exports one currency a
       file; its EUR statement says USD did not move, so USD is read again
       as it stood that day — its last reading and what moved since, up
       to the statement's day. Here, so a single file and a bulk upload
       do the same. */
    const at = intake.balance.asOf + 6 * 3_600_000
    for (const currency of account.currencies) {
      /* The bank reports each currency itself: none is worked out. */
      if (currency === intake.balance.currency || intake.via === 'bank')
        continue
      const last = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', balanceKey(account._id, currency))
            .lte('recordedAt', at),
        )
        .order('desc')
        .first()
      if (last?.value === undefined) continue
      const since = await movedSince(
        ctx,
        ownerId,
        account,
        currency,
        last.recordedAt,
        at,
      )
      await writeBalance(
        ctx,
        ownerId,
        account,
        currency,
        (Math.round(last.value * 100) + since.cents) / 100,
        dayStart,
        at,
        sourceOf(intake),
        'free',
        0,
        intake._id,
      )
    }
  }
  const tail = ownTail(intake.accountTail, read)
  if (tail) await learnTails(ctx, account, [tail])
  await ctx.db.patch(intake._id, {
    status: 'done',
    keptUntil: keepUntil(),
    accountId: account._id,
    landed: landed ?? undefined,
  })
  return { written, trades }
}

/* Two looks at one ticker within this are the same look. */
export const SAME_LOOK_MS = 20 * 3_600_000

/**
 * Buys and sells into the broker's ledger, oldest first, each with its own
 * date and price in euros at the stored rate — a trade history's, or the
 * orders a broker's cash statement printed as rows. One already stored
 * from another file is skipped, so overlapping statements add nothing.
 */
export async function writeTrades(
  ctx: MutationCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  intakeId: Id<'intakes'>,
  items: Array<{
    index: number
    trade: {
      occurredAt: number
      name: string
      isin?: string
      side: 'buy' | 'sell' | 'reward' | 'split'
      shares: number
      price: number
      currency: string
      fee?: number
      crypto?: boolean
    }
    candidate: Candidate
  }>,
  /* A trading history's rows (9 Oct): Revolut's cash is on its
     statements already, so they never move it. */
  noCash = false,
): Promise<{ written: number; skipped: number }> {
  const rows = [...items].sort(
    (a, b) => a.trade.occurredAt - b.trade.occurredAt,
  )
  /* What the account already holds — a screenshot's tickers — so a
     statement's "ALPHABET INC.CL.A DL-,001" lands on the same GOOGL, not
     on whatever a search returned (sameCompany). */
  const heldIds = new Set<Id<'instruments'>>()
  for (const h of await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .take(MAX_TRADES))
    heldIds.add(h.instrumentId)
  for (const x of await ctx.db
    .query('trades')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .take(MAX_TRADES))
    heldIds.add(x.instrumentId)
  const held: Array<Doc<'instruments'>> = []
  for (const id of heldIds) {
    const doc = await ctx.db.get(id)
    if (doc !== null && doc.ownerId === ownerId) held.push(doc)
  }
  let written = 0
  let skipped = 0
  const seen = new Set<number>()
  const claimed = new Set<Id<'trades'>>()
  const touched: Array<{
    accountId: Id<'accounts'>
    instrumentId: Id<'instruments'>
  }> = []
  /* Each ticker's stored trades, read once a call: a history chunk of
     hundreds of rows over a few tickers would read them hundreds of times. */
  const stored = new Map<Id<'instruments'>, Array<Doc<'trades'>>>()
  const storedFor = async (instrumentId: Id<'instruments'>) => {
    let list = stored.get(instrumentId)
    if (list === undefined) {
      list = await ctx.db
        .query('trades')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
      stored.set(instrumentId, list)
    }
    return list
  }
  for (const { index, trade: t, candidate: c } of rows) {
    if (seen.has(index)) continue
    seen.add(index)
    /* That day's rate, not today's (4 Oct: his crypto trades go back to
       2020, in € and $). */
    const free = t.side === 'reward' || t.side === 'split'
    /* The price with its fee in it: a buy is saved for what it cost
       (14 Oct: "yes, fee" — his gold buys came to €1,094.62 of the
       €1,100 paid). */
    const priceEur = free
      ? 0
      : costPrice(t) *
        (await euroRateAt(ctx, ownerId, t.currency, t.occurredAt))
    /* Revolut takes its crypto fee in coins: a buy brings in its quantity
       less the fee's share of the value. */
    const shares =
      t.crypto && t.side === 'buy' ? sharesIn({ ...t, side: 'buy' }) : t.shares
    if (free) {
      if (!(shares > 0)) throw new ConvexError('That needs a number of shares.')
    } else checkTrade(shares, priceEur)
    const same = sameCompany({ name: t.name, isin: t.isin }, held)
    const instrumentId =
      same >= 0
        ? held[same]._id
        : await upsertInstrument(ctx, ownerId, c, t.isin)
    const near = await storedFor(instrumentId)
    /* Already stored from another file: same side and shares, about the
       same price (5%: a dollar trade read again months later meets a
       newer rate), within two days. Each stored trade answers for one
       row only, and never for a row of this same file — two equal buys
       two days apart are two buys. */
    const twin = near.find(
      (x) =>
        !claimed.has(x._id) &&
        x.importId !== intakeId &&
        x.accountId === account._id &&
        (x.reward ? 'reward' : x.split ? 'split' : x.side) === t.side &&
        Math.abs(x.shares - shares) < 1e-6 &&
        Math.abs(x.priceEur - priceEur) <= priceEur * 0.05 + 0.01 &&
        Math.abs(x.occurredAt - t.occurredAt) <= 2 * DAY_MS + 3_600_000,
    )
    if (twin) {
      claimed.add(twin._id)
      skipped++
      continue
    }
    /* A statement's sell is the broker's word: it is never refused for
       shares an earlier statement, not dropped yet, would have bought. */
    await ctx.db.insert('trades', {
      ownerId,
      accountId: account._id,
      instrumentId,
      side: t.side === 'sell' ? 'sell' : 'buy',
      shares,
      priceEur: Math.round(priceEur * 10000) / 10000,
      occurredAt: t.occurredAt,
      importId: intakeId,
      ...(t.side === 'reward' ? { reward: true } : {}),
      ...(t.side === 'split' ? { split: true } : {}),
      /* Revolut's crypto money is on its bank statement already. */
      ...(t.crypto || noCash ? { noCash: true } : {}),
    })
    written++
    touched.push({ accountId: account._id, instrumentId })
  }
  await syncLedgers(ctx, ownerId, touched)
  return { written, skipped }
}

/**
 * A crypto statement's closing amounts (4 Oct): what the account held on
 * the statement's last day, as its own observation — the trades say what
 * was bought and for how much, this says how much is there. The same day's
 * look for the same coin is replaced, never added to.
 */
export async function writeClosing(
  ctx: MutationCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  intake: Doc<'intakes'>,
) {
  if (intake.kind !== 'trades') return
  const asOf = intake.balance?.asOf ?? intake.readAt ?? Date.now()
  for (const p of intake.positions ?? []) {
    const c = p.candidates.at(p.preferred ?? 0)
    if (!c || p.shares === undefined || !(p.shares > 0)) continue
    const instrumentId = await upsertInstrument(ctx, ownerId, c)
    const day = Math.floor(asOf / DAY_MS)
    const same = (
      await ctx.db
        .query('holdings')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
    ).filter(
      (h) => h.accountId === account._id && Math.floor(h.asOf / DAY_MS) === day,
    )
    for (const h of same) await ctx.db.delete(h._id)
    /* What went in for it, by the trades up to that day: buys less what
       sells brought back (holdings' "paid"). Carried on the look, so a
       coin whose fees the trades miss by a little still says it. */
    const upTo = (
      await ctx.db
        .query('trades')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(MAX_TRADES)
    ).filter((t) => t.accountId === account._id && t.occurredAt <= asOf)
    await ctx.db.insert('holdings', {
      ownerId,
      accountId: account._id,
      instrumentId,
      shares: p.shares,
      paidEur: heldCost(upTo),
      asOf,
      importId: intake._id,
    })
  }
}

type HoldingRow = {
  candidate: Candidate
  isin?: string
  shares: number
  paidEur?: number
  sharesCalculated?: boolean
}

/* What one share of a ticker no market prices was worth on the screen:
   its printed value ÷ its shares (UNPRICED). */
function screenPriceEur(
  positions: ReadonlyArray<NonNullable<Doc<'intakes'>['positions']>[number]>,
  symbol: string,
): number | undefined {
  for (const p of positions) {
    const c = p.preferred !== undefined ? p.candidates[p.preferred] : undefined
    if (c?.type !== UNPRICED || c.symbol !== symbol) continue
    if (p.valueEur !== undefined && p.shares !== undefined && p.shares > 0)
      return p.valueEur / p.shares
  }
  return undefined
}

/* The broker's value of a share no market prices, as a stored reading:
   attributed to its screen, as of the look. A second look the same day
   replaces it, as storePrices does a close. */
export async function writeScreenPrice(
  ctx: MutationCtx,
  ownerId: string,
  instrumentId: Id<'instruments'>,
  account: Doc<'accounts'>,
  read: { priceEur: number; asOf: number; source?: string },
) {
  const inst = await ctx.db.get(instrumentId)
  if (inst !== null && inst.currency !== 'EUR')
    await ctx.db.patch(instrumentId, { currency: 'EUR' })
  const day = new Date(read.asOf).toISOString().slice(0, 10)
  const same = await ctx.db
    .query('prices')
    .withIndex('by_owner_instrument_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('instrumentId', instrumentId)
        .gte('asOf', read.asOf - 86_400_000),
    )
    .take(10)
  for (const p of same)
    if (new Date(p.asOf).toISOString().slice(0, 10) === day)
      await ctx.db.delete(p._id)
  await ctx.db.insert('prices', {
    ownerId,
    instrumentId,
    price: Math.round(read.priceEur * 10000) / 10000,
    currency: 'EUR',
    asOf: read.asOf,
    fetchedAt: Date.now(),
    source: read.source ?? screenSource(account.name),
  })
}

/* A broker screen written as it was seen — shared by the check screen and
   a batch's apply. */
export async function writeHoldings(
  ctx: MutationCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  account: Doc<'accounts'>,
  look: {
    asOf: number
    dayStart: number
    rows: ReadonlyArray<HoldingRow>
    cashEur?: number
    /* Every screen of the look, when more than one went in together. */
    screens?: ReadonlyArray<Doc<'intakes'>>
  },
) {
  if (!account.kinds.includes('broker')) {
    throw new ConvexError(`${account.name} is not a broker.`)
  }
  if (look.rows.length === 0 && look.cashEur === undefined) {
    throw new ConvexError('Keep at least one row, or the cash.')
  }
  if (look.asOf > Date.now() + 5 * 60_000) {
    throw new ConvexError('A screen shows what already is.')
  }
  for (const row of look.rows) {
    if (!Number.isFinite(row.shares) || row.shares <= 0 || row.shares > 1e9)
      throw new ConvexError('That is not a number of shares.')
    if (
      row.paidEur !== undefined &&
      (!Number.isFinite(row.paidEur) || row.paidEur <= 0 || row.paidEur > 1e9)
    )
      throw new ConvexError('That is not what was paid.')
  }
  /* What the account holds already, by the ticker before its exchange:
     a second screen of the same fund lands on the same holding, whatever
     listing its search found this time (3 Oct: VUAA.L then VUAA.MI, SHLD.L
     then the US SHLD — each a second copy of one position). */
  /* Same root and same issuer: SHLD.L (iShares) is not the US SHLD
     (Global X), and a frozen share only ever matches a frozen one — a
     screen price never lands on a listing Yahoo prices. */
  const held = new Map<Id<'instruments'>, Doc<'instruments'>>()
  for (const h of await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .take(MAX_TRADES)) {
    const inst = held.has(h.instrumentId)
      ? null
      : await ctx.db.get(h.instrumentId)
    if (inst !== null) held.set(inst._id, inst)
  }
  const heldFor = (c: Candidate): Id<'instruments'> | undefined => {
    const same = [...held.values()].filter(
      (i) =>
        tickerBase(i.symbol) === tickerBase(c.symbol) &&
        (i.type === UNPRICED) === (c.type === UNPRICED),
    )
    const exact = same.find((i) => i.symbol === c.symbol)
    if (exact) return exact._id
    const k = sameCompany({ name: c.name }, same)
    return k >= 0 ? same[k]._id : undefined
  }
  const symbols = look.rows.map((r) => r.candidate.symbol)
  if (new Set(symbols).size !== symbols.length) {
    throw new ConvexError('Two rows are the same ticker — keep one.')
  }
  let replaced = 0
  /* Two rows on one held position (VUAA.L and VUAA.MI on one screen) are
     one fund twice. */
  const written = new Set<Id<'instruments'>>()
  for (const row of look.rows) {
    const instrumentId =
      heldFor(row.candidate) ??
      (await upsertInstrument(ctx, ownerId, row.candidate, row.isin))
    if (written.has(instrumentId))
      throw new ConvexError('Two rows are the same ticker — keep one.')
    written.add(instrumentId)
    if (row.candidate.type === UNPRICED) {
      const price = screenPriceEur(
        (look.screens ?? [intake]).flatMap((i) => i.positions ?? []),
        row.candidate.symbol,
      )
      if (price === undefined)
        throw new ConvexError(
          `${row.candidate.symbol} has no price — not on the market, not on the screen.`,
        )
      await writeScreenPrice(ctx, ownerId, instrumentId, account, {
        priceEur: price,
        asOf: look.asOf,
      })
    }
    const before = await ctx.db
      .query('holdings')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(MAX_TRADES)
    for (const h of before) {
      if (
        h.accountId === account._id &&
        Math.abs(h.asOf - look.asOf) < SAME_LOOK_MS
      ) {
        await ctx.db.delete(h._id)
        replaced++
      }
    }
    await ctx.db.insert('holdings', {
      ownerId,
      accountId: account._id,
      instrumentId,
      shares: Math.round(row.shares * 1e6) / 1e6,
      paidEur:
        row.paidEur === undefined
          ? undefined
          : Math.round(row.paidEur * 100) / 100,
      sharesCalculated: row.sharesCalculated ? true : undefined,
      asOf: look.asOf,
      importId: intake._id,
    })
  }
  /* A connected broker's cash is the bank's (19 Oct): a screenshot brings
     its positions, and its cash is not saved. Revolut's broker cash is
     still the screen's — the bank does not send it. */
  const link = await ctx.db
    .query('bankLinks')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', account._id),
    )
    .unique()
  const cashFromBank = link?.status === 'linked' && !hasBrokerCash(account)
  if (look.cashEur !== undefined && !cashFromBank) {
    if (!account.currencies.includes('EUR')) {
      throw new ConvexError(`${account.name} does not hold euros.`)
    }
    await writeBalance(
      ctx,
      ownerId,
      account,
      'EUR',
      look.cashEur,
      look.dayStart,
      undefined,
      sourceOf(intake),
      /* A bank that is also a broker: the screen's cash is the broker's,
         and the bank's euros stay as they were (10 Oct). */
      hasBrokerCash(account) ? 'broker' : 'free',
      0,
      intake._id,
    )
  }
  await ctx.db.patch(intake._id, {
    status: 'done',
    keptUntil: keepUntil(),
    accountId: account._id,
  })
  return { positions: look.rows.length, replaced }
}

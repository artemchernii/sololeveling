import {
  DAY_MS,
  HISTORY_ROWS,
  batchIntakes,
  headingFor,
  liveAccounts,
  monthStart,
  suggestFor,
} from './shared'
import { buildReview } from './review'
import { v } from 'convex/values'
import { accountCheck, balanceIsNews, sumCheckValue } from '../rowBalance'
import { sharesFor, sharesValue, sharesView } from '../sharesCheck'
import { totalStops, totalValue, totalView } from '../holdingsTotal'
import { knownCount } from '../holdingsKnown'
import { forDrop, transferValue } from '../transferMatch'
import type { DropRow, Transfer } from '../transferMatch'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { tickerBase } from '../../src/lib/market'
import { completePosition } from '../../src/lib/intake'
import {
  balanceGaps,
  coverage,
  pairAcross,
  reviewMonths,
} from '../../src/lib/bulk'
import type { OwnRow } from '../../src/lib/bulk'

/* A batch of files read together: each account it names, what it asks,
   and the rows it would save. gatherBatch is shared with bankRows.ts. */

const MAX_ACCOUNT_ROWS = 300

export const MISSING_TEXT = 'Missing from the file'

const monthState = v.union(
  v.literal('none'),
  v.literal('had'),
  v.literal('add'),
  v.literal('hole'),
)

export const reading = v.object({ asOf: v.number(), value: v.number() })

export const batchAsk = v.union(
  /* Read, but nothing on it says whose — a screenshot, mostly. */
  v.object({
    kind: v.literal('whose'),
    intakeId: v.id('intakes'),
    name: v.string(),
    image: v.boolean(),
    /* What it found, so he can tell which it is. */
    what: v.union(
      v.literal('transactions'),
      v.literal('holdings'),
      v.literal('trades'),
    ),
    rows: v.number(),
    from: v.union(v.number(), v.null()),
    to: v.union(v.number(), v.null()),
    investedEur: v.union(v.number(), v.null()),
    cashEur: v.union(v.number(), v.null()),
    seen: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal('hole'),
    accountId: v.id('accounts'),
    month: v.string(),
  }),
  v.object({
    kind: v.literal('oneSide'),
    intakeId: v.id('intakes'),
    index: v.number(),
    accountId: v.id('accounts'),
    amount: v.number(),
    occurredAt: v.number(),
    merchant: v.string(),
    /* The account it trades money with most — offered first. */
    likely: v.union(v.id('accounts'), v.null()),
  }),
  v.object({
    kind: v.literal('gap'),
    key: v.string(),
    accountId: v.id('accounts'),
    from: v.number(),
    to: v.number(),
    gap: v.number(),
  }),
  /* A broker screen with positions the app cannot complete on its own —
     checked on the screen that can. */
  v.object({
    kind: v.literal('holdings'),
    intakeId: v.id('intakes'),
    name: v.string(),
    accountId: v.id('accounts'),
    missing: v.number(),
    positions: v.number(),
  }),
  v.object({
    kind: v.literal('failed'),
    intakeId: v.id('intakes'),
    name: v.string(),
    image: v.boolean(),
    error: v.string(),
    retryable: v.boolean(),
  }),
)

export const batchAccount = v.object({
  /* His account — or null for a bank the app knows that he has not added:
     the block shows what the files say, and one tap keeps it. */
  accountId: v.union(v.id('accounts'), v.null()),
  product: v.union(
    v.object({
      id: v.string(),
      name: v.string(),
      accountTail: v.union(v.string(), v.null()),
      holder: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  leftOut: v.boolean(),
  files: v.array(
    v.object({
      intakeId: v.id('intakes'),
      name: v.string(),
      kind: v.union(
        v.literal('transactions'),
        v.literal('holdings'),
        v.literal('trades'),
      ),
      image: v.boolean(),
      /* Rows the bank itself sent: no file was read. */
      bank: v.boolean(),
    }),
  ),
  fresh: v.number(),
  had: v.number(),
  /* The file prints a balance the account does not hold yet. */
  balanceNews: v.boolean(),
  /* Does it add up (11 Oct): null when the account holds no balance. */
  check: v.union(sumCheckValue, v.null()),
  /* Rows that are one side of a transfer between two of his accounts
     (12 Oct, convex/transferMatch.ts). */
  transfers: v.array(transferValue),
  /* It does not, and he has not said what to do: apply leaves it. */
  held: v.boolean(),
  trades: v.number(),
  /* A trading history against the account's shares (11 Oct). */
  shares: v.union(sharesValue, v.null()),
  holdings: v.union(
    v.object({
      positions: v.number(),
      investedEur: v.number(),
      cashEur: v.union(v.number(), v.null()),
      totalEur: v.union(v.number(), v.null()),
      complete: v.boolean(),
      /* The positions and the cash against the printed total (11 Oct). */
      total: totalValue,
    }),
    v.null(),
  ),
  first: v.union(reading, v.null()),
  last: v.union(reading, v.null()),
  months: v.array(monthState),
  gaps: v.number(),
  /* Pending rows that explain the last balance (an app's "Pending −1,205"
     already taken off what it shows). */
  pending: v.number(),
  rows: v.array(
    v.object({
      occurredAt: v.number(),
      merchant: v.string(),
      amount: v.number(),
      kind: v.union(v.literal('spend'), v.literal('income'), v.literal('move')),
      category: v.union(v.string(), v.null()),
      had: v.boolean(),
      pending: v.boolean(),
    }),
  ),
})

/** Signed as the account sees it: money out is negative. */
function signedLog(l: Doc<'logs'>): number {
  const value = l.value ?? 0
  return l.kind === 'expense' ? -value : value
}

export const isImage = (i: Doc<'intakes'>) =>
  (i.files ?? []).some((f) => f.contentType.startsWith('image/'))

/* What a broker's screens in one drop show together: Trading 212 puts
   the positions on one screen and the cash on another (3 Oct). */
export function mergedHoldings(list: ReadonlyArray<Doc<'intakes'>>) {
  const screens = list.filter((i) => i.kind === 'holdings')
  if (screens.length === 0) return null
  /* Two scrolls of one list overlap (3 Oct: IMG_9239 and IMG_9250 both
     show the six ETFs): one position per fund, the later reading's. */
  const byFund = new Map<
    string,
    NonNullable<Doc<'intakes'>['positions']>[number]
  >()
  for (const i of [...screens].sort(
    (a, b) => (a.readAt ?? a._creationTime) - (b.readAt ?? b._creationTime),
  ))
    for (const p of i.positions ?? []) {
      const c =
        p.preferred !== undefined && p.preferred >= 0
          ? p.candidates[p.preferred]
          : undefined
      byFund.set(c ? tickerBase(c.symbol) : `name:${p.name}`, p)
    }
  const positions = [...byFund.values()]
  const rows = positions.map((p) => {
    const c = completePosition(p, p.todayPriceEur)
    /* -1: no listing's price fits what the screen printed — asked, not
       filed under the first search hit. */
    const pick =
      p.preferred === undefined
        ? p.candidates.at(0)
        : p.preferred >= 0
          ? p.candidates[p.preferred]
          : undefined
    const paid =
      p.valueEur !== undefined &&
      p.changePct !== undefined &&
      p.changePct > -100
        ? Math.round((p.valueEur / (1 + p.changePct / 100)) * 100) / 100
        : undefined
    return pick !== undefined && c.shares !== undefined && c.shares > 0
      ? {
          candidate: pick,
          isin: p.isin,
          shares: c.shares,
          paidEur: paid,
          sharesCalculated: c.sharesCalculated || undefined,
        }
      : null
  })
  const cash = screens.find((i) => i.cashEur !== undefined)?.cashEur
  /* One screen's total may be the positions alone (212's list: €2,014),
     another the whole account (its summary: €15,008): the account's is
     the larger. */
  const totals = screens.flatMap((i) =>
    i.totalEur === undefined ? [] : [i.totalEur],
  )
  const total = totals.length ? Math.max(...totals) : undefined
  return {
    screens,
    rows,
    cashEur: cash ?? null,
    totalEur: total ?? null,
    /* Each position as printed, for the check against the total. */
    values: positions.map((p) => p.valueEur),
    lines: positions.map((p) => {
      const c = p.candidates.at(p.preferred ?? 0)
      return {
        name: p.name,
        symbol: c?.symbol ?? null,
        type: c?.type ?? null,
        valueEur: p.valueEur ?? null,
      }
    }),
    investedEur:
      Math.round(positions.reduce((t, p) => t + (p.valueEur ?? 0), 0) * 100) /
      100,
    missing: rows.filter((r) => r === null).length,
  }
}

/* The batch gathered per account — what the review shows, and what an
   apply needs to resolve its transfers before writing. */
export async function gatherBatch(
  ctx: QueryCtx,
  ownerId: string,
  b: Doc<'batches'>,
  names?: ReadonlyArray<string>,
) {
  const intakes = await batchIntakes(ctx, ownerId, b._id)
  const accounts = await liveAccounts(ctx, ownerId)
  const ready = intakes.every((i) => i.status !== 'reading')
  const live = intakes.filter((i) => i.status === 'ready')

  const asks: Array<typeof batchAsk.type> = []
  for (const i of intakes.filter((x) => x.status === 'failed'))
    asks.push({
      kind: 'failed',
      intakeId: i._id,
      name: i.files?.[0]?.name ?? 'file',
      image: isImage(i),
      error: i.error ?? 'It could not be read.',
      retryable: i.retryable ?? false,
    })

  /* Where each read file goes: one of his accounts, a bank he has not
     added (a block of its own), or — nothing says — asked. */
  type Group = {
    key: string
    accountId: Id<'accounts'> | null
    product: (typeof batchAccount.type)['product']
    list: Array<Doc<'intakes'>>
  }
  const groups = new Map<string, Group>()
  for (const i of live) {
    const here = headingFor(i, accounts)
    const s = here === null ? suggestFor(i) : null
    if (here === null && s === null) {
      const times = [
        ...(i.transactions ?? []).map((r) => r.occurredAt),
        ...(i.trades ?? []).map((r) => r.occurredAt),
      ]
      const held = mergedHoldings([i])
      asks.push({
        kind: 'whose',
        intakeId: i._id,
        name: i.files?.[0]?.name ?? 'file',
        image: isImage(i),
        what: i.kind ?? 'transactions',
        rows:
          (i.transactions?.length ?? 0) +
          (i.trades?.length ?? 0) +
          (i.positions?.length ?? 0),
        from: times.length ? Math.min(...times) : null,
        to: times.length ? Math.max(...times) : null,
        investedEur: held?.investedEur ?? null,
        cashEur: held?.cashEur ?? null,
        seen: i.institution ?? null,
      })
      continue
    }
    const key = here ?? `new:${s?.product}`
    const g = groups.get(key)
    if (g) g.list.push(i)
    else
      groups.set(key, {
        key,
        accountId: here,
        product: s
          ? {
              id: s.product,
              name: s.name,
              accountTail: s.accountTail,
              holder: i.holderName ?? null,
            }
          : null,
        list: [i],
      })
  }

  /* Every file's own review, the same one a single file gets. */
  const reviews = new Map<
    Id<'intakes'>,
    Awaited<ReturnType<typeof buildReview>>
  >()
  for (const g of groups.values())
    for (const i of g.list)
      if (i.kind === 'transactions')
        reviews.set(i._id, await buildReview(ctx, ownerId, i, names))

  /* New rows that are one side of a transfer he has, or of one in another
     file of this drop: shown as one transfer, written once (12 Oct). */
  const dropRows: Array<DropRow> = []
  for (const g of groups.values()) {
    const accountId = g.accountId
    if (accountId === null || b.leftOut.includes(accountId)) continue
    for (const i of g.list)
      for (const row of reviews.get(i._id)?.rows ?? []) {
        const key = `${i._id}:${row.index}`
        if (
          row.pending ||
          row.duplicateOf !== null ||
          row.counted ||
          b.dismissed.includes(`skip:${key}`)
        )
          continue
        dropRows.push({
          key,
          intakeId: i._id,
          accountId,
          occurredAt: row.occurredAt,
          amount: row.amount,
          currency: row.currency,
          merchant: row.merchant,
          raw: row.raw,
          counterparty: row.counterparty,
          move: row.kind === 'move',
        })
      }
  }
  const transferBy = new Map(
    (dropRows.length > 0
      ? await forDrop(ctx, ownerId, accounts, dropRows, b.dismissed)
      : []
    ).map((t) => [t.key, t]),
  )
  const matched: Array<{ t: Transfer; side: Transfer['sides'][number] }> = []

  const allTimes = [...groups.values()].flatMap((g) =>
    g.list.flatMap((i) => [
      ...(i.transactions ?? []).map((r) => r.occurredAt),
      ...(i.trades ?? []).map((r) => r.occurredAt),
    ]),
  )
  const months = reviewMonths(allTimes)
  const span = months.length
    ? {
        from: monthStart(months[0]),
        to: monthStart(months[months.length - 1], 1),
      }
    : null

  const answered = new Map(
    b.moves.map((m) => [`${m.intakeId}:${m.index}`, m.otherAccountId]),
  )
  const own: Array<OwnRow<string>> = []
  const ownInfo = new Map<
    string,
    { intakeId: Id<'intakes'>; index: number; merchant: string }
  >()
  const out: Array<typeof batchAccount.type> = []
  /* Which of his accounts each one trades money with, most often — the
     likely other side of a move nothing in the drop explains. */
  const partners = new Map<string, Map<Id<'accounts'>, number>>()
  const tally = (from: string, to: Id<'accounts'>) => {
    const m = partners.get(from) ?? new Map<Id<'accounts'>, number>()
    m.set(to, (m.get(to) ?? 0) + 1)
    partners.set(from, m)
  }

  for (const g of groups.values()) {
    const accountId = g.accountId
    const leftOut = accountId !== null && b.leftOut.includes(accountId)
    const had =
      span && accountId
        ? await ctx.db
            .query('logs')
            .withIndex('by_owner_account_time', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('accountId', accountId)
                .gte('occurredAt', span.from)
                .lt('occurredAt', span.to),
            )
            .take(HISTORY_ROWS)
        : []
    if (accountId)
      for (const l of had)
        if (l.kind === 'move' && l.meta?.otherAccountId)
          tally(accountId, l.meta.otherAccountId)
    let newRows = 0
    let hadRows = 0
    let trades = 0
    const adds: Array<number> = []
    const ledger: Array<{ occurredAt: number; amount: number }> = had.map(
      (l) => ({ occurredAt: l.occurredAt, amount: signedLog(l) }),
    )
    const pendingRows: Array<{
      occurredAt: number
      amount: number
      currency: string
    }> = []
    const balances: Array<{ asOf: number; value: number }> = []
    let printed: Doc<'intakes'>['balance']
    const rows: Array<(typeof batchAccount.type)['rows'][number]> = []
    const transfers: Array<Transfer> = []
    const sumRows: Array<Parameters<typeof accountCheck>[4][number]> = []
    const skippedRows: Array<Parameters<typeof accountCheck>[5][number]> = []
    for (const i of g.list) {
      /* A broker screen's total is not a bank balance (3 Oct: Trading
         212's two screens drew "€15,008.26 → €2,014.04"). */
      if (i.balance && i.kind === 'transactions') {
        balances.push({ asOf: i.balance.asOf, value: i.balance.value })
        if (!printed || i.balance.asOf > printed.asOf) printed = i.balance
      }
      trades += (i.trades?.length ?? 0) + (i.historyTrades ?? 0)
      for (const t of i.trades ?? []) adds.push(t.occurredAt)
      const r = reviews.get(i._id)
      if (!r) continue
      for (const row of r.rows) {
        const rowKey = `${i._id}:${row.index}`
        const skipped = b.dismissed.includes(`skip:${rowKey}`)
        /* One side of a transfer. Two rows both read as moves, to the
           cent and two days apart, stay with the pairing below. */
        const found = transferBy.get(rowKey)
        const side = found?.sides.find((s) => s.id === found.chosen)
        const transfer =
          found !== undefined &&
          found.state !== 'apart' &&
          !(
            row.kind === 'move' &&
            found.state === 'sure' &&
            side !== undefined &&
            !side.here &&
            side.fee === 0 &&
            Math.abs(side.occurredAt - row.occurredAt) <= 2 * DAY_MS + 3_600_000
          )
            ? found
            : undefined
        if (found !== undefined && (transfer || found.state === 'apart'))
          transfers.push(found)
        if (transfer && side && !side.here) matched.push({ t: transfer, side })
        const feeHere =
          transfer && side && (side.here || row.amount > 0) ? side.fee : 0
        const dup =
          row.duplicateOf !== null ||
          row.counted ||
          skipped ||
          (transfer !== undefined && side?.here === true)
        if (!dup && !row.pending)
          sumRows.push({
            key: rowKey,
            occurredAt: row.occurredAt,
            merchant: row.merchant,
            amount: row.amount + feeHere,
            currency: row.currency,
            twinOf: transfer ? null : row.twinOf,
            two: b.dismissed.includes(`two:${rowKey}`),
          })
        if (feeHere > 0 && !row.pending)
          sumRows.push({
            key: `${rowKey}:fee`,
            occurredAt: row.occurredAt,
            merchant: 'Transfer fee',
            amount: -feeHere,
            currency: row.currency,
            twinOf: null,
            two: false,
          })
        if (skipped)
          skippedRows.push({
            key: rowKey,
            merchant: row.merchant,
            amount: row.amount,
          })
        rows.push({
          occurredAt: row.occurredAt,
          merchant: row.merchant,
          amount: row.amount,
          kind: row.kind,
          category: row.category,
          had: dup,
          pending: row.pending,
        })
        if (row.pending) {
          pendingRows.push({
            occurredAt: row.occurredAt,
            amount: row.amount,
            currency: row.currency,
          })
          continue
        }
        if (dup) hadRows++
        else {
          newRows++
          adds.push(row.occurredAt)
          ledger.push({ occurredAt: row.occurredAt, amount: row.amount })
        }
        if (row.kind === 'move' && !dup && !leftOut && !transfer) {
          const key = `${i._id}:${row.index}`
          const answer = answered.get(key)
          own.push({
            key,
            accountId: accountId ?? g.key,
            amount: row.amount,
            occurredAt: row.occurredAt,
            otherAccountId:
              answer === undefined ? row.otherAccountId : (answer ?? 'outside'),
          })
          ownInfo.set(key, {
            intakeId: i._id,
            index: row.index,
            merchant: row.merchant,
          })
        }
      }
    }
    if (accountId)
      for (const e of b.extras.filter((x) => x.accountId === accountId))
        ledger.push({ occurredAt: e.occurredAt, amount: e.amount })
    balances.sort((x, y) => x.asOf - y.asOf)
    const quiet = accountId
      ? b.quietMonths
          .filter((q) => q.accountId === accountId)
          .map((q) => q.month)
      : []
    /* A month with no buy is not a statement missing (14 Oct: a
       screenshot of four gold buys asked "no rows in May?"). Only files
       of money rows can have a hole. */
    const money = g.list.some((i) => i.kind === 'transactions')
    const cover = coverage(
      months,
      had.map((l) => l.occurredAt),
      adds,
      quiet,
    ).map((c) =>
      c.state === 'hole' && !money ? { ...c, state: 'none' as const } : c,
    )
    /* A gap the pending rows account for is not one: the app showed the
       balance with them already taken off. */
    let pending = 0
    const gaps = balanceGaps(balances, ledger).filter((gap) => {
      if (accountId && b.dismissed.includes(`gap:${accountId}:${gap.from}`))
        return false
      const inside = pendingRows
        .filter(
          (p) =>
            p.occurredAt > gap.from - DAY_MS && p.occurredAt <= gap.to + DAY_MS,
        )
        .reduce((t, p) => t + Math.round(p.amount * 100), 0)
      if (inside !== 0 && inside === Math.round(gap.gap * 100)) {
        pending += inside / 100
        return false
      }
      return true
    })
    const held = mergedHoldings(g.list)
    if (accountId && !leftOut) {
      for (const c of cover)
        if (c.state === 'hole')
          asks.push({ kind: 'hole', accountId, month: c.month })
      for (const gap of gaps)
        asks.push({
          kind: 'gap',
          key: `gap:${accountId}:${gap.from}`,
          accountId,
          ...gap,
        })
      if (held && held.missing > 0)
        asks.push({
          kind: 'holdings',
          intakeId: held.screens[0]._id,
          name: held.screens[0].files?.[0]?.name ?? 'file',
          accountId,
          missing: held.missing,
          positions: held.rows.length,
        })
    }
    rows.sort((x, y) => y.occurredAt - x.occurredAt)
    const account = accounts.find((a) => a._id === accountId)
    const check =
      account && sumRows.length + skippedRows.length + (printed ? 1 : 0) > 0
        ? await accountCheck(
            ctx,
            ownerId,
            account,
            printed,
            sumRows,
            skippedRows,
            b.dismissed.includes(`sum:${account._id}`),
            /* The bank sends every row still pending with its balance,
               and that balance has them off (17 Oct). A file's list may
               not be whole, so a file keeps the older reading. */
            g.list.every((i) => i.via === 'bank')
              ? pendingRows
                  .filter((p) => !printed || p.currency === printed.currency)
                  .reduce((t, p) => t + Math.round(p.amount * 100), 0)
              : null,
          )
        : null
    const known =
      held && accountId && !leftOut
        ? await knownCount(ctx, ownerId, accountId, held.rows)
        : 0
    const total = held ? totalView(held, accountId, b.dismissed, known) : null
    out.push({
      accountId,
      product: accountId ? null : g.product,
      leftOut,
      files: g.list.map((i) => ({
        intakeId: i._id,
        name: i.files?.[0]?.name ?? 'file',
        kind: i.kind ?? 'transactions',
        image: isImage(i),
        bank: i.via === 'bank',
      })),
      fresh: newRows,
      had: hadRows,
      balanceNews:
        accountId !== null && printed !== undefined
          ? await balanceIsNews(ctx, ownerId, accountId, printed)
          : false,
      check,
      transfers: leftOut ? [] : transfers,
      /* Only rows can be written twice: a file with none to add and a
         balance the account does not hold just corrects it (11 Oct, his
         card at −€1,114.85 and the screenshot that says €90.35). */
      held:
        (!leftOut &&
          transfers.some(
            (t) =>
              t.state === 'ask' &&
              (t.amount > 0 || t.sides.some((x) => x.stored)),
          )) ||
        (check !== null &&
          !check.accepted &&
          check.kept.length === 0 &&
          sumRows.length > 0 &&
          (check.state === 'ask' || check.state === 'off')) ||
        /* A broker screenshot that does not reach its own total. */
        (total !== null && !leftOut && totalStops(total)),
      trades,
      shares: await (async () => {
        const file = leftOut
          ? undefined
          : g.list.find((i) => i.historyShares !== undefined)
        if (!file) return null
        const c = await sharesFor(ctx, ownerId, file, accountId)
        return c ? sharesView(file, c, b.dismissed) : null
      })(),
      holdings: held
        ? {
            positions: held.rows.length,
            investedEur: held.investedEur,
            cashEur: held.cashEur,
            totalEur: held.totalEur,
            complete: held.missing === 0,
            total: total ?? totalView(held, accountId, b.dismissed, known),
          }
        : null,
      first: balances.at(0) ?? null,
      last: balances.at(-1) ?? null,
      months: cover.map((c) => c.state),
      gaps: gaps.length,
      pending: Math.round(pending * 100) / 100,
      rows: rows.slice(0, MAX_ACCOUNT_ROWS),
    })
  }

  const { pairs, oneSide } = pairAcross(own)
  const byKey = new Map(own.map((r) => [r.key, r]))
  const real = (id: string): id is Id<'accounts'> =>
    !id.startsWith('new:') && id !== 'outside'

  /* The other side may be in the app already, not in this drop: BPI's
     €300 to ActivoBank on 27 Aug, when ActivoBank's +€300 was read last
     week (3 Oct). Matched by amount and days in the account the row
     names — or, naming none, in any of his others. */
  const inDrop = new Set(pairs.flat())
  const stored: Array<{
    key: string
    otherAccountId: Id<'accounts'>
    occurredAt: number
  }> = []
  const taken = new Set<Id<'logs'>>()
  for (const r of own) {
    if (inDrop.has(r.key) || !real(r.accountId)) continue
    if (r.otherAccountId === 'outside') continue
    const others =
      r.otherAccountId !== null && real(r.otherAccountId)
        ? [r.otherAccountId]
        : accounts.map((a) => a._id).filter((id) => id !== r.accountId)
    for (const other of others) {
      const near = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', other)
            .gte('occurredAt', r.occurredAt - 2 * DAY_MS - 3_600_000)
            .lte('occurredAt', r.occurredAt + 2 * DAY_MS + 3_600_000),
        )
        .take(200)
      const hit = near.find(
        (l) =>
          l.kind === 'move' &&
          !taken.has(l._id) &&
          l.meta?.pairOf === undefined &&
          Math.round(((l.value ?? 0) + r.amount) * 100) === 0,
      )
      if (hit) {
        taken.add(hit._id)
        stored.push({
          key: r.key,
          otherAccountId: other,
          occurredAt: hit.occurredAt,
        })
        break
      }
    }
  }
  const storedKeys = new Set(stored.map((x) => x.key))
  for (const x of stored) {
    const r = byKey.get(x.key)
    if (r && real(r.accountId)) {
      tally(r.accountId, x.otherAccountId)
      tally(x.otherAccountId, r.accountId)
    }
  }
  for (const [a, c] of pairs) {
    const x = byKey.get(a)
    const y = byKey.get(c)
    if (x && y && real(x.accountId) && real(y.accountId)) {
      tally(x.accountId, y.accountId)
      tally(y.accountId, x.accountId)
    }
  }
  const likelyFor = (id: Id<'accounts'>) =>
    [...(partners.get(id) ?? new Map<Id<'accounts'>, number>())]
      .filter(([other]) => other !== id)
      .sort((p, q) => q[1] - p[1])
      .at(0)?.[0] ?? null

  for (const key of oneSide) {
    const r = byKey.get(key)
    const info = ownInfo.get(key)
    if (!r || !info || !real(r.accountId) || storedKeys.has(key)) continue
    asks.push({
      kind: 'oneSide',
      intakeId: info.intakeId,
      index: info.index,
      accountId: r.accountId,
      amount: r.amount,
      occurredAt: r.occurredAt,
      merchant: info.merchant,
      likely: likelyFor(r.accountId),
    })
  }
  const moves = pairs.flatMap(([a, c]) => {
    const x = byKey.get(a)
    const y = byKey.get(c)
    if (!x || !y || !real(x.accountId) || !real(y.accountId)) return []
    return [
      {
        fromAccountId: x.accountId,
        toAccountId: y.accountId,
        amount: Math.abs(x.amount),
        occurredAt: Math.min(x.occurredAt, y.occurredAt),
        days: Math.round(Math.abs(x.occurredAt - y.occurredAt) / DAY_MS),
        had: false,
      },
    ]
  })
  for (const x of stored) {
    const r = byKey.get(x.key)
    if (!r || !real(r.accountId)) continue
    const leaving = r.amount < 0
    moves.push({
      fromAccountId: leaving ? r.accountId : x.otherAccountId,
      toAccountId: leaving ? x.otherAccountId : r.accountId,
      amount: Math.abs(r.amount),
      occurredAt: Math.min(r.occurredAt, x.occurredAt),
      days: Math.round(Math.abs(r.occurredAt - x.occurredAt) / DAY_MS),
      had: true,
    })
  }
  for (const { t, side } of matched) {
    if (t.chosen === null || (!side.stored && t.amount < 0)) continue
    const leaving = t.amount < 0
    moves.push({
      fromAccountId: leaving ? t.accountId : side.accountId,
      toAccountId: leaving ? side.accountId : t.accountId,
      amount: Math.abs(leaving ? t.amount : side.amount),
      occurredAt: Math.min(t.occurredAt, side.occurredAt),
      days: Math.round(Math.abs(t.occurredAt - side.occurredAt) / DAY_MS),
      had: side.stored,
    })
  }

  const order = new Map(accounts.map((a, i) => [a._id, i]))
  out.sort(
    (x, y) =>
      (x.accountId === null ? 1e6 : (order.get(x.accountId) ?? 0)) -
      (y.accountId === null ? 1e6 : (order.get(y.accountId) ?? 0)),
  )
  return {
    status: b.status,
    ready,
    months,
    accounts: out,
    asks,
    moves: moves.sort((x, y) => y.occurredAt - x.occurredAt),
    files: intakes.length,
    pairs: pairs.filter(([a, c]) => {
      const x = byKey.get(a)
      const y = byKey.get(c)
      return x && y && real(x.accountId) && real(y.accountId)
    }),
    ownInfo,
    stored,
    accountOf: new Map(
      own
        .filter((r) => real(r.accountId))
        .map((r) => [r.key, r.accountId as Id<'accounts'>]),
    ),
  }
}

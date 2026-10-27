import {
  DAY_MS,
  HISTORY_ROWS,
  RULES_READ,
  byBank,
  guessAccount,
  hisNames,
  namesOnFiles,
  suggestFor,
} from './shared'
import { groupFor } from '../../src/lib/merchantRule'
import { v } from 'convex/values'
import { transferPair } from '../logs'
import { countedRows } from '../rowBalance'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import {
  findDuplicates,
  findRecurring,
  merchantKey,
  ownMoney,
} from '../../src/lib/intake'
import { dueDay } from '../../src/lib/bills'
import { pickOtherSide } from '../../src/lib/otherSide'

/* One file's review: its rows beside what is already saved, and the
   account tails it teaches. */

export const reviewRow = v.object({
  index: v.number(),
  occurredAt: v.number(),
  time: v.union(v.string(), v.null()),
  merchant: v.string(),
  raw: v.string(),
  amount: v.number(),
  currency: v.string(),
  pending: v.boolean(),
  /** What it is, as the rules and the reader see it. */
  kind: v.union(v.literal('spend'), v.literal('income'), v.literal('move')),
  category: v.union(v.string(), v.null()),
  /** 'rule' — a merchant he taught; 'reader' — the reader's guess. */
  categorySource: v.union(v.literal('rule'), v.literal('reader'), v.null()),
  /** A move's other account, when it can tell. */
  otherAccountId: v.union(v.id('accounts'), v.null()),
  counterparty: v.union(v.string(), v.null()),
  /** Already in his history: the log it repeats. */
  duplicateOf: v.union(v.id('logs'), v.null()),
  /** A balance he already has had counted it (convex/rowBalance.ts). */
  counted: v.boolean(),
  /** A row he has of the same amount, days apart, that nothing matched. */
  twinOf: v.union(
    v.object({ occurredAt: v.number(), merchant: v.string() }),
    v.null(),
  ),
  /** The bill this pays, if it matches one on its day. */
  recurringId: v.union(v.id('recurring'), v.null()),
})

/* The review of one read statement, against what he has — shared by the
   single-file review and a batch, which reviews every file the same way. */
export async function buildReview(
  ctx: QueryCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  /* A scheduled apply has no sign-in: it passes the names it was given. */
  given?: ReadonlyArray<string>,
) {
  const read = intake.transactions ?? []

  const accounts = (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
  ).filter((a) => a.retiredAt === undefined)
  const guessed = intake.accountId ?? guessAccount(intake, accounts)
  const accountId = intake.accountId ?? null
  const here = accountId ?? guessed

  /* What he has in this account over the same days, for duplicates. */
  const times = read.map((r) => r.occurredAt)
  const from = Math.min(...times) - 4 * 86_400_000
  const to = Math.max(...times) + 4 * 86_400_000
  const existing = here
    ? await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', here)
            .gte('occurredAt', from)
            .lte('occurredAt', to),
        )
        .take(HISTORY_ROWS)
    : []
  const existingRows = existing.map((l) => ({
    occurredAt: l.occurredAt,
    amount:
      l.kind === 'income'
        ? (l.value ?? 0)
        : l.kind === 'move'
          ? (l.value ?? 0)
          : -(l.value ?? 0),
    merchant: l.meta?.merchant ?? l.text ?? '',
    raw: l.meta?.raw,
  }))
  const dups = findDuplicates(read, existingRows)
  const hereAccount = accounts.find((a) => a._id === here)
  const counted = hereAccount
    ? await countedRows(ctx, ownerId, hereAccount, intake)
    : new Set<number>()
  /* A transfer is the same transfer whatever each bank calls it — "To
     Trade Republic" here, "Revolut → TR" typed, "Top up" on the other
     side: its own money moving is matched by amount and days alone. */
  const names = given
    ? [
        intake.holderName,
        ...given,
        ...(await namesOnFiles(ctx, ownerId)),
      ].filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    : await hisNames(ctx, intake)
  const own = read.map((r) => r.self || ownMoney(r, names))
  const taken = new Set(dups.filter((d): d is number => d !== null))
  /* A side another account's file wrote here is waiting for this bank to
     book it, and a bank books a card top-up days later, over a weekend
     (11 Oct: Revolut's top-up of Sat 3 Oct, ActivoBank's row on Tue the
     6th — written twice). Such a side is matched four days out. */
  const fromOther = new Set<number>()
  for (const [k, l] of existing.entries()) {
    if (l.kind !== 'move' || l.meta?.intakeId === undefined) continue
    const file = await ctx.db.get(l.meta.intakeId)
    if (file && file.accountId !== undefined && file.accountId !== here)
      fromOther.add(k)
  }
  for (const [i, r] of read.entries()) {
    if (dups[i] !== null || !own[i]) continue
    const j = existing.findIndex(
      (l, k) =>
        !taken.has(k) &&
        l.kind === 'move' &&
        Math.abs((l.value ?? 0) - r.amount) < 0.005 &&
        Math.abs(l.occurredAt - r.occurredAt) <=
          (fromOther.has(k) ? 4 : 2) * DAY_MS + 3_600_000,
    )
    if (j >= 0) {
      dups[i] = j
      taken.add(j)
    }
  }

  const rules = new Map<string, string>()
  for (const key of new Set(read.map((r) => merchantKey(r.merchant)))) {
    const rule = await ctx.db
      .query('merchantRules')
      .withIndex('by_owner_key', (q) => q.eq('ownerId', ownerId).eq('key', key))
      .first()
    if (rule) rules.set(key, rule.category)
  }
  /* A payee filed before under another spelling (12 Oct): the bank's own
     rows say "COMPRA 2789 PINGO DOCE LISBOA", his statement said "Pingo
     Doce". The rules are read once, and only when a row met none. */
  const unmet = read.filter(
    (r) => r.amount < 0 && !rules.has(merchantKey(r.merchant)),
  )
  if (unmet.length > 0) {
    const all = await ctx.db
      .query('merchantRules')
      .withIndex('by_owner_key', (q) => q.eq('ownerId', ownerId))
      .take(RULES_READ)
    for (const r of unmet) {
      const group = groupFor(r.merchant, all)
      if (group !== null) rules.set(merchantKey(r.merchant), group)
    }
  }

  const bills = await ctx.db
    .query('recurring')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .take(100)
  const liveBills = bills.filter((b) => b.endedAt === undefined)
  const usedBill = new Set<string>()

  const sides = accounts
    .filter((a) => a._id !== here)
    .map((a) => ({
      id: a._id,
      name: a.name,
      domain: a.domain,
      tails: [...(a.ibanTails ?? []), ...(a.cardTails ?? [])],
    }))
  const hereSide = hereAccount && {
    id: hereAccount._id,
    tails: [...(hereAccount.ibanTails ?? []), ...(hereAccount.cardTails ?? [])],
  }

  /* The same amount a week either way, under any name, that no row of the
     file was matched to: asked about only when the sum is off. */
  const twinOf = (r: (typeof read)[number]) => {
    const k = existingRows.findIndex(
      (l, j) =>
        !taken.has(j) &&
        Math.abs(l.amount - r.amount) < 0.005 &&
        Math.abs(l.occurredAt - r.occurredAt) <= 7 * DAY_MS,
    )
    return k < 0
      ? null
      : {
          occurredAt: existingRows[k].occurredAt,
          merchant: existingRows[k].merchant,
        }
  }
  const rows = read.map((r, index) => {
    const move = own[index]
    const kind = move
      ? ('move' as const)
      : r.amount > 0
        ? ('income' as const)
        : ('spend' as const)
    /* PayPal is many shops: its rows come in unfiled, to be named one
       by one (4 Oct), whatever an old rule said. */
    const rule = /\bPAYPAL\b/i.test(`${r.merchant} ${r.raw}`)
      ? undefined
      : rules.get(merchantKey(r.merchant))
    const category = kind === 'spend' ? (rule ?? r.category ?? null) : null
    let recurringId: Id<'recurring'> | null = null
    if (!move && !r.pending) {
      const d = new Date(r.occurredAt)
      for (const b of liveBills) {
        const due = dueDay(b, d.getFullYear(), d.getMonth())
        const sameWay = (b.kind === 'income') === r.amount > 0
        const key = `${b._id}:${d.getFullYear()}-${d.getMonth()}`
        if (
          due !== null &&
          sameWay &&
          !usedBill.has(key) &&
          Math.abs(Math.abs(r.amount) - b.amount) <= b.amount * 0.1 &&
          Math.abs(d.getDate() - due) <= 3 &&
          (merchantKey(b.name) === merchantKey(r.merchant) ||
            Math.abs(Math.abs(r.amount) - b.amount) < 0.01)
        ) {
          recurringId = b._id
          usedBill.add(key)
          break
        }
      }
    }
    return {
      index,
      occurredAt: r.occurredAt,
      time: r.time ?? null,
      merchant: r.merchant,
      raw: r.raw,
      amount: r.amount,
      currency: r.currency,
      pending: r.pending,
      kind,
      category,
      categorySource:
        kind !== 'spend'
          ? null
          : rule
            ? ('rule' as const)
            : r.category
              ? ('reader' as const)
              : null,
      /* The institution the line names, then an ending only one other
         account has — never the card that paid (src/lib/otherSide.ts). */
      otherAccountId: move
        ? ((pickOtherSide(r, sides, hereSide) as Id<'accounts'> | null) ??
          byBank(accounts, here, `${r.counterparty ?? ''} ${r.raw}`))
        : null,
      counterparty: r.counterparty ?? null,
      duplicateOf: dups[index] === null ? null : existing[dups[index]]._id,
      counted: dups[index] === null && counted.has(index),
      twinOf: dups[index] === null && !r.pending ? twinOf(r) : null,
      recurringId,
    }
  })

  /* Things that come round — in this file together with what he has. */
  const history = here
    ? await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', here)
            .gte('occurredAt', from - 70 * 86_400_000),
        )
        .take(HISTORY_ROWS)
    : []
  const pool = [
    ...read.filter((r) => !r.self && !r.pending),
    ...history
      .filter((l) => l.kind === 'expense')
      .map((l) => ({
        occurredAt: l.occurredAt,
        amount: -(l.value ?? 0),
        merchant: l.meta?.merchant ?? l.text ?? '',
      })),
  ]
  const seen = new Set<string>()
  const unique = pool.filter((r) => {
    const k = `${merchantKey(r.merchant)}:${r.amount}:${new Date(r.occurredAt).toDateString()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const recurring = findRecurring(unique).map((r) => ({
    merchant: r.merchant,
    amount: r.amount,
    day: r.day,
    months: r.months,
    alreadyABill: liveBills.some(
      (b) =>
        merchantKey(b.name) === r.key ||
        Math.abs(b.amount - Math.abs(r.amount)) < 0.01,
    ),
  }))

  return {
    accountId,
    guessedAccountId: guessed,
    suggest: here === null ? suggestFor(intake) : null,
    rows,
    recurring,
  }
}

/* Endings not yet known on any of his accounts are kept on this one
   (four at most): the next file that prints one is matched without
   asking. One already another account's stays that account's (11 Oct:
   ActivoBank's card 2789 was kept as Revolut's too). */
export async function learnTails(
  ctx: MutationCtx,
  account: Doc<'accounts'>,
  tails: ReadonlyArray<string>,
) {
  const fresh = await ctx.db.get(account._id)
  if (fresh === null) return
  const all = await ctx.db
    .query('accounts')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', fresh.ownerId))
    .take(50)
  const known = all.flatMap((a) => [
    ...(a.ibanTails ?? []),
    ...(a.cardTails ?? []),
  ])
  const add = tails.filter((t) => !known.includes(t))
  if (add.length === 0) return
  await ctx.db.patch(account._id, {
    ibanTails: [...(fresh.ibanTails ?? []), ...add].slice(-4),
  })
}

/**
 * A transfer already in another of his accounts that this row is the other
 * side of: a move of `amount` (signed as that account sees it) within two
 * days, with no side paired to it yet.
 */
export async function openSide(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  amount: number,
  occurredAt: number,
): Promise<Doc<'logs'> | null> {
  const near = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', accountId)
        .gte('occurredAt', occurredAt - 2 * DAY_MS - 3_600_000)
        .lte('occurredAt', occurredAt + 2 * DAY_MS + 3_600_000),
    )
    .take(200)
  for (const l of near) {
    if (l.kind !== 'move' || Math.abs((l.value ?? 0) - amount) > 0.005) continue
    if (l.meta?.pairOf !== undefined) continue
    if ((await transferPair(ctx, ownerId, l)) !== null) continue
    return l
  }
  return null
}

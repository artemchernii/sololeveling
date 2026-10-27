import { v } from 'convex/values'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { MAX_BATCH_FILES, matchAccount } from '../../src/lib/intake'
import { productByIban, productIn } from '../../src/lib/institutions'
import { ownTail } from '../../src/lib/otherSide'

/* Caps and small lookups shared by intake.ts and the files beside it. */

/* The intake (Treasury, 27 Sep): what he drops on + becomes a list he
   checks. `start` stores the files and asks the reader (ai/intake.ts);
   `review` is the smart part — it lays the rows against what he already
   has: duplicates, moves between his own accounts, merchants he taught,
   bills that match, things that come round; `confirmTransactions` and
   `confirmHoldings` write only what he kept. Nothing is a log, a trade or
   a balance before that. */
export const MAX_TRADES = 2000

export const HISTORY_ROWS = 3000

export const DAY_MS = 86_400_000

/** His filed payees one review may read to find a row's group. */
export const RULES_READ = 400

/* Whose money is his: the name the statement printed, and the name he
   signed in with. A transfer from either is a move, never income. */
export async function hisNames(
  ctx: QueryCtx,
  intake: Doc<'intakes'>,
): Promise<Array<string>> {
  const identity = await ctx.auth.getUserIdentity()
  return [
    intake.holderName,
    identity?.name,
    ...(await namesOnFiles(ctx, intake.ownerId)),
  ].filter((n): n is string => typeof n === 'string' && n.trim() !== '')
}

/* The holder's name as his other statements printed it — a screenshot
   prints none (3 Oct: BPI's screens), and a sign-in may carry no name. */
export async function namesOnFiles(ctx: QueryCtx, ownerId: string) {
  const recent = await ctx.db
    .query('intakes')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .take(30)
  return [
    ...new Set(recent.flatMap((i) => (i.holderName ? [i.holderName] : []))),
  ]
}

/* His account at the bank an IBAN in the text belongs to (PT50 0023 … is
   ActivoBank) — only when he has exactly one there, and not this one. */
export function byBank(
  accounts: ReadonlyArray<Doc<'accounts'>>,
  here: Id<'accounts'> | null,
  text: string,
): Id<'accounts'> | null {
  const p = productByIban(text)
  if (!p) return null
  const at = accounts.filter(
    (a) => a.institution === p.institution && a._id !== here,
  )
  return at.length === 1 ? at[0]._id : null
}

/* How long a confirmed file is kept to open again (3 Oct): a quarter,
   long enough to check a month against its statement twice over. */
export const KEEP_FILES_MS = 90 * 86_400_000

export const keepUntil = () => Date.now() + KEEP_FILES_MS

export const suggestion = v.union(
  v.null(),
  v.object({
    product: v.string(),
    name: v.string(),
    accountTail: v.union(v.string(), v.null()),
  }),
)

/* His account a set of four-digit endings points at — IBAN or card. */
export function byTail(
  accounts: ReadonlyArray<Doc<'accounts'>>,
  tails: ReadonlyArray<string>,
): Id<'accounts'> | null {
  for (const t of tails) {
    const a = accounts.find(
      (x) => x.ibanTails?.includes(t) || x.cardTails?.includes(t),
    )
    if (a) return a._id
  }
  return null
}

/**
 * Which of his accounts a file is about: by the IBAN or card ending it
 * prints, then by the bank's name — the most specific product first, so a
 * Revolut Invest screen is Revolut Invest, not Revolut.
 */
export function guessAccount(
  intake: Doc<'intakes'>,
  accounts: ReadonlyArray<Doc<'accounts'>>,
): Id<'accounts'> | null {
  const tail = ownTail(intake.accountTail, intake.transactions ?? [])
  if (tail) {
    const hit = byTail(accounts, [tail])
    if (hit) return hit
  }
  const product = productIn(intake.institution)
  if (product) {
    /* Holdings and trades are a broker's, whatever the bank is called. */
    const want = intake.kind === 'transactions' ? 'bank' : 'broker'
    const same = accounts.filter((a) => a.institution === product.institution)
    const fit = same.find((a) => a.kinds.includes(want)) ?? same.at(0)
    if (fit) return fit._id
  }
  if (!intake.institution) return null
  return matchAccount(
    intake.institution,
    accounts.map((a) => ({ id: a._id, name: a.name, domain: a.domain })),
  ) as Id<'accounts'> | null
}

/* A bank the app knows and he has not added: "Create Revolut?" */
export function suggestFor(intake: Doc<'intakes'>) {
  const p = productIn(intake.institution)
  if (!p) return null
  return {
    product: p.id,
    name: p.name,
    accountTail: intake.accountTail ?? null,
  }
}

export async function batchIntakes(
  ctx: QueryCtx,
  ownerId: string,
  batchId: Id<'batches'>,
): Promise<Array<Doc<'intakes'>>> {
  return await ctx.db
    .query('intakes')
    .withIndex('by_owner_batch', (q) =>
      q.eq('ownerId', ownerId).eq('batchId', batchId),
    )
    .take(MAX_BATCH_FILES)
}

export async function liveAccounts(ctx: QueryCtx, ownerId: string) {
  return (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
  ).filter((a) => a.retiredAt === undefined)
}

/* Which account a file is heading for while it is still being read: his
   pick, or the guess from what the reader has found so far. */
export function headingFor(
  intake: Doc<'intakes'>,
  accounts: ReadonlyArray<Doc<'accounts'>>,
): Id<'accounts'> | null {
  if (intake.accountId) return intake.accountId
  const seen = {
    ...intake,
    institution: intake.institution ?? intake.progress?.institution,
    accountTail: intake.accountTail ?? intake.progress?.accountTail,
    kind: intake.kind ?? intake.progress?.kind,
  }
  return guessAccount(seen, accounts)
}

/* A balance read off a picture is a screenshot's; off a PDF or CSV, a
   statement's. */
export function sourceOf(
  intake: Doc<'intakes'>,
): 'statement' | 'screenshot' | 'sync' {
  if (intake.via === 'bank') return 'sync'
  return (intake.files ?? []).some((f) => f.contentType.startsWith('image/'))
    ? 'screenshot'
    : 'statement'
}

/* The first moment of a "2026-03" month, or `plus` months after it. */
export function monthStart(key: string, plus = 0): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1 + plus, 1).getTime()
}

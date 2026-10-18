import { ConvexError, v } from 'convex/values'

import {
  approvalEnds,
  aspspFor,
  canConnect,
  pickAccounts,
} from '../src/lib/bankLink'
import { arrivedFromBank, changedAtBroker } from './aggregate'
import { requireUser } from './auth'
import { bankApi } from './bankApi'
import { CHECK_LOST_MS, pull } from './bankRows'
import { internal } from './_generated/api'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { Id } from './_generated/dataModel'

/* A connected bank (11 Oct, docs/specs/2026-10-11-bank-connections.md),
   slice 1: connect and approve again. What the bank then reports — its
   balance and its booked rows — is read and stored by convex/bankRows.ts.

   The balance is an external reading (PLAN.md §1 source 4): stored — a
   `stateSnapshots` row written by `bankRows.arrive`, never fetched by a page;
   attributed — source 'sync' on the row, the bank on the link; as of a time
   — the row's `recordedAt`, the moment the bank answered; not a licence to
   derive — nothing is computed from it here. The whole reading or none: a
   currency the bank gave no balance for stops the save. */

const account = v.object({
  uid: v.string(),
  currency: v.string(),
  iban: v.optional(v.string()),
  name: v.optional(v.string()),
})

/** Which accounts are connected, and until when. No session, no ids. */
export const links = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      status: v.union(
        v.literal('pending'),
        v.literal('choose'),
        v.literal('linked'),
      ),
      validUntil: v.union(v.number(), v.null()),
      checkedAt: v.union(v.number(), v.null()),
      /* A check of the bank is running. */
      checking: v.boolean(),
      /* Rows that did not add up: the update that asks about them. */
      question: v.union(v.id('batches'), v.null()),
      /* Rows the bank brought, saved, and not closed with ✕ yet. */
      arrived: v.union(
        v.object({
          rows: v.number(),
          currency: v.string(),
          was: v.number(),
          wasAt: v.number(),
          out: v.number(),
          in: v.number(),
          now: v.number(),
        }),
        v.null(),
      ),
      choices: v.array(
        v.object({
          uid: v.string(),
          name: v.union(v.string(), v.null()),
          tail: v.union(v.string(), v.null()),
        }),
      ),
      /* Read from Trading 212's own API (convex/t212.ts): no approval. */
      via: v.union(v.literal('t212'), v.null()),
      /* Its last check wrote nothing, and why. */
      failed: v.union(v.literal('refused'), v.literal('down'), v.null()),
      /* What its answers changed, until closed with ✕. */
      changed: v.union(
        v.object({
          at: v.number(),
          cash: v.union(
            v.object({
              currency: v.string(),
              was: v.number(),
              now: v.number(),
            }),
            v.null(),
          ),
          lines: v.array(
            v.object({
              symbol: v.string(),
              name: v.string(),
              type: v.string(),
              was: v.number(),
              now: v.number(),
              wasEur: v.union(v.number(), v.null()),
              nowEur: v.union(v.number(), v.null()),
            }),
          ),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(50)
    const now = Date.now()
    const out = []
    for (const r of rows) {
      /* A question he answered is rows that arrived (bankRows.begin moves
         it over at the next check; until then it is read as one here). */
      let question: Id<'batches'> | null = null
      const saved = [...(r.arrived ?? [])]
      for (const id of r.questions ?? []) {
        const b = await ctx.db.get(id)
        if (b === null) continue
        if (b.status !== 'done') {
          question ??= id
          continue
        }
        const files = await ctx.db
          .query('intakes')
          .withIndex('by_owner_batch', (q) =>
            q.eq('ownerId', ownerId).eq('batchId', id),
          )
          .take(5)
        saved.push(...files.map((f) => f._id))
      }
      const held = r.changed ? await ctx.db.get(r.accountId) : null
      const changed =
        r.changed && held
          ? await changedAtBroker(ctx, ownerId, held, r.changed)
          : null
      out.push({ r, question, saved, changed })
    }
    return await Promise.all(
      out.map(async ({ r, question, saved, changed }) => ({
        accountId: r.accountId,
        status: r.status,
        validUntil: r.validUntil ?? null,
        checkedAt: r.checkedAt ?? null,
        checking: r.checking !== undefined && now - r.checking < CHECK_LOST_MS,
        question,
        arrived:
          saved.length === 0
            ? null
            : await arrivedFromBank(ctx, ownerId, r.accountId, saved),
        choices: (r.status === 'choose' ? (r.choices ?? []) : []).map((c) => ({
          uid: c.uid,
          name: c.name ?? null,
          tail: c.iban?.slice(-4) ?? null,
        })),
        via: r.via ?? null,
        failed: r.failed?.why ?? null,
        changed,
      })),
    )
  },
})

/** Before the bank's page: the account is his, a bank the app can reach,
    and a one-time word is kept to know the answer by. */
export const begin = internalMutation({
  args: { ownerId: v.string(), accountId: v.id('accounts'), state: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.accountId)
    if (row === null || row.ownerId !== args.ownerId || row.retiredAt)
      throw new ConvexError('No such account.')
    if (!canConnect(row.institution))
      throw new ConvexError(`${row.name} cannot be connected.`)
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', args.ownerId).eq('accountId', args.accountId),
      )
      .unique()
    if (link === null)
      await ctx.db.insert('bankLinks', {
        ownerId: args.ownerId,
        accountId: args.accountId,
        status: 'pending',
        state: args.state,
        startedAt: Date.now(),
      })
    /* Approving again keeps what the link has until the bank answers. */
    else await ctx.db.patch(link._id, { state: args.state })
    return row.institution as string
  },
})

/** The link a returning one-time word belongs to, with what picks its
    account at the bank. */
export const waiting = internalQuery({
  args: { ownerId: v.string(), state: v.string() },
  returns: v.object({
    currencies: v.array(v.string()),
    ibanTails: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_state', (q) =>
        q.eq('ownerId', args.ownerId).eq('state', args.state),
      )
      .unique()
    const row = link === null ? null : await ctx.db.get(link.accountId)
    if (row === null) throw new ConvexError('This approval is not open.')
    return { currencies: row.currencies, ibanTails: row.ibanTails ?? [] }
  },
})

/** The bank answered: the link is kept — or the choice of account is kept
    to be asked. */
export const land = internalMutation({
  args: {
    ownerId: v.string(),
    state: v.string(),
    bank: v.string(),
    country: v.string(),
    sessionId: v.string(),
    validUntil: v.number(),
    uids: v.array(v.object({ uid: v.string(), currency: v.string() })),
    choices: v.array(account),
  },
  returns: v.id('accounts'),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_state', (q) =>
        q.eq('ownerId', args.ownerId).eq('state', args.state),
      )
      .unique()
    const row = link === null ? null : await ctx.db.get(link.accountId)
    if (link === null || row === null)
      throw new ConvexError('This approval is not open.')
    const choosing = args.uids.length === 0
    await ctx.db.patch(link._id, {
      status: choosing ? 'choose' : 'linked',
      /* Kept while he picks; used up once the account is known. */
      state: choosing ? args.state : undefined,
      bank: args.bank,
      country: args.country,
      sessionId: args.sessionId,
      validUntil: args.validUntil,
      uids: choosing ? undefined : args.uids,
      choices: choosing ? args.choices : undefined,
      /* Approved again: a key it rejected before is history. */
      failed: undefined,
    })
    return row._id
  },
})

/** He cancelled on the bank's page, or it failed: nothing changed. A link
    that never worked is removed; one that did keeps what it has. */
export const cancel = mutation({
  args: { state: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_state', (q) =>
        q.eq('ownerId', ownerId).eq('state', args.state),
      )
      .unique()
    if (link === null) return null
    if (link.checkedAt === undefined) await ctx.db.delete(link._id)
    else await ctx.db.patch(link._id, { state: undefined })
    return null
  },
})

/** CONNECT or APPROVE pressed: the bank's own page to open. */
export const connect = action({
  args: { accountId: v.id('accounts') },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const ownerId = await requireUser(ctx)
    const state = crypto.randomUUID()
    const institution: string = await ctx.runMutation(internal.bank.begin, {
      ownerId,
      accountId: args.accountId,
      state,
    })
    const api = bankApi()
    const bank = aspspFor(institution, await api.aspsps())
    if (bank === null)
      throw new ConvexError('Enable Banking does not list this bank.')
    return await api.auth({
      bank,
      state,
      validUntil: approvalEnds(Date.now(), bank),
    })
  },
})

/** Back from the bank's page with its code: the link is kept and the bank
    is read (bankRows.pull), or its accounts are kept to pick from. */
export const finish = action({
  args: {
    code: v.string(),
    state: v.string(),
    dayStart: v.number(),
  },
  returns: v.object({
    accountId: v.id('accounts'),
    status: v.union(v.literal('linked'), v.literal('choose')),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ accountId: Id<'accounts'>; status: 'linked' | 'choose' }> => {
    const ownerId = await requireUser(ctx)
    const mine: { currencies: Array<string>; ibanTails: Array<string> } =
      await ctx.runQuery(internal.bank.waiting, {
        ownerId,
        state: args.state,
      })
    const api = bankApi()
    const session = await api.session(args.code)
    const picked = pickAccounts(
      session.accounts,
      mine.currencies,
      mine.ibanTails,
    )
    if (picked.kind === 'none')
      throw new ConvexError('The bank showed no account in this currency.')
    const accountId: Id<'accounts'> = await ctx.runMutation(
      internal.bank.land,
      {
        ownerId,
        state: args.state,
        bank: session.bank,
        country: session.country,
        sessionId: session.sessionId,
        validUntil: session.validUntil,
        uids: picked.kind === 'found' ? picked.accounts : [],
        choices: picked.kind === 'choose' ? picked.choices : [],
      },
    )
    if (picked.kind === 'found')
      await pull(ctx, ownerId, accountId, args.dayStart)
    return { accountId, status: picked.kind === 'found' ? 'linked' : 'choose' }
  },
})

/** What a pick out of several needs: the session the bank opened. */
export const picking = internalQuery({
  args: { ownerId: v.string(), accountId: v.id('accounts') },
  returns: v.object({
    state: v.string(),
    bank: v.string(),
    country: v.string(),
    sessionId: v.string(),
    validUntil: v.number(),
    choices: v.array(account),
  }),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', args.ownerId).eq('accountId', args.accountId),
      )
      .unique()
    if (
      link === null ||
      link.status !== 'choose' ||
      link.state === undefined ||
      link.sessionId === undefined ||
      link.validUntil === undefined
    )
      throw new ConvexError('Nothing to pick here.')
    return {
      state: link.state,
      bank: link.bank ?? '',
      country: link.country ?? '',
      sessionId: link.sessionId,
      validUntil: link.validUntil,
      choices: link.choices ?? [],
    }
  },
})

/** "Which one is this card?" answered: that account's balance is read and
    stored. */
export const choose = action({
  args: { accountId: v.id('accounts'), uid: v.string(), dayStart: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ownerId = await requireUser(ctx)
    const open: {
      state: string
      bank: string
      country: string
      sessionId: string
      validUntil: number
      choices: Array<{ uid: string; currency: string }>
    } = await ctx.runQuery(internal.bank.picking, {
      ownerId,
      accountId: args.accountId,
    })
    const picked = open.choices.find((c) => c.uid === args.uid)
    if (picked === undefined) throw new ConvexError('Not one of the accounts.')
    await ctx.runMutation(internal.bank.land, {
      ownerId,
      state: open.state,
      bank: open.bank,
      country: open.country,
      sessionId: open.sessionId,
      validUntil: open.validUntil,
      uids: [{ uid: picked.uid, currency: picked.currency }],
      choices: [],
    })
    await pull(ctx, ownerId, args.accountId, args.dayStart)
    return null
  },
})

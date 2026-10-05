import { useEffect, useMemo, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  TrendingUp,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { groupIcon } from '@/components/finances/GroupBadge'
import { usePayees } from '@/components/finances/flow/Payees'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import {
  FileBadge,
  HistoryReview,
  IntakeStrip,
  ReadBy,
  ReadingSheet,
} from '@/components/finances/Reading'
import { useDayStarts } from '@/components/track/useDayStarts'
import { failureMessage } from '@/lib/convex-errors'
import { money } from '@/lib/currency'
import { dayLabel } from '@/lib/bills'
import { completePosition, merchantKey, sameCompany } from '@/lib/intake'
import { productById, searchProducts } from '@/lib/institutions'
import { tickerBase } from '@/lib/market'
import type { Candidate } from '@/lib/market'
import { SPEND_CATEGORIES, categoryLabel, euros } from '@/lib/money'
import { checkCryptoStatement } from '@/lib/crypto'
import { addLabel, groupByDay, rowsSpan } from '@/lib/checkFile'
import { STALE_MS } from '@/lib/freshness'

/* What he dropped, from reading to confirmed (Treasury, 27 Sep). The
   review is the product: the reader's guesses laid against what he has
   (intake.review), with the unsure ones first, one fix for every row of a
   merchant, his own money moving kept apart from spending, pending held
   back, duplicates skipped — and nothing written until he confirms.
   Discard goes back one step, as he asked. */

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

export function IntakeFlow({
  intakeId,
  onBack,
  onDone,
}: {
  intakeId: Id<'intakes'>
  onBack: () => void
  onDone: () => void
}) {
  const row = useQuery(api.intake.one, { intakeId })
  const discard = useMutation(api.intake.discard)
  const found = row && row.status !== 'done' ? row : undefined
  /* A confirmed one leaves the open list the moment it lands — keep
     showing it, so its review can say what landed (27 Sep: he got "done
     or gone" instead). */
  const [last, setLast] = useState<Doc<'intakes'> | null>(null)
  useEffect(() => {
    if (found) setLast(found)
  }, [found])
  const intake = found ?? (last?._id === intakeId ? last : undefined)
  const throwAway = () => void discard({ intakeId }).then(onBack)

  /* Loading holds the space quietly: a flash of "reading" for a few
     milliseconds is the flicker he kept seeing. */
  if (row === undefined) return <div className="min-h-[240px]" />
  if (intake === undefined) {
    return (
      <p className="py-6 text-center text-[13.5px] text-ink-400">
        This one is done or gone.
      </p>
    )
  }
  if (intake.status === 'reading' || intake.status === 'failed')
    return <ReadingSheet intake={intake} onBack={onBack} />
  if (intake.kind === 'trades' && intake.historyTrades !== undefined)
    return <HistoryReview intake={intake} onDiscard={throwAway} />
  return intake.kind === 'holdings' ? (
    <HoldingsReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  ) : intake.kind === 'trades' &&
    (intake.trades ?? []).length > 0 &&
    (intake.trades ?? []).every((t) => t.crypto) ? (
    <CryptoReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  ) : intake.kind === 'trades' ? (
    <TradesReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  ) : (
    <TransactionsReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  )
}

/** Open intakes on the page — for one he closed while it was reading. */
export function OpenIntakes({
  onOpen,
}: {
  onOpen: (id: Id<'intakes'>) => void
}) {
  const open = useQuery(api.intake.open, {})
  if (!open || open.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {open.map((i) => (
        <IntakeStrip key={i._id} intake={i} onOpen={() => onOpen(i._id)} />
      ))}
    </div>
  )
}

/* ---- Transactions ------------------------------------------------------ */

/* Banks and brokers the reader names often enough to recognise by name,
   so a move to one he has not added can become an account in one click. */
const INSTITUTIONS = [
  {
    match: /trading\s*212|\bt212\b/i,
    name: 'Trading 212',
    kind: 'broker' as const,
    domain: 'trading212.com',
  },
  {
    match: /trade\s*republic/i,
    name: 'Trade Republic',
    kind: 'broker' as const,
    domain: 'traderepublic.com',
  },
  {
    match: /revolut/i,
    name: 'Revolut',
    kind: 'bank' as const,
    domain: 'revolut.com',
  },
  {
    match: /\bbpi\b|banco bpi/i,
    name: 'BPI',
    kind: 'bank' as const,
    domain: 'bancobpi.pt',
  },
  {
    match: /activo/i,
    name: 'Activo',
    kind: 'bank' as const,
    domain: 'activobank.pt',
  },
  {
    match: /interactive brokers|\bibkr\b/i,
    name: 'Interactive Brokers',
    kind: 'broker' as const,
    domain: 'interactivebrokers.com',
  },
  {
    match: /\bxtb\b/i,
    name: 'XTB',
    kind: 'broker' as const,
    domain: 'xtb.com',
  },
  {
    match: /degiro/i,
    name: 'DEGIRO',
    kind: 'broker' as const,
    domain: 'degiro.com',
  },
  {
    match: /\bwise\b/i,
    name: 'Wise',
    kind: 'bank' as const,
    domain: 'wise.com',
  },
]

function knownInstitution(text: string) {
  return INSTITUTIONS.find((i) => i.match.test(text)) ?? null
}

type Choice = {
  kind: 'spend' | 'income' | 'move'
  category: string | null
  other: Id<'accounts'> | null
  keep: boolean
}

function TransactionsReview({
  intake,
  onDiscard,
  onDone,
}: {
  intake: Doc<'intakes'>
  onDiscard: () => void
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const review = useQuery(api.intake.review, { intakeId: intake._id })
  const accounts = useQuery(api.accounts.list, {}) ?? []
  const setAccount = useMutation(api.intake.setAccount)
  const setBalance = useMutation(api.accounts.setBalance)
  const balances = useQuery(api.aggregate.balances, {})
  const [landed, setLanded] = useState<{
    count: number
    months: Array<string>
    orders?: { written: number; skipped: number; noTicker: number }
    /* Kept from before: once done, the review that named it is gone. */
    accountName?: string
    accountId?: Id<'accounts'>
    noun?: string
    balance?: { value: number; currency: string; asOf: number }
    others?: Array<{ currency: string; value: number }>
  } | null>(null)
  const confirm = useMutation(api.intake.confirmTransactions)
  const addBill = useMutation(api.recurring.create)
  const createAccount = useMutation(api.accounts.create)
  /* A move to a broker or bank he has not added yet: one click makes the
     account (its real name, kind and logo) and links the row to it. */
  async function addAccountFor(index: number, counterparty: string) {
    const inst = knownInstitution(counterparty)
    if (!inst) return
    const id = await createAccount({
      name: inst.name,
      kinds: [inst.kind],
      currencies: ['EUR'],
      domain: inst.domain,
    })
    set(index, { other: id })
  }
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [keepBalance, setKeepBalance] = useState(true)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [fixed, setFixed] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* The review's rows arrive (and re-arrive when he picks the account);
     his choices sit on top, keyed by row. */
  useEffect(() => {
    if (!review) return
    setChoices((prev) => {
      const next: Record<number, Choice> = {}
      for (const r of review.rows) {
        next[r.index] = prev[r.index] ?? {
          kind: r.kind,
          category: r.category,
          other: r.otherAccountId,
          keep: !r.pending && r.duplicateOf === null,
        }
      }
      return next
    })
  }, [review])

  const accountId = review?.accountId ?? review?.guessedAccountId ?? null
  const account = accounts.find((a) => a._id === accountId)

  /* What landed comes first: once confirmed, the file is done and its
     review is gone (3 Oct: he confirmed and got an empty sheet). */
  if (landed)
    return (
      <Landed
        {...landed}
        account={landed.accountName ?? account?.name}
        onDone={onDone}
      />
    )
  if (review === undefined) return <div className="min-h-[240px]" />
  if (review === null) return null

  const rows = review.rows
  const pending = rows.filter((r) => r.pending)
  const dups = rows.filter((r) => !r.pending && r.duplicateOf !== null)
  const live = rows.filter((r) => !r.pending && r.duplicateOf === null)
  const ch = (i: number) => choices[i] as Choice | undefined
  const moves = live.filter((r) => ch(r.index)?.kind === 'move')
  const money_ = live.filter((r) => ch(r.index)?.kind !== 'move')
  const cur = rows[0]?.currency ?? 'EUR'
  /* Only what is new (3 Oct: three overlapping screenshots counted the
     rows the statement had already brought in — "what do you mean
     spent?"). What it already had is said under the list. */
  const spent = money_
    .filter((r) => ch(r.index)?.keep && ch(r.index)?.kind === 'spend')
    .reduce((t, r) => t + r.amount, 0)
  const kept = live.filter((r) => ch(r.index)?.keep)

  function set(i: number, patch: Partial<Choice>) {
    setChoices((c) => ({ ...c, [i]: { ...c[i], ...patch } }))
  }
  /* One fix, every row of that merchant — remembered on confirm. */
  function fixAll(merchant: string, category: string) {
    const key = merchantKey(merchant)
    setChoices((c) => {
      const next = { ...c }
      for (const r of rows)
        if (merchantKey(r.merchant) === key && next[r.index].kind === 'spend')
          next[r.index] = { ...next[r.index], category }
      return next
    })
    const n = rows.filter((r) => merchantKey(r.merchant) === key).length
    setFixed(
      `${merchant} → ${categoryLabel('expense', category)} · ${n} row${n > 1 ? 's' : ''} · remembered for next time`,
    )
  }

  async function save() {
    if (!accountId) {
      setError('Pick which account this is.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      /* The account's other pockets, as they stand (5 Oct: "When I upload
         csv it means usd should be updated as well"). Revolut exports one
         currency a file; a EUR statement says USD did not move, so USD is
         kept as is, as of the statement's day — shown before he confirms. */
      const others = keepsBalance ? otherPockets : []
      const done = await confirm({
        intakeId: intake._id,
        accountId,
        dayStart: today,
        keepBalance: keepBalance && intake.balance !== undefined,
        rows: kept.map((r) => {
          const c = choices[r.index]
          return {
            index: r.index,
            kind: c.kind,
            category: c.kind === 'spend' ? (c.category ?? 'other') : undefined,
            otherAccountId:
              c.kind === 'move' ? (c.other ?? undefined) : undefined,
            recurringId:
              c.kind !== 'move' ? (r.recurringId ?? undefined) : undefined,
          }
        }),
      })
      for (const p of others)
        await setBalance({
          accountId,
          currency: p.currency,
          value: p.value,
          dayStart: today,
          asOf: intake.balance?.asOf,
        })
      /* Rows that went into another month than this one: say where, and
         open that month in Flow (27 Sep: "Flow is not updated at all" —
         his August statement had gone into August). */
      const key = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const months = [
        ...new Set(kept.map((r) => key(new Date(r.occurredAt)))),
      ].sort()
      const orders =
        done.trades.written + done.trades.skipped + done.trades.noTicker > 0
          ? done.trades
          : undefined
      /* Always seen to land (5 Oct: "There should be some animation when
         I click confirm add payments? Nothing happened"). */
      setLanded({
        count: kept.length,
        months,
        orders,
        accountName: account?.name,
        accountId,
        noun: noun(kept.length),
        balance: keepsBalance ? intake.balance : undefined,
        others,
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
          : 'Not saved',
      )
      setSaving(false)
    }
  }

  /* The answer in words first (5 Oct, mockup check.html: "new money out,
     of it spent … I was fighting these not clear text"). */
  const spends = kept.filter((r) => ch(r.index)?.kind === 'spend')
  const ins = kept.filter((r) => ch(r.index)?.kind === 'income')
  const cameIn = ins.reduce((t, r) => t + r.amount, 0)
  const allPayments =
    live.length > 0 && live.every((r) => ch(r.index)?.kind === 'spend')
  const noun = (n: number) =>
    allPayments ? (n === 1 ? 'payment' : 'payments') : n === 1 ? 'row' : 'rows'
  const keepsBalance = intake.balance !== undefined && keepBalance
  const otherPockets = (
    balances?.accounts.find((a) => a.accountId === accountId)?.pockets ?? []
  ).flatMap((p) =>
    p.currency !== intake.balance?.currency && p.value !== null
      ? [{ currency: p.currency, value: p.value }]
      : [],
  )
  const orders = (intake.trades ?? []).length
  const span = rowsSpan(rows.map((r) => r.occurredAt))
  /* Newest first, one heading a day, each row its printed time. */
  const byDay = groupByDay(
    [...live].sort(
      (a, b) =>
        b.occurredAt - a.occurredAt ||
        (b.time ?? '').localeCompare(a.time ?? ''),
    ),
  )
  let shown = 0

  return (
    <div className="motion-arrive flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <FileBadge intake={intake} />
        <span className="min-w-[200px] flex-1 text-[15.5px] text-foreground">
          {account?.name ?? intake.institution ?? 'Statement'}
          {span ? ` · ${span}` : ''}
        </span>
        <span className="font-mono text-[10.5px] text-ink-500">
          <ReadBy intake={intake} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {accounts.map((a) => (
          <button
            key={a._id}
            type="button"
            aria-pressed={accountId === a._id}
            onClick={() =>
              void setAccount({ intakeId: intake._id, accountId: a._id })
            }
            className={`motion-press inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-[12.5px] ring-1 ring-inset ${accountId === a._id ? 'bg-lav-400/12 text-foreground ring-lav-400/55' : 'text-ink-300 ring-lift/12 hover:text-foreground'}`}
          >
            <AccountLogo name={a.name} domain={a.domain} size={18} />
            {a.name}
          </button>
        ))}
        {!accountId && review.suggest ? (
          <CreateSuggested
            suggest={review.suggest}
            onCreated={(id) =>
              void setAccount({ intakeId: intake._id, accountId: id })
            }
          />
        ) : !accountId ? (
          <span className="font-mono text-[11px] text-state-warn">
            whose is it?
          </span>
        ) : null}
        <AnotherAccount
          want="bank"
          have={accounts}
          onCreated={(id) =>
            void setAccount({ intakeId: intake._id, accountId: id })
          }
        />
      </div>

      <p className="text-[18px] leading-snug font-light text-ink-200">
        {live.length === 0 ? (
          <>
            <b className="font-normal text-foreground">Nothing new</b>.
            {dups.length > 0
              ? ` You already have ${dups.length === 1 ? 'it' : `all ${dups.length} rows`}.`
              : ''}
          </>
        ) : (
          <>
            <b className="font-normal text-foreground">
              {live.length} new {noun(live.length)}
            </b>
            .
            {dups.length > 0
              ? ` The other ${dups.length} ${dups.length === 1 ? 'row' : 'rows'} you already have.`
              : ''}
            {moves.length > 0
              ? ` ${moves.length} ${moves.length === 1 ? 'is a move' : 'are moves'} between your own accounts.`
              : ''}
          </>
        )}
        {pending.length > 0 ? ` ${pending.length} not finished yet.` : ''}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi
          label="spent"
          value={money(Math.round(spent * 100) / 100, cur)}
          tone={spends.length > 0 ? 'bad' : undefined}
          note={
            spends.length === 0
              ? 'nothing'
              : `${spends.length} ${spends.length === 1 ? 'payment' : 'payments'}`
          }
        />
        <Kpi
          label="came in"
          value={`${cameIn > 0 ? '+' : ''}${money(Math.round(cameIn * 100) / 100, cur)}`}
          tone={ins.length > 0 ? 'good' : undefined}
          note={
            ins.length === 0
              ? 'nothing'
              : `${ins.length} ${ins.length === 1 ? 'payment' : 'payments'}`
          }
        />
        {intake.balance ? (
          <button
            type="button"
            aria-pressed={keepBalance}
            onClick={() => setKeepBalance((k) => !k)}
            className={`motion-press flex flex-col gap-1 rounded-[12px] p-3 text-left ring-1 ring-inset ${keepBalance ? 'bg-lav-400/10 ring-lav-400/45' : 'bg-lift/[0.035] ring-lift/10'}`}
          >
            <span className="label-caps flex items-center gap-1.5">
              {keepBalance ? <Check className="size-3 text-lav-400" /> : null}
              balance · {DAY_FMT.format(new Date(intake.balance.asOf))}
            </span>
            <span className="text-[19px] font-light text-foreground">
              {money(intake.balance.value, intake.balance.currency)}
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {keepBalance
                ? `becomes ${account?.name ?? 'its'} ${intake.balance.currency} cash`
                : 'not used'}
            </span>
            {keepBalance && otherPockets.length > 0 ? (
              <span className="font-mono text-[10.5px] text-ink-500">
                {otherPockets
                  .map((p) => `${p.currency} ${money(p.value, p.currency)}`)
                  .join(', ')}{' '}
                kept as is
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {orders > 0 ? (
        <OrdersFound orders={intake.trades ?? []} account={account ?? null} />
      ) : null}

      {review.recurring.filter((x) => !x.alreadyABill).length > 0 ? (
        <Section title="↻ comes every month" aside="add as a bill?">
          {review.recurring
            .filter((x) => !x.alreadyABill)
            .map((x) => {
              const k = `${x.merchant}:${x.amount}`
              return (
                <div
                  key={k}
                  className="flex items-center gap-3 border-t border-lift/[0.04] py-2 text-[13.5px]"
                >
                  <span className="w-12 font-mono text-[11px] text-ink-500">
                    {dayLabel(x.day)}
                  </span>
                  <span className="flex-1">
                    {x.merchant}
                    <span className="block font-mono text-[10.5px] text-ink-500">
                      {x.months} months in a row, same amount
                    </span>
                  </span>
                  <span className="font-mono">{money(x.amount, cur)}</span>
                  <button
                    type="button"
                    disabled={added.has(k)}
                    onClick={() =>
                      void addBill({
                        name: x.merchant,
                        kind: 'expense',
                        amount: Math.abs(x.amount),
                        cadence: 'monthly',
                        day: x.day,
                        accountId: accountId ?? undefined,
                        category: 'subscriptions',
                      }).then(() => setAdded(new Set(added).add(k)))
                    }
                    className={
                      added.has(k) ? `${PILL_QUIET} text-lav-300` : PILL_QUIET
                    }
                  >
                    {added.has(k) ? '✓ a bill now' : 'add bill'}
                  </button>
                </div>
              )
            })}
        </Section>
      ) : null}

      {live.length > 0 ? (
        <Section title={`new · ${live.length}`}>
          {fixed ? (
            <span className="font-mono text-[11.5px] text-state-good">
              ✓ {fixed}
            </span>
          ) : null}
          {byDay.map(([day, list]) => (
            <div key={day} className="flex flex-col">
              <DayHeading at={list[0].occurredAt} />
              {list.map((r) => {
                const c = ch(r.index)
                if (!c) return null
                const order = shown++
                return (
                  <Row
                    key={r.index}
                    r={r}
                    dim={!c.keep}
                    order={order}
                    kind={c.kind}
                  >
                    {c.kind === 'move' ? (
                      <>
                        <MoveChip />
                        <select
                          value={c.other ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === 'spend' || v === 'income')
                              set(r.index, { kind: v, other: null })
                            else if (v === '__new')
                              void addAccountFor(
                                r.index,
                                r.counterparty ?? r.merchant,
                              )
                            else
                              set(r.index, {
                                other: (v || null) as Id<'accounts'> | null,
                              })
                          }}
                          aria-label={`Where ${r.merchant} went`}
                          className={`rounded-[8px] bg-lift/[0.05] px-2 py-1 font-mono text-[11.5px] ring-1 ring-inset ${c.other ? 'text-lav-300 ring-lav-400/35' : 'text-state-warn ring-state-warn/45'}`}
                        >
                          <option value="">
                            {r.amount < 0
                              ? 'to which account?'
                              : 'from which account?'}
                          </option>
                          {accounts.map((a) =>
                            a._id === accountId ? (
                              /* Its own broker side: Revolut's cash into
                                 Revolut's stocks is still a move. */
                              a.kinds.includes('broker') ? (
                                <option key={a._id} value={a._id}>
                                  {r.amount < 0
                                    ? `→ ${a.name} · its investments`
                                    : `← ${a.name} · its investments`}
                                </option>
                              ) : null
                            ) : (
                              <option key={a._id} value={a._id}>
                                {r.amount < 0 ? `→ ${a.name}` : `← ${a.name}`}
                              </option>
                            ),
                          )}
                          {knownInstitution(r.counterparty ?? r.merchant) &&
                          !accounts.some(
                            (a) =>
                              a.name.toLowerCase() ===
                              knownInstitution(
                                r.counterparty ?? r.merchant,
                              )?.name.toLowerCase(),
                          ) ? (
                            <option value="__new">
                              + add{' '}
                              {
                                knownInstitution(r.counterparty ?? r.merchant)
                                  ?.name
                              }{' '}
                              as an account
                            </option>
                          ) : null}
                          <option value={r.amount < 0 ? 'spend' : 'income'}>
                            not mine — {r.amount < 0 ? 'spending' : 'came in'}
                          </option>
                        </select>
                      </>
                    ) : c.kind === 'spend' ? (
                      <>
                        {r.recurringId ? (
                          <span className="rounded-[5px] bg-lav-400/12 px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-lav-300 uppercase">
                            pays a bill
                          </span>
                        ) : null}
                        <select
                          value={c.category ?? ''}
                          onChange={(e) => fixAll(r.merchant, e.target.value)}
                          aria-label={`Group for ${r.merchant}`}
                          title={
                            r.categorySource === 'rule'
                              ? 'as you filed it before'
                              : 'a guess — change it if wrong'
                          }
                          className={`rounded-full bg-lift/[0.05] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] uppercase ring-1 ring-inset ${r.categorySource === 'rule' && c.category !== null ? 'text-ink-300 ring-lift/12' : 'text-state-warn ring-state-warn/40'}`}
                        >
                          {c.category === null ? (
                            <option value="">which group?</option>
                          ) : null}
                          {SPEND_CATEGORIES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="rounded-full bg-state-good/10 px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-state-good uppercase">
                        came in
                      </span>
                    )}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={c.keep}
                      aria-label={`Add ${r.merchant}`}
                      title={c.keep ? 'will be added' : 'left out'}
                      onClick={() => set(r.index, { keep: !c.keep })}
                      className={`grid size-5 place-items-center rounded-[6px] ${c.keep ? 'bg-lav-400 text-background' : 'ring-1 ring-lift/25'}`}
                    >
                      {c.keep ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                    </button>
                  </Row>
                )
              })}
            </div>
          ))}
        </Section>
      ) : null}

      {pending.length > 0 ? (
        <Section
          title={`not finished yet · ${pending.length}`}
          aside="added once it goes through"
        >
          {groupByDay(pending).map(([day, list]) => (
            <div key={day} className="flex flex-col">
              <DayHeading at={list[0].occurredAt} />
              {list.map((r) => (
                <Row key={r.index} r={r} dim kind={r.kind} />
              ))}
            </div>
          ))}
        </Section>
      ) : null}
      {dups.length > 0 ? (
        <Section
          title={`already have · ${dups.length}`}
          aside="not added again"
        >
          {groupByDay(dups).map(([day, list]) => (
            <div key={day} className="flex flex-col">
              <DayHeading at={list[0].occurredAt} />
              {list.map((r) => (
                <Row key={r.index} r={r} dim kind={r.kind} />
              ))}
            </div>
          ))}
        </Section>
      ) : null}

      {error ? (
        <span className="font-mono text-[11.5px] text-state-warn">{error}</span>
      ) : null}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex gap-2 border-t border-lift/[0.06] bg-popover px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
        <button
          type="button"
          onClick={onDiscard}
          className={`${PILL_QUIET} flex-1 justify-center py-3`}
        >
          discard
        </button>
        <button
          type="button"
          disabled={saving || !accountId}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          {addLabel({
            rows: kept.length,
            noun: noun(kept.length),
            orders,
            balance: keepsBalance,
          })}
        </button>
      </div>
    </div>
  )
}

/* The orders a broker's cash statement printed as rows (splitStatement,
   27 Sep): shares bought and sold inside the account — never "to which
   account?". Grouped by ticker; they fill in what he paid, and the cash
   they used is in the statement's balance already. */
function OrdersFound({
  orders,
  account,
}: {
  orders: NonNullable<Doc<'intakes'>['trades']>
  account: Doc<'accounts'> | null
}) {
  const positions = useQuery(api.aggregate.positions, {})
  const heldHere = (positions?.rows ?? []).filter(
    (r) => r.accountId === account?._id,
  )
  const by = new Map<
    string,
    {
      symbol: string | null
      name: string
      buys: number
      sells: number
      shares: number
      paid: number
    }
  >()
  for (const o of orders) {
    /* As confirm will file it: under a ticker the account already holds
       when it is the same company (sameCompany), else the search's. */
    const same = sameCompany({ name: o.name, isin: o.isin }, heldHere)
    const c =
      same >= 0
        ? heldHere[same]
        : o.candidates.at(
            o.preferred !== undefined && o.preferred >= 0 ? o.preferred : 0,
          )
    const key = c?.symbol ?? o.isin ?? o.name
    const g = by.get(key) ?? {
      symbol: c?.symbol ?? null,
      name: o.name,
      buys: 0,
      sells: 0,
      shares: 0,
      paid: 0,
    }
    const sign = o.side === 'buy' ? 1 : -1
    if (o.side === 'buy') g.buys++
    else g.sells++
    g.shares += sign * o.shares
    g.paid += sign * o.shares * o.price
    by.set(key, g)
  }
  const groups = [...by.values()].sort(
    (a, b) => b.buys + b.sells - (a.buys + a.sells),
  )
  const buys = orders.filter((o) => o.side === 'buy').length
  const broker = account?.kinds.includes('broker') ?? true
  return (
    <Section
      title={`↔ shares bought and sold${account ? ` in ${account.name}` : ''}`}
      aside={`${buys} buys · ${orders.length - buys} sells`}
    >
      <span className="pb-1 text-[12.5px] text-ink-400">
        Not money leaving — these fill in what you paid for each position. The
        cash they used is in the balance already.
      </span>
      {groups.map((g, i) => (
        <div
          key={g.symbol ?? g.name}
          style={{ animationDelay: `${i * 30}ms` }}
          className="motion-land flex items-center gap-3 border-t border-lift/[0.04] py-2"
        >
          {g.symbol ? (
            <TickerLogo symbol={g.symbol} size={26} />
          ) : (
            <span className="size-[26px] shrink-0 rounded-[7px] bg-state-warn/15" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13.5px] text-foreground">
              {g.symbol ?? 'no ticker found'}{' '}
              <span className="text-ink-400">{g.name}</span>
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {[
                g.buys ? `${g.buys} ${g.buys === 1 ? 'buy' : 'buys'}` : null,
                g.sells
                  ? `${g.sells} ${g.sells === 1 ? 'sell' : 'sells'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              {g.symbol ? '' : ' · left out'}
            </span>
          </span>
          <span className="text-right font-mono text-[12px] text-ink-300">
            {Math.abs(g.shares) < 1e-6
              ? 'sold out'
              : `${g.shares > 0 ? '' : '−'}${Math.abs(g.shares)
                  .toFixed(4)
                  .replace(/\.?0+$/, '')} sh`}
          </span>
        </div>
      ))}
      {!broker ? (
        <span className="font-mono text-[11px] text-state-warn">
          {account?.name} is not a broker — pick the broker these were bought
          in.
        </span>
      ) : null}
    </Section>
  )
}

function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'bad' | 'good'
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-lift/[0.035] p-3 ring-1 ring-lift/10 ring-inset">
      <span className="label-caps">{label}</span>
      <span
        className={`text-[19px] font-light ${tone === 'bad' ? 'text-state-danger' : tone === 'good' ? 'text-state-good' : 'text-foreground'}`}
      >
        {value}
      </span>
      {note ? (
        <span className="font-mono text-[10.5px] text-ink-500">{note}</span>
      ) : null}
    </div>
  )
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1 rounded-[14px] bg-lift/[0.02] p-3 ring-1 ring-lift/[0.07] ring-inset">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-ink-400 uppercase">
          {title}
        </span>
        {typeof aside === 'string' ? (
          <span className="font-mono text-[10.5px] text-ink-500">{aside}</span>
        ) : (
          aside
        )}
      </div>
      {children}
    </section>
  )
}

function Row({
  r,
  dim = false,
  order,
  kind,
  children,
}: {
  r: {
    occurredAt: number
    time?: string | null
    merchant: string
    raw: string
    amount: number
    currency: string
    category?: string | null
  }
  dim?: boolean
  /** Its place in the list: rows slide in one after another. */
  order?: number
  kind?: 'spend' | 'income' | 'move'
  children?: React.ReactNode
}) {
  /* The time, its mark, the name and the amount get the line; what he
     decides about the row sits under them, so a phone never cuts a
     merchant to "Tr…". The day is the heading above (5 Oct). */
  return (
    <div
      className={`motion-arrive flex flex-col gap-1.5 border-t border-lift/[0.04] py-2 first:border-t-0 ${dim ? 'opacity-50' : ''}`}
      style={
        order !== undefined
          ? { animationDelay: `${Math.min(order, 12) * 35}ms` }
          : undefined
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="w-10 shrink-0 font-mono text-[11px] text-ink-500">
          {r.time ?? ''}
        </span>
        <RowMark r={r} kind={kind} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] text-foreground">
            {r.merchant}
          </span>
          {r.raw !== r.merchant ? (
            <span className="truncate font-mono text-[10.5px] text-ink-600">
              {r.raw}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 text-right font-mono text-[13px] ${r.amount > 0 ? 'text-state-good' : kind === 'spend' && !dim ? 'text-state-danger' : 'text-ink-100'}`}
        >
          {r.amount > 0 ? '+' : ''}
          {money(r.amount, r.currency)}
        </span>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-[86px]">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** A row's mark: the shop's logo where the app knows its site, else what
    it is — a move, money in, or its group's icon (5 Oct, "Bolt icon +
    Bolt, Salary can have growth icon"). */
function RowMark({
  r,
  kind,
}: {
  r: { merchant: string; raw: string; category?: string | null }
  kind?: 'spend' | 'income' | 'move'
}) {
  const { who } = usePayees()
  const [failed, setFailed] = useState(false)
  const domain = who({ raw: r.raw, name: r.merchant }).domain
  if (domain && !failed && kind !== 'move')
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-[26px] shrink-0 rounded-[8px] bg-mark-ground object-contain p-[4px]"
      />
    )
  const Icon =
    kind === 'move'
      ? ArrowLeftRight
      : kind === 'income'
        ? TrendingUp
        : groupIcon(r.category)
  return (
    <span
      className={`grid size-[26px] shrink-0 place-items-center rounded-[8px] ${kind === 'move' ? 'bg-lav-400/14 text-lav-400' : kind === 'income' ? 'bg-state-good/14 text-state-good' : 'bg-lift/[0.06] text-ink-300'}`}
    >
      <Icon className="size-[15px]" />
    </span>
  )
}

/** "your move" — his own money between his own accounts, in the app's
    lavender (5 Oct). */
function MoveChip() {
  return (
    <span className="rounded-full bg-lav-400/12 px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-lav-300 uppercase ring-1 ring-lav-400/45 ring-inset">
      your move
    </span>
  )
}

function DayHeading({ at }: { at: number }) {
  return (
    <span className="pt-2 pb-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">
      {DAY_FMT.format(new Date(at))}
    </span>
  )
}

/* ---- Holdings ---------------------------------------------------------- */

/* A broker screen, checked (R6c, 27 Sep; mock design/treasury-mockup/
   holdings.html). He asked what the boxes meant and why it wanted 15
   prices he did not have. Now: what is in the account on top — total,
   invested, free cash — what he paid only where the screen said it, one
   line per position with the fix behind a tap, and one save with nothing
   typed. What it shows is stored as a look (convex/intake.confirmHoldings);
   a statement before or after fills it in, never adds to it. */

type PosDraft = {
  keep: boolean
  candidate: Candidate | null
  shares: string
  sharesCalc: boolean
}

const shareText = (n: number) =>
  n >= 100 ? n.toFixed(2) : n.toFixed(4).replace(/\.?0+$/, '')

function HoldingsReview({
  intake,
  onDiscard,
  onDone,
}: {
  intake: Doc<'intakes'>
  onDiscard: () => void
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const accounts = useQuery(api.accounts.list, {}) ?? []
  const confirm = useMutation(api.intake.confirmHoldings)
  const positions = useMemo(() => intake.positions ?? [], [intake.positions])
  const whose = useQuery(api.intake.whose, { intakeId: intake._id })
  const [accountId, setAccountId] = useState<Id<'accounts'> | null>(
    intake.accountId ?? null,
  )
  const target = accountId ?? whose?.guessedAccountId ?? null
  const targetName = accounts.find((a) => a._id === target)?.name
  const [drafts, setDrafts] = useState<Array<PosDraft>>([])
  const [open, setOpen] = useState<number | null>(null)
  const [searching, setSearching] = useState<number | null>(null)
  const [cash, setCash] = useState(
    intake.cashEur === undefined ? '' : String(intake.cashEur),
  )
  const [editCash, setEditCash] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* What the account holds already, to say what this screen changes. */
  const held = useQuery(api.aggregate.positions, {})
  const heldHere = (held?.rows ?? []).filter((r) => r.accountId === target)

  useEffect(() => {
    setDrafts(
      positions.map((p) => {
        const c = completePosition(p, p.todayPriceEur)
        return {
          keep: true,
          /* -1: no listing's price fits the screen — he picks one, the
             first search hit is not filled in (3 Oct: the US SHLD). */
          candidate:
            p.preferred === undefined
              ? (p.candidates[0] ?? null)
              : p.preferred >= 0
                ? (p.candidates[p.preferred] ?? null)
                : null,
          shares: c.shares === undefined ? '' : String(c.shares),
          sharesCalc: c.sharesCalculated,
        }
      }),
    )
  }, [positions])

  const num = (s: string) => Number(s.replace(',', '.'))
  const set = (i: number, patch: Partial<PosDraft>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  /* What the screen printed as paid: value ÷ (1 + % since buy). */
  const paidOf = (p: (typeof positions)[number]) =>
    p.valueEur !== undefined && p.changePct !== undefined && p.changePct > -100
      ? Math.round((p.valueEur / (1 + p.changePct / 100)) * 100) / 100
      : undefined
  const rows = positions.flatMap((p, i) => {
    const d = drafts[i] as PosDraft | undefined
    return d ? [{ p, d, i, paid: paidOf(p) }] : []
  })
  const kept = rows.filter((r) => r.d.keep)
  const cashNum = cash.trim() === '' ? null : num(cash)
  const invested = kept.reduce((t, r) => t + (r.p.valueEur ?? 0), 0)
  const total = intake.totalEur ?? invested + (cashNum ?? 0)
  const known = kept.filter((r) => r.paid !== undefined)
  const paid = known.reduce((t, r) => t + (r.paid ?? 0), 0)
  const gain = known.reduce(
    (t, r) => t + (r.p.valueEur ?? 0) - (r.paid ?? 0),
    0,
  )
  const ready =
    target !== null &&
    !saving &&
    (kept.length > 0 || cashNum !== null) &&
    kept.every((r) => r.d.candidate && num(r.d.shares) > 0)

  /* Against what is saved: new, more, fewer, or not on this screen. */
  const changes =
    heldHere.length === 0
      ? null
      : (() => {
          const out: Array<string> = []
          let same = 0
          for (const r of kept) {
            const sym = r.d.candidate?.symbol
            const h = heldHere.find(
              (x) => tickerBase(x.symbol) === tickerBase(sym ?? ''),
            )
            const n = num(r.d.shares)
            if (!sym) continue
            if (!h) out.push(`${sym} new`)
            else if (Math.abs(n - h.shares) <= h.shares * 0.015) same++
            else
              out.push(
                `${sym} ${n > h.shares ? '+' : '−'}${shareText(Math.abs(n - h.shares))} sh`,
              )
          }
          const gone = heldHere.filter(
            (h) =>
              !kept.some(
                (r) =>
                  tickerBase(r.d.candidate?.symbol ?? '') ===
                  tickerBase(h.symbol),
              ),
          )
          return { out, same, gone }
        })()

  async function save() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      await confirm({
        intakeId: intake._id,
        accountId: target,
        asOf: Date.now(),
        dayStart: today,
        cashEur: cashNum ?? undefined,
        rows: kept.map((r) => ({
          candidate: r.d.candidate as Candidate,
          isin: r.p.isin,
          shares: num(r.d.shares),
          paidEur: r.paid,
          sharesCalculated: r.d.sharesCalc || undefined,
        })),
      })
      setSaved(true)
    } catch (e) {
      setError(failureMessage(e) ?? 'Not saved')
      setSaving(false)
    }
  }

  if (saved)
    return (
      <div className="motion-land flex flex-col items-center gap-3 py-6 text-center">
        <span className="motion-pop grid size-11 place-items-center rounded-full bg-state-good/16 text-state-good">
          <Check className="size-5" strokeWidth={2.5} />
        </span>
        <span className="text-[16px] text-foreground">
          {targetName} is in — {money(Math.round(total * 100) / 100)}
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {kept.length} positions {money(Math.round(invested * 100) / 100)}
          {cashNum !== null ? ` · free cash ${money(cashNum)}` : ''} · what you
          paid: {known.length === 0 ? 'unknown' : `${known.length} known`}
        </span>
        {known.length < kept.length ? (
          <span className="max-w-md text-[12.5px] text-ink-400">
            Drop a {targetName} statement any time and what you paid fills in —
            nothing is added twice.
          </span>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link
            to="/finances"
            search={{ room: 'portfolio' }}
            onClick={onDone}
            className={`${PILL_LOUD} justify-center py-2.5`}
          >
            see Portfolio →
          </Link>
          <button
            type="button"
            onClick={onDone}
            className={`${PILL_QUIET} justify-center py-2.5`}
          >
            done
          </button>
        </div>
      </div>
    )

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {targetName ? (
          <AccountLogo
            name={targetName}
            domain={accounts.find((a) => a._id === target)?.domain}
            size={30}
          />
        ) : null}
        <span className="flex-1 text-[16px] text-foreground">
          {intake.title}
        </span>
        <span className="font-mono text-[10.5px] text-ink-500">
          <ReadBy intake={intake} /> · prices Yahoo Finance · ECB rate
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps">into</span>
        {accounts
          .filter((a) => a.kinds.includes('broker'))
          .map((a) => (
            <button
              key={a._id}
              type="button"
              aria-pressed={target === a._id}
              onClick={() => setAccountId(a._id)}
              className={`${target === a._id ? PILL_LOUD : PILL_QUIET} inline-flex items-center gap-2 py-1 pl-1`}
            >
              <AccountLogo name={a.name} domain={a.domain} size={20} />
              {a.name}
              {target === a._id ? (
                <Check className="size-3" strokeWidth={3} />
              ) : null}
            </button>
          ))}
        {!target && whose?.suggest ? (
          <CreateSuggested suggest={whose.suggest} onCreated={setAccountId} />
        ) : null}
        <AnotherAccount
          want="broker"
          have={accounts}
          onCreated={setAccountId}
        />
      </div>

      <div className="motion-arrive flex flex-col gap-3 rounded-[16px] bg-lift/[0.03] p-4 ring-1 ring-lift/[0.08] ring-inset">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="label-caps">
              total{targetName ? ` in ${targetName}` : ''}
            </span>
            <span className="text-[30px] leading-none font-light tabular-nums">
              {money(Math.round(total * 100) / 100)}
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {intake.totalEur !== undefined
                ? 'what the screen shows'
                : 'invested + free cash'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-caps flex items-center gap-1.5">
              <span className="size-[7px] rounded-full bg-lav-400" />
              invested
            </span>
            <span className="pt-2 text-[22px] leading-none font-light tabular-nums">
              {money(Math.round(invested * 100) / 100)}
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {kept.length} positions · worth now
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-caps flex items-center gap-1.5">
              <span className="size-[7px] rounded-full bg-money-cash" />
              free cash
            </span>
            {editCash ? (
              <input
                autoFocus
                inputMode="decimal"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                onBlur={() => setEditCash(false)}
                aria-label="Free cash in the account"
                className={`${FIELD} mt-1 w-32 py-1 text-[16px]`}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditCash(true)}
                className="pt-2 text-left text-[22px] leading-none font-light tabular-nums"
              >
                {cashNum === null ? (
                  <span className="text-[14px] text-ink-500">
                    not on the screen
                  </span>
                ) : (
                  money(cashNum)
                )}
              </button>
            )}
            <span className="font-mono text-[10.5px] text-ink-500">
              not invested · tap to change
            </span>
          </div>
        </div>
        {invested + (cashNum ?? 0) > 0 ? (
          <div className="flex h-1.5 gap-0.5">
            <span
              style={{ flex: invested }}
              className="rounded-full bg-lav-400"
            />
            {cashNum ? (
              <span
                style={{ flex: cashNum }}
                className="rounded-full bg-money-cash"
              />
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-lift/[0.06] pt-3 text-[13px] text-ink-300">
          {known.length === 0 ? (
            <>
              <span className="rounded-[6px] bg-lift/[0.06] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-400 uppercase">
                what you paid · unknown
              </span>
              <span>
                A screenshot doesn&apos;t say it. Drop a{' '}
                {targetName ?? 'broker'} statement later and it fills in.
              </span>
            </>
          ) : (
            <>
              <span className="rounded-[6px] bg-lift/[0.06] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-400 uppercase">
                you paid {money(Math.round(paid * 100) / 100)}
              </span>
              <span
                className={`rounded-[6px] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${gain >= 0 ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
              >
                {gain >= 0 ? '+' : '−'}
                {money(Math.abs(Math.round(gain * 100) / 100))} ·{' '}
                {paid > 0 ? `${((gain / paid) * 100).toFixed(1)}%` : ''}
              </span>
              <span>
                {known.length === kept.length
                  ? 'as the screen printed it'
                  : `on the ${known.length} of ${kept.length} the screen gave a % for`}
              </span>
            </>
          )}
        </div>
      </div>

      {changes ? (
        <div className="motion-arrive flex flex-col gap-1.5 rounded-[14px] bg-lav-400/[0.05] p-3 ring-1 ring-lav-400/22 ring-inset">
          <span className="text-[13.5px] text-foreground">
            {changes.out.length === 0 && changes.gone.length === 0
              ? `Same shares as ${targetName} already has — only prices moved.`
              : `Against what ${targetName} has: ${changes.out.length} changed · ${changes.same} the same`}
          </span>
          {changes.out.length > 0 ? (
            <span className="flex items-baseline gap-2 text-[12.5px] text-ink-300">
              <Check className="size-3.5 translate-y-0.5 text-state-good" />
              {changes.out.join(' · ')}
            </span>
          ) : null}
          {changes.gone.length > 0 ? (
            <span className="flex items-baseline gap-2 text-[12.5px] text-ink-300">
              <span className="text-state-warn">!</span>
              {changes.gone.map((g) => g.symbol).join(', ')} not on this screen
              — kept, and marked, in case the list was cut off
            </span>
          ) : null}
          <span className="text-[12px] text-ink-500">
            Saved as today&apos;s look. What you paid is never changed by a
            screenshot.
          </span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[16px] bg-lift/[0.02] ring-1 ring-lift/[0.07] ring-inset">
        <div className="flex justify-between px-3.5 pt-3 pb-2">
          <span className="label-caps">{rows.length} positions</span>
          <span className="font-mono text-[10.5px] text-ink-500">
            shares · profit · worth now
          </span>
        </div>
        {rows.map(({ p, d, i, paid: rowPaid }, k) => {
          const isOpen = open === i
          const n = num(d.shares)
          const profit =
            rowPaid !== undefined && p.valueEur !== undefined
              ? p.valueEur - rowPaid
              : null
          return (
            <div
              key={i}
              style={{ animationDelay: `${k * 25}ms` }}
              className="motion-land flex flex-col border-t border-lift/[0.05]"
            >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpen(isOpen ? null : i)
                  }
                }}
                className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-lift/[0.025]"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={d.keep}
                  aria-label={`Keep ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    set(i, { keep: !d.keep })
                  }}
                  className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] ${d.keep ? 'bg-lav-400 text-background' : 'ring-[1.5px] ring-lift/25'}`}
                >
                  {d.keep ? <Check className="size-3" strokeWidth={3} /> : null}
                </button>
                <span
                  className={`flex min-w-0 flex-1 items-center gap-3 ${d.keep ? '' : 'opacity-40'}`}
                >
                  {d.candidate ? (
                    <TickerLogo
                      symbol={d.candidate.symbol}
                      type={d.candidate.type}
                      name={d.candidate.name}
                      size={28}
                    />
                  ) : (
                    <span className="size-7 shrink-0 rounded-[8px] bg-state-warn/15" />
                  )}
                  <span className="min-w-[52px] text-[14px] font-medium text-foreground">
                    {d.candidate?.symbol ?? '?'}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-[12.5px] text-ink-400 sm:block">
                    {p.name}
                  </span>
                  <span className="ml-auto hidden w-24 text-right font-mono text-[11.5px] text-ink-400 sm:block">
                    {n > 0 ? `${shareText(n)} sh` : '? sh'}
                  </span>
                  <span
                    className={`w-24 text-right font-mono text-[11.5px] ${profit === null ? 'text-ink-500' : profit >= 0 ? 'text-state-good' : 'text-state-danger'}`}
                  >
                    {profit === null
                      ? '—'
                      : `${profit >= 0 ? '+' : '−'}${money(Math.abs(Math.round(profit * 100) / 100))}`}
                  </span>
                  <span className="w-24 text-right font-mono text-[13px] text-foreground">
                    {p.valueEur !== undefined ? money(p.valueEur) : '—'}
                  </span>
                </span>
                <ChevronRight
                  className={`size-4 shrink-0 transition-transform ${isOpen ? 'rotate-90 text-ink-300' : 'text-ink-600'}`}
                />
              </div>
              {isOpen ? (
                <div className="motion-arrive flex flex-wrap items-center gap-2 px-3.5 pb-3.5 sm:pl-[72px]">
                  {searching === i ? (
                    <div className="w-full">
                      <TickerSearch
                        initial={p.isin ?? p.name}
                        onPick={(c) => {
                          set(i, { candidate: c })
                          setSearching(null)
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex w-full flex-wrap gap-1.5">
                      {[
                        ...(d.candidate &&
                        !p.candidates.some(
                          (c) => c.symbol === d.candidate?.symbol,
                        )
                          ? [d.candidate]
                          : []),
                        ...p.candidates,
                      ].map((c) => (
                        <button
                          key={c.symbol}
                          type="button"
                          aria-pressed={d.candidate?.symbol === c.symbol}
                          onClick={() => set(i, { candidate: c })}
                          className={`${d.candidate?.symbol === c.symbol ? PILL_LOUD : PILL_QUIET} py-1 normal-case`}
                        >
                          {c.symbol} · {c.exchange || c.type}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSearching(i)}
                        className={`${PILL_QUIET} inline-flex items-center gap-1.5 border-dashed py-1`}
                      >
                        <Search className="size-3" /> another ticker
                      </button>
                    </div>
                  )}
                  <label
                    className={`${FIELD} inline-flex w-40 items-center gap-1.5 py-1.5`}
                  >
                    <input
                      inputMode="decimal"
                      value={d.shares}
                      onChange={(e) =>
                        set(i, { shares: e.target.value, sharesCalc: false })
                      }
                      aria-label={`Shares of ${p.name}`}
                      className="w-full bg-transparent font-mono text-[12.5px] focus:outline-none"
                    />
                    <span className="font-mono text-[10px] text-ink-500">
                      shares
                    </span>
                  </label>
                  <span className="font-mono text-[10.5px] text-ink-500">
                    {p.name}
                    {d.sharesCalc
                      ? ' · shares worked out as worth ÷ today’s price'
                      : ' · shares read from the screen'}
                    {rowPaid !== undefined
                      ? ` · paid ${money(rowPaid)} (from its %)`
                      : ''}
                  </span>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? (
        <span className="font-mono text-[11.5px] text-state-warn">{error}</span>
      ) : null}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex gap-2 border-t border-lift/[0.06] bg-popover px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
        <button
          type="button"
          onClick={onDiscard}
          className={`${PILL_QUIET} flex-1 justify-center py-3`}
        >
          discard
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          {target === null
            ? 'pick the account above'
            : `save ${kept.length} ${kept.length === 1 ? 'position' : 'positions'}${cashNum !== null ? ' and the cash' : ''}`}
        </button>
      </div>
    </>
  )
}

function TickerSearch({
  initial,
  onPick,
}: {
  initial: string
  onPick: (c: Candidate) => void
}) {
  const search = useAction(api.market.search)
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState<Array<Candidate> | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    setBusy(true)
    const t = setTimeout(() => {
      search({ q: term })
        .then(setResults, () => setResults([]))
        .finally(() => setBusy(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, search])
  return (
    <div className="flex flex-col gap-1">
      <label className={`${FIELD} flex items-center gap-2 py-1.5`}>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-lav-400" />
        ) : (
          <Search className="size-4 text-ink-500" />
        )}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find a ticker"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      {(results ?? []).map((c) => (
        <button
          key={c.symbol}
          type="button"
          onClick={() => onPick(c)}
          className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-lav-400/10"
        >
          <span className="w-20 font-mono text-[12px] text-area">
            {c.symbol}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {c.exchange}
          </span>
        </button>
      ))}
    </div>
  )
}

/* "Create Revolut?" — a file from a bank the app knows and he has
   not added: one tap makes it, with its logo, kind and the ending the file
   printed, and the review carries on into it. */
function CreateSuggested({
  suggest,
  onCreated,
}: {
  suggest: { product: string; name: string; accountTail: string | null }
  onCreated: (id: Id<'accounts'>) => void
}) {
  const create = useMutation(api.accounts.create)
  const [busy, setBusy] = useState(false)
  const product = productById(suggest.product)
  if (!product) return null
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void create({
          name: product.name,
          kinds: product.kinds,
          currencies: product.currencies,
          domain: product.domain,
          product: product.id,
          ibanTails: suggest.accountTail ? [suggest.accountTail] : undefined,
        })
          .then(onCreated)
          .finally(() => setBusy(false))
      }}
      className={`${PILL_LOUD} motion-land`}
    >
      <AccountLogo name={product.name} domain={product.domain} size={16} />
      create {product.name}?
    </button>
  )
}

/* "+ another" (27 Sep): the file is from somewhere he has no account for
   yet, and the reader could not say where (a Trade Republic screen reads
   only "Wealth"). The banks and brokers the app knows, searchable; a tap
   makes the account and puts the file into it. */
function AnotherAccount({
  want,
  have,
  onCreated,
}: {
  want: 'bank' | 'broker'
  have: ReadonlyArray<Doc<'accounts'>>
  onCreated: (id: Id<'accounts'>) => void
}) {
  const create = useMutation(api.accounts.create)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owned = new Set(have.map((a) => a.institution).filter(Boolean))
  const list = searchProducts(q)
    .filter((p) => p.kinds.includes(want) && !owned.has(p.institution))
    .slice(0, 9)

  async function make(args: Parameters<typeof create>[0]) {
    setBusy(true)
    setError(null)
    try {
      onCreated(await create(args))
      setOpen(false)
      setQ('')
    } catch (e) {
      setError(failureMessage(e) ?? 'Not added — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-press inline-flex items-center gap-1.5 rounded-full border border-dashed border-lift/20 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase hover:border-lav-400/45 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        another
      </button>
    )
  }
  return (
    <div className="motion-arrive flex w-full flex-col gap-2 rounded-[14px] bg-lift/[0.03] p-2.5 ring-1 ring-lift/8 ring-inset">
      <div className="flex items-center gap-2">
        <label className={`${FIELD} flex flex-1 items-center gap-2`}>
          <Search className="size-4 text-ink-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={`Which ${want}?`}
            aria-label={`Find a ${want}`}
            className="w-full bg-transparent focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="grid size-9 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 ring-inset hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            onClick={() =>
              void make({
                name: p.name,
                kinds: p.kinds,
                currencies: p.currencies,
                domain: p.domain,
                product: p.id,
              })
            }
            style={{ animationDelay: `${i * 20}ms` }}
            className="motion-land motion-press flex items-center gap-2 rounded-[12px] bg-lift/[0.035] p-2 text-left text-[13px] text-foreground ring-1 ring-lift/10 ring-inset hover:ring-lav-400/45"
          >
            <AccountLogo name={p.name} domain={p.domain ?? null} size={24} />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {q.trim() ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void make({ name: q.trim(), kinds: [want], currencies: ['EUR'] })
            }
            className="motion-press flex items-center gap-2 rounded-[12px] border border-dashed border-lift/20 p-2 text-left text-[13px] text-ink-300 hover:border-lav-400/45"
          >
            <Plus className="size-4" />
            <span className="truncate">“{q.trim()}” — not listed</span>
          </button>
        ) : null}
      </div>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}

/* ---- Trades ------------------------------------------------------------- */

const TRADE_DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
})

/* A broker's order history: each buy and sell with its own day and price,
   the ticker checked like a holding's, into the broker it came from. */
function TradesReview({
  intake,
  onDiscard,
  onDone,
}: {
  intake: Doc<'intakes'>
  onDiscard: () => void
  onDone: () => void
}) {
  const accounts = useQuery(api.accounts.list, {}) ?? []
  const whose = useQuery(api.intake.whose, { intakeId: intake._id })
  const confirm = useMutation(api.intake.confirmTrades)
  const trades = intake.trades ?? []
  const [accountId, setAccountId] = useState<Id<'accounts'> | null>(
    intake.accountId ?? null,
  )
  const target = accountId ?? whose?.guessedAccountId ?? null
  const [picks, setPicks] = useState<Record<number, Candidate | null>>(() =>
    Object.fromEntries(
      trades.map((t, i) => [
        i,
        t.candidates[
          t.preferred !== undefined && t.preferred >= 0 ? t.preferred : 0
        ] ?? null,
      ]),
    ),
  )
  const [drop, setDrop] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kept = trades
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !drop.has(i) && picks[i])
  const brokers = accounts.filter((a) => a.kinds.includes('broker'))

  async function save() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      await confirm({
        intakeId: intake._id,
        accountId: target,
        rows: kept.map(({ i }) => ({
          index: i,
          candidate: picks[i] as Candidate,
        })),
      })
      onDone()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
          : 'Not saved',
      )
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[15px] text-foreground">
          {intake.title}
        </span>
        <span className="font-mono text-[10.5px] text-ink-500">
          <ReadBy intake={intake} /> · {trades.length} trades
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps">at</span>
        {brokers.map((a) => (
          <button
            key={a._id}
            type="button"
            aria-pressed={target === a._id}
            onClick={() => setAccountId(a._id)}
            className={target === a._id ? PILL_LOUD : PILL_QUIET}
          >
            {a.name}
          </button>
        ))}
        {!target && whose?.suggest ? (
          <CreateSuggested suggest={whose.suggest} onCreated={setAccountId} />
        ) : null}
        <AnotherAccount
          want="broker"
          have={accounts}
          onCreated={setAccountId}
        />
      </div>
      <Section
        title="↔ buys and sells"
        aside="each moves the broker's cash on its day"
      >
        {trades.map((t, i) => {
          const on = !drop.has(i)
          const pick = picks[i]
          return (
            <div
              key={i}
              className={`flex flex-wrap items-center gap-2.5 border-t border-lift/[0.04] py-2 ${on ? '' : 'opacity-50'}`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`Keep ${t.name}`}
                onClick={() =>
                  setDrop((d) => {
                    const n = new Set(d)
                    if (n.has(i)) n.delete(i)
                    else n.add(i)
                    return n
                  })
                }
                className={`grid size-5 shrink-0 place-items-center rounded-[6px] ${on ? 'bg-lav-400 text-background' : 'ring-1 ring-lift/25'}`}
              >
                {on ? <Check className="size-3" strokeWidth={3} /> : null}
              </button>
              <span className="w-16 shrink-0 font-mono text-[11px] text-ink-500">
                {TRADE_DAY.format(new Date(t.occurredAt))}
              </span>
              <span
                className={`w-10 shrink-0 font-mono text-[10.5px] tracking-[0.12em] uppercase ${t.side === 'buy' ? 'text-lav-300' : 'text-state-good'}`}
              >
                {t.side}
              </span>
              {pick ? (
                <TickerLogo
                  symbol={pick.symbol}
                  type={pick.type}
                  name={pick.name}
                  size={22}
                />
              ) : null}
              <select
                value={pick?.symbol ?? ''}
                onChange={(e) =>
                  setPicks({
                    ...picks,
                    [i]:
                      t.candidates.find((c) => c.symbol === e.target.value) ??
                      null,
                  })
                }
                aria-label={`Ticker for ${t.name}`}
                className={`${FIELD} min-w-0 flex-1 py-1 font-mono text-[12px]`}
              >
                {pick ? null : <option value="">{t.name} — no ticker</option>}
                {t.candidates.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.symbol} · {c.name} · {c.exchange}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-right font-mono text-[12px] text-ink-100">
                {t.shares} × {money(t.price, t.currency)}
              </span>
            </div>
          )
        })}
      </Section>
      {error ? (
        <span className="font-mono text-[11.5px] text-state-warn">{error}</span>
      ) : null}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex gap-2 border-t border-lift/[0.06] bg-popover px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
        <button
          type="button"
          onClick={onDiscard}
          className={`${PILL_QUIET} flex-1 justify-center py-3`}
        >
          discard
        </button>
        <button
          type="button"
          disabled={!target || kept.length === 0 || saving}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          confirm · {kept.length} trades
        </button>
      </div>
    </>
  )
}

/* A crypto statement (4 Oct; mock design/treasury-mockup/crypto.html,
   "adding the statement"): the file with its bank's mark, the coins it
   holds arriving, what was found as badges, each check landing in turn,
   the numbers checked against the statement's own — and one button.
   Nothing is saved before it. */
function CryptoReview({
  intake,
  onDiscard,
  onDone,
}: {
  intake: Doc<'intakes'>
  onDiscard: () => void
  onDone: () => void
}) {
  const accounts = useQuery(api.accounts.list, {}) ?? []
  const whose = useQuery(api.intake.whose, { intakeId: intake._id })
  const confirm = useMutation(api.intake.confirmTrades)
  const trades = intake.trades ?? []
  const closing = intake.positions ?? []
  const brokers = accounts.filter((a) => a.kinds.includes('broker'))
  const [accountId, setAccountId] = useState<Id<'accounts'> | null>(
    intake.accountId ?? null,
  )
  /* His one Revolut, when the file is Revolut's. */
  const byName = brokers.find((a) =>
    (intake.institution ?? '').toLowerCase().includes(a.name.toLowerCase()),
  )
  const target = accountId ?? whose?.guessedAccountId ?? byName?._id ?? null
  const account = accounts.find((a) => a._id === target)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = checkCryptoStatement(trades, closing)
  const year = (t: number) => new Date(t).getFullYear()
  const checks: Array<[string, string, boolean]> = [
    [
      `${c.held.length} coin${c.held.length === 1 ? '' : 's'} you hold`,
      c.held.map((h) => h.coin).join(', '),
      false,
    ],
    [
      `${c.deals} buys and sells`,
      `${c.from ? year(c.from) : ''}${c.to && c.from && year(c.to) !== year(c.from) ? ` → ${year(c.to)}` : ''}${c.currencies.length ? `, in ${c.currencies.join(' and ')}` : ''}${c.currencies.some((x) => x !== 'EUR') ? ' — dollars turned into € at that day’s rate' : ''}`,
      false,
    ],
    ...(c.rewards
      ? ([
          [
            `${c.rewards} staking payments`,
            c.staked
              .map(
                (x) =>
                  `${x.shares < 10 ? x.shares.toFixed(2) : x.shares.toFixed(1)} ${x.coin} you got for free`,
              )
              .join(', '),
            true,
          ],
        ] as Array<[string, string, boolean]>)
      : []),
    ...(c.soldOut.length
      ? ([
          [
            `${c.soldOut.length} coin${c.soldOut.length === 1 ? '' : 's'} you sold completely`,
            c.soldOut.join(', '),
            false,
          ],
        ] as Array<[string, string, boolean]>)
      : []),
    c.differs.length === 0
      ? [
          'The numbers match',
          `every buy, sell and staking payment adds up to what the statement says you hold — ${euros(c.worthEur)}`,
          true,
        ]
      : [
          'Revolut’s amounts are used',
          c.differs
            .map(
              (d) =>
                `${d.coin}: the statement shows ${Math.abs(d.diff).toPrecision(2)} ${d.diff > 0 ? 'more' : 'less'} than its trades add up to`,
            )
            .join(' · '),
          false,
        ],
  ]

  async function save() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      await confirm({
        intakeId: intake._id,
        accountId: target,
        rows: trades.map((t, index) => ({
          index,
          candidate: t.candidates[t.preferred ?? 0],
        })),
      })
      onDone()
    } catch (e) {
      setError(failureMessage(e) ?? 'Not saved')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3.5 rounded-[16px] border border-dashed border-lav-400/35 bg-lift/[0.03] p-3.5">
        <AccountLogo
          name={intake.institution ?? 'Revolut'}
          domain={account?.domain ?? 'revolut.com'}
          size={44}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] text-foreground">
            {intake.institution ?? intake.title}
          </span>
          <span className="truncate font-mono text-[10.5px] text-ink-500">
            {intake.title}
          </span>
          <span className="flex">
            {c.held.map((h, i) => (
              <span
                key={h.coin}
                style={{ animationDelay: `${300 + i * 110}ms` }}
                className="motion-pop -ml-1.5 rounded-full ring-2 ring-popover first:ml-0"
              >
                <TickerLogo
                  symbol={`${h.coin}-EUR`}
                  type="CRYPTOCURRENCY"
                  size={24}
                />
              </span>
            ))}
          </span>
        </span>
        {c.differs.length === 0 ? (
          <span
            style={{ animationDelay: '1.6s' }}
            className="motion-pop rounded-full bg-state-good/14 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-state-good uppercase ring-1 ring-state-good/30 ring-inset"
          >
            ✓ matches
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          [`worth ${euros(c.worthEur)}`, false],
          [`${c.held.length} coins`, false],
          [`${c.deals} trades`, false],
          ...(c.rewards
            ? [
                [
                  `+${c.staked.map((x) => `${x.shares.toFixed(2)} ${x.coin}`).join(' · ')} free`,
                  true,
                ],
              ]
            : []),
        ].map(([label, good], i) => (
          <span
            key={String(label)}
            style={{ animationDelay: `${700 + i * 120}ms` }}
            className={`motion-pop rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.08em] uppercase ring-1 ring-inset ${
              good
                ? 'bg-state-good/12 text-state-good ring-state-good/30'
                : 'bg-lav-400/12 text-lav-200 ring-lav-400/30'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-col">
        {checks.map(([what, said, good], i) => (
          <div
            key={what}
            style={{ animationDelay: `${600 + i * 220}ms` }}
            className="motion-arrive grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 border-b border-lift/[0.05] py-2.5"
          >
            <span
              style={{ animationDelay: `${750 + i * 220}ms` }}
              className={`motion-pop mt-0.5 grid size-5 place-items-center rounded-full ${good ? 'bg-state-good/18 text-state-good' : 'bg-lav-400/14 text-lav-300'}`}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] text-foreground">{what}</span>
              <span className="text-[12.5px] leading-relaxed text-ink-400">
                {said}
              </span>
            </span>
          </div>
        ))}
      </div>
      {brokers.length > 1 || !target ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps">into</span>
          {brokers.map((a) => (
            <button
              key={a._id}
              type="button"
              aria-pressed={target === a._id}
              onClick={() => setAccountId(a._id)}
              className={target === a._id ? PILL_LOUD : PILL_QUIET}
            >
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <span className="font-mono text-[11.5px] text-state-warn">{error}</span>
      ) : null}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex items-center gap-2 border-t border-lift/[0.06] bg-popover px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
        <button
          type="button"
          onClick={onDiscard}
          className={`${PILL_QUIET} flex-1 justify-center py-3`}
        >
          discard
        </button>
        <button
          type="button"
          disabled={!target || saving}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          add to {account?.name ?? '…'}
        </button>
      </div>
      <span className="label-caps text-center">
        nothing is saved until you press it
      </span>
    </>
  )
}

const MONTH_LONG = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

/* After a statement from another month: where its rows went, and a way
   there. */
function Landed({
  count,
  months,
  orders,
  account,
  accountId,
  noun,
  balance,
  others = [],
  onDone,
}: {
  count: number
  months: Array<string>
  orders?: { written: number; skipped: number; noTicker: number }
  account?: string
  accountId?: Id<'accounts'>
  noun?: string
  balance?: { value: number; currency: string; asOf: number }
  others?: Array<{ currency: string; value: number }>
  onDone: () => void
}) {
  const name = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return MONTH_LONG.format(new Date(y, mo - 1, 1))
  }
  const last = months.at(-1)
  /* The account's other pockets that are still old — Revolut's USD after
     a EUR statement (5 Oct: "I still have revolut here"). Each one asks,
     with one press, rather than leaving check-in to say it later. */
  const data = useQuery(api.aggregate.balances, {})
  const now = Date.now()
  const old = (
    data?.accounts.find((a) => a.accountId === accountId)?.pockets ?? []
  ).filter(
    (p) =>
      p.currency !== balance?.currency &&
      (p.recordedAt === null || now - p.recordedAt > STALE_MS),
  )
  return (
    <div className="motion-land flex flex-col items-center gap-3 py-6 text-center">
      <span className="motion-pop grid size-12 place-items-center rounded-full bg-state-good/16 text-state-good">
        <Check className="size-6" strokeWidth={2.5} />
      </span>
      <span className="text-[17px] text-foreground">
        {count > 0
          ? `${count} ${noun ?? (count === 1 ? 'row' : 'rows')} added`
          : balance
            ? 'Balance updated'
            : 'Saved'}
      </span>
      <div className="flex max-w-md flex-col gap-1 text-[13px] text-ink-300">
        {count > 0 && months.length > 0 ? (
          <span>to {months.map(name).join(', ')}</span>
        ) : null}
        {balance ? (
          <span>
            {account ?? 'Its'} {balance.currency} cash ·{' '}
            {money(balance.value, balance.currency)} on{' '}
            {DAY_FMT.format(new Date(balance.asOf))}
          </span>
        ) : null}
        {others.map((p) => (
          <span key={p.currency}>
            {account ?? 'Its'} {p.currency} · {money(p.value, p.currency)} ·
            kept as is, not in this file
          </span>
        ))}
        {orders ? (
          <span>
            {orders.written} {orders.written === 1 ? 'order' : 'orders'} filed
            as trades
            {orders.skipped > 0 ? `, ${orders.skipped} already there` : ''}
            {orders.noTicker > 0
              ? `, ${orders.noTicker} left out (no ticker found)`
              : ''}{' '}
            — what you paid is filled in
          </span>
        ) : null}
      </div>
      {accountId && old.length > 0 ? (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-[14px] bg-state-warn/[0.06] p-3 text-left ring-1 ring-state-warn/30 ring-inset">
          {old.map((p) => (
            <OldPocket
              key={p.currency}
              accountId={accountId}
              account={account ?? ''}
              pocket={p}
            />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {orders ? (
          <Link
            to="/finances"
            search={{ room: 'portfolio' }}
            onClick={onDone}
            className={`${PILL_LOUD} justify-center py-2.5`}
          >
            see Portfolio →
          </Link>
        ) : null}
        {last ? (
          <Link
            to="/finances"
            search={{ room: 'flow', month: last }}
            onClick={onDone}
            className={`${PILL_QUIET} justify-center py-2.5`}
          >
            see {name(last)} in Flow →
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className={`${PILL_LOUD} justify-center px-6 py-2.5`}
        >
          done
        </button>
      </div>
    </div>
  )
}

/** "USD · $120.00 · typed Sep 26" and one press to say it is still so. */
function OldPocket({
  accountId,
  account,
  pocket,
}: {
  accountId: Id<'accounts'>
  account: string
  pocket: { currency: string; value: number | null; recordedAt: number | null }
}) {
  const today = useDayStarts(1).at(-1) as number
  const setBalance = useMutation(api.accounts.setBalance)
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-1 text-[13px] text-ink-200">
        {account} {pocket.currency}
        {pocket.value !== null
          ? ` · ${money(pocket.value, pocket.currency)}`
          : ''}
        <span className="block font-mono text-[10.5px] text-state-warn">
          {done
            ? 'saved today'
            : pocket.recordedAt
              ? `last set ${DAY_FMT.format(new Date(pocket.recordedAt))}`
              : 'never set'}
        </span>
      </span>
      {pocket.value !== null ? (
        <button
          key={done ? 'saved' : 'ask'}
          type="button"
          disabled={done}
          onClick={() =>
            void setBalance({
              accountId,
              currency: pocket.currency,
              value: pocket.value as number,
              dayStart: today,
            }).then(() => setDone(true))
          }
          className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap uppercase ring-1 ring-inset ${done ? 'motion-pop bg-state-good text-background ring-state-good' : 'motion-press bg-state-good/10 text-state-good ring-state-good/40'}`}
        >
          {done ? '✓ saved' : '✓ still the same'}
        </button>
      ) : null}
    </div>
  )
}

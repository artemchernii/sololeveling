import { useEffect, useMemo, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Loader2, Search } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { MoneyIcon } from '@/components/finances/icons'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import {
  HistoryReview,
  IntakeStrip,
  ReadBy,
  ReadingSheet,
} from '@/components/finances/Reading'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { dayLabel } from '@/lib/bills'
import { completePosition, diffHoldings, merchantKey } from '@/lib/intake'
import type { HoldingChange } from '@/lib/intake'
import { productById } from '@/lib/institutions'
import type { Candidate } from '@/lib/market'
import { SPEND_CATEGORIES, categoryLabel } from '@/lib/money'

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
  const open = useQuery(api.intake.open, {})
  const discard = useMutation(api.intake.discard)
  const intake = open?.find((i) => i._id === intakeId)
  const throwAway = () => void discard({ intakeId }).then(onBack)

  /* Loading holds the space quietly: a flash of "reading" for a few
     milliseconds is the flicker he kept seeing. */
  if (open === undefined) return <div className="min-h-[240px]" />
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
  const [landed, setLanded] = useState<{
    count: number
    months: Array<string>
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
  const [filter, setFilter] = useState<'check' | 'all'>('check')
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

  if (review === undefined) return <div className="min-h-[240px]" />
  if (review === null) return null
  if (landed)
    return <Landed {...landed} account={account?.name} onDone={onDone} />

  const rows = review.rows
  const pending = rows.filter((r) => r.pending)
  const dups = rows.filter((r) => !r.pending && r.duplicateOf !== null)
  const live = rows.filter((r) => !r.pending && r.duplicateOf === null)
  const ch = (i: number) => choices[i] as Choice | undefined
  const moves = live.filter((r) => ch(r.index)?.kind === 'move')
  const money_ = live.filter((r) => ch(r.index)?.kind !== 'move')
  const unsure = money_.filter(
    (r) =>
      ch(r.index)?.kind === 'spend' &&
      (r.categorySource !== 'rule' || ch(r.index)?.category === null),
  )
  const shown = filter === 'check' ? unsure : money_
  const cur = rows[0]?.currency ?? 'EUR'
  const outOnPaper = rows
    .filter((r) => r.amount < 0 && !r.pending)
    .reduce((t, r) => t + r.amount, 0)
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
      await confirm({
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
      /* Rows that went into another month than this one: say where, and
         open that month in Flow (27 Sep: "Flow is not updated at all" —
         his August statement had gone into August). */
      const now = new Date(today)
      const key = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const months = [
        ...new Set(kept.map((r) => key(new Date(r.occurredAt)))),
      ].sort()
      if (
        months.length === 0 ||
        (months.length === 1 && months[0] === key(now))
      )
        onDone()
      else setLanded({ count: kept.length, months })
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
          <ReadBy intake={intake} /> · {rows.length} rows
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps">this is</span>
        {accounts.map((a) => (
          <button
            key={a._id}
            type="button"
            aria-pressed={accountId === a._id}
            onClick={() =>
              void setAccount({ intakeId: intake._id, accountId: a._id })
            }
            className={accountId === a._id ? PILL_LOUD : PILL_QUIET}
          >
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
            pick the account
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          label="money out on paper"
          value={money(Math.round(outOnPaper * 100) / 100, cur)}
        />
        <Kpi
          label="actually spent"
          value={money(Math.round(spent * 100) / 100, cur)}
          tone="bad"
          note={`${money_.filter((r) => ch(r.index)?.kind === 'spend' && ch(r.index)?.keep).length} rows`}
        />
        <Kpi
          label="your money moving"
          value={`${moves.length} moves`}
          note="not spending"
        />
        {intake.balance ? (
          <button
            type="button"
            onClick={() => setKeepBalance((k) => !k)}
            className={`flex flex-col gap-1 rounded-[12px] p-3 text-left ring-1 ring-inset ${keepBalance ? 'bg-lav-400/10 ring-lav-400/40' : 'bg-lift/[0.035] ring-lift/10'}`}
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
                ? `→ ${account?.name ?? 'the account'} free cash`
                : 'not kept'}
            </span>
          </button>
        ) : null}
      </div>

      {moves.length > 0 ? (
        <Section
          title="⇄ your money moving — not spending"
          aside={`${moves.filter((r) => !ch(r.index)?.other).length} need you`}
        >
          {moves.map((r) => (
            <Row key={r.index} r={r}>
              <select
                value={ch(r.index)?.other ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'spend' || v === 'income')
                    set(r.index, { kind: v, other: null })
                  else if (v === '__new')
                    void addAccountFor(r.index, r.counterparty ?? r.merchant)
                  else
                    set(r.index, {
                      other: (v || null) as Id<'accounts'> | null,
                    })
                }}
                aria-label={`Where ${r.merchant} went`}
                className={`rounded-[8px] bg-lift/[0.05] px-2 py-1 font-mono text-[11.5px] ring-1 ring-inset ${ch(r.index)?.other ? 'text-lav-300 ring-lav-400/35' : 'text-state-warn ring-state-warn/45'}`}
              >
                <option value="">
                  {r.amount < 0 ? 'to which account?' : 'from which account?'}
                </option>
                {accounts.map((a) =>
                  a._id === accountId ? (
                    /* Its own broker side: Revolut's cash into Revolut's
                       stocks is still a move — within the account. */
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
                    + add {knownInstitution(r.counterparty ?? r.merchant)?.name}{' '}
                    as an account
                  </option>
                ) : null}
                <option value={r.amount < 0 ? 'spend' : 'income'}>
                  not mine — {r.amount < 0 ? 'spending' : 'income'}
                </option>
              </select>
            </Row>
          ))}
          <span className="text-[12px] text-ink-500">
            Answer once — a counterparty you name is matched the same way next
            time.
          </span>
        </Section>
      ) : null}

      {review.recurring.filter((x) => !x.alreadyABill).length > 0 ? (
        <Section title="↻ found things that come round" aside="add as bills?">
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
                      {x.months} months running, same amount
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

      <Section
        title={`↘ spending and money in · ${money_.length} rows`}
        aside={
          <span className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('check')}
              className={filter === 'check' ? PILL_LOUD : PILL_QUIET}
            >
              to check · {unsure.length}
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={filter === 'all' ? PILL_LOUD : PILL_QUIET}
            >
              all
            </button>
          </span>
        }
      >
        {fixed ? (
          <span className="font-mono text-[11.5px] text-state-good">
            ✓ {fixed}
          </span>
        ) : null}
        {shown.length === 0 ? (
          <span className="py-2 text-[13px] text-ink-500">
            {filter === 'check'
              ? 'Nothing to check — every row is filed by a merchant you taught.'
              : 'No rows.'}
          </span>
        ) : (
          shown.map((r) => {
            const c = ch(r.index)
            if (!c) return null
            return (
              <Row key={r.index} r={r} dim={!c.keep}>
                <span className="flex items-center gap-1.5">
                  {r.recurringId ? (
                    <span className="rounded-[5px] bg-lav-400/12 px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-lav-300 uppercase">
                      pays a bill
                    </span>
                  ) : null}
                  {c.kind === 'spend' ? (
                    <>
                      <span
                        className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] uppercase ${r.categorySource === 'rule' ? 'bg-state-good/10 text-state-good' : 'bg-state-warn/12 text-state-warn'}`}
                      >
                        {r.categorySource === 'rule' ? 'sure' : 'guess'}
                      </span>
                      <MoneyIcon
                        kind="expense"
                        category={c.category}
                        className="size-3.5 text-area"
                      />
                      <select
                        value={c.category ?? ''}
                        onChange={(e) => fixAll(r.merchant, e.target.value)}
                        aria-label={`Category for ${r.merchant}`}
                        className="rounded-[8px] bg-lift/[0.05] px-1.5 py-1 font-mono text-[11.5px] text-ink-100 ring-1 ring-lift/12 ring-inset"
                      >
                        {c.category === null ? (
                          <option value="">pick…</option>
                        ) : null}
                        {SPEND_CATEGORIES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="rounded-[5px] bg-state-good/10 px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-state-good uppercase">
                      money in
                    </span>
                  )}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={c.keep}
                    aria-label={`Keep ${r.merchant}`}
                    onClick={() => set(r.index, { keep: !c.keep })}
                    className={`grid size-5 place-items-center rounded-[6px] ${c.keep ? 'bg-lav-400 text-background' : 'ring-1 ring-lift/25'}`}
                  >
                    {c.keep ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : null}
                  </button>
                </span>
              </Row>
            )
          })
        )}
      </Section>

      {pending.length > 0 ? (
        <Section
          title="◷ pending — held back"
          aside="matched when it completes"
        >
          {pending.map((r) => (
            <Row key={r.index} r={r} dim />
          ))}
        </Section>
      ) : null}
      {dups.length > 0 ? (
        <Section
          title={`= already have these · ${dups.length}`}
          aside="matched by amount, place, ±2 days — skipped"
        >
          {dups.map((r) => (
            <Row key={r.index} r={r} dim />
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
          confirm · {kept.length} rows
          {intake.balance && keepBalance ? ' · balance' : ''}
        </button>
      </div>
    </>
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
  children,
}: {
  r: {
    occurredAt: number
    merchant: string
    raw: string
    amount: number
    currency: string
  }
  dim?: boolean
  children?: React.ReactNode
}) {
  /* The name and the amount get the line; what he decides about the row
     sits under them, so a phone never cuts a merchant to "Tr…". */
  return (
    <div
      className={`flex flex-col gap-1.5 border-t border-lift/[0.04] py-2 ${dim ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 font-mono text-[11px] text-ink-500">
          {DAY_FMT.format(new Date(r.occurredAt))}
        </span>
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
          className={`shrink-0 text-right font-mono text-[13px] ${r.amount > 0 ? 'text-state-good' : 'text-ink-100'}`}
        >
          {r.amount > 0 ? '+' : ''}
          {money(r.amount, r.currency)}
        </span>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-15">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/* ---- Holdings ---------------------------------------------------------- */

type PosDraft = {
  keep: boolean
  candidate: Candidate | null
  shares: string
  price: string
  sharesCalc: boolean
  priceCalc: boolean
}

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
  const [drafts, setDrafts] = useState<Array<PosDraft>>([])
  const [searching, setSearching] = useState<number | null>(null)
  const [cash, setCash] = useState(
    intake.cashEur === undefined ? '' : String(intake.cashEur),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* What the account already holds: a first screenshot sets it, a later
     one is compared with it and becomes buys and sells. */
  const held = useQuery(api.aggregate.positions, {})
  const heldHere = (held?.rows ?? []).filter((r) => r.accountId === target)
  const mode = heldHere.length > 0 ? 'changes' : 'opening'
  const [untick, setUntick] = useState<Set<string>>(new Set())

  useEffect(() => {
    setDrafts(
      positions.map((p) => {
        const c = completePosition(p, p.todayPriceEur)
        return {
          keep: true,
          candidate:
            p.preferred !== undefined && p.preferred >= 0
              ? (p.candidates[p.preferred] ?? null)
              : (p.candidates[0] ?? null),
          shares: c.shares === undefined ? '' : String(c.shares),
          price: c.priceEur === undefined ? '' : String(c.priceEur),
          sharesCalc: c.sharesCalculated,
          priceCalc: c.priceCalculated,
        }
      }),
    )
  }, [positions])

  const num = (s: string) => Number(s.replace(',', '.'))
  const changes: Array<HoldingChange> =
    mode === 'changes'
      ? diffHoldings(
          heldHere.map((r) => ({
            symbol: r.symbol,
            shares: r.shares,
            putIn: r.putIn,
            priceEur:
              r.valueEur !== null && r.shares > 0
                ? r.valueEur / r.shares
                : undefined,
          })),
          drafts.flatMap((d, i) => {
            const p = positions[i] as (typeof positions)[number] | undefined
            if (!d.keep || !d.candidate || !p) return []
            return [
              {
                symbol: d.candidate.symbol,
                shares: num(d.shares) || undefined,
                sharesCalculated: d.sharesCalc,
                paidEur:
                  p.valueEur !== undefined &&
                  p.changePct !== undefined &&
                  p.changePct > -100
                    ? p.valueEur / (1 + p.changePct / 100)
                    : num(d.shares) * num(d.price) || undefined,
                priceEurToday: p.todayPriceEur,
              },
            ]
          }),
        )
      : []
  const moving = changes.filter((c) => c.side !== undefined)
  const ticked = moving.filter(
    (c) => c.shares && c.priceEur && !untick.has(c.symbol),
  )
  const candidateFor = (symbol: string): Candidate | null => {
    const d = drafts.find((x) => x.candidate?.symbol === symbol)
    if (d?.candidate) return d.candidate
    const h = heldHere.find((r) => r.symbol === symbol)
    return h
      ? { symbol: h.symbol, name: h.name, exchange: '', type: h.type }
      : null
  }
  const set = (i: number, patch: Partial<PosDraft>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const kept = drafts.filter((d) => d.keep)
  const ready =
    target !== null &&
    (mode === 'changes'
      ? ticked.length > 0 || cash.trim() !== ''
      : kept.every((d) => d.candidate && num(d.shares) > 0 && num(d.price) > 0))
  const worth = positions.reduce(
    (t, p, i) => t + (drafts[i]?.keep ? (p.valueEur ?? 0) : 0),
    0,
  )
  const paid = drafts.reduce(
    (t, d) => t + (d.keep ? num(d.shares) * num(d.price) || 0 : 0),
    0,
  )

  async function save() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      await confirm({
        intakeId: intake._id,
        accountId: target,
        mode,
        occurredAt: Date.now(),
        dayStart: today,
        cashEur: cash.trim() === '' ? undefined : num(cash),
        rows:
          mode === 'changes'
            ? ticked.map((c) => ({
                candidate: candidateFor(c.symbol) as Candidate,
                side: c.side as 'buy' | 'sell',
                shares: c.shares as number,
                priceEur: c.priceEur as number,
              }))
            : kept.map((d, i) => ({
                candidate: d.candidate as Candidate,
                isin: positions[drafts.indexOf(d)]?.isin ?? positions[i]?.isin,
                side: 'buy' as const,
                shares: num(d.shares),
                priceEur: num(d.price),
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
          {positions.length} positions · prices Yahoo Finance · ECB rate
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
              className={target === a._id ? PILL_LOUD : PILL_QUIET}
            >
              {a.name}
            </button>
          ))}
        {!target && whose?.suggest ? (
          <CreateSuggested suggest={whose.suggest} onCreated={setAccountId} />
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="worth now" value={money(Math.round(worth * 100) / 100)} />
        <Kpi
          label="you paid · calculated"
          value={money(Math.round(paid * 100) / 100)}
        />
        <Kpi
          label="profit"
          value={`${worth - paid >= 0 ? '+' : '−'}${money(Math.abs(Math.round((worth - paid) * 100) / 100))}`}
          tone={worth - paid < 0 ? 'bad' : 'good'}
        />
        {mode === 'changes' ? (
          <Kpi
            label="changed since last time"
            value={`${moving.length} of ${changes.length}`}
            note={`${changes.length - moving.length} the same`}
          />
        ) : (
          <Kpi
            label="first read of"
            value={accounts.find((a) => a._id === target)?.name ?? '—'}
            note="held before — not out of its cash"
          />
        )}
      </div>
      {mode === 'changes' ? (
        <Section
          title="⇄ what changed — buys and sells"
          aside="told by what you paid, not by the price"
        >
          {moving.length === 0 ? (
            <span className="py-2 text-[13px] text-ink-400">
              Nothing bought or sold since the last screenshot — only prices
              moved.
            </span>
          ) : (
            moving.map((c) => {
              const on = ticked.some((x) => x.symbol === c.symbol)
              const can = Boolean(c.shares && c.priceEur)
              return (
                <div
                  key={c.symbol}
                  className={`flex items-center gap-3 border-t border-lift/[0.04] py-2 ${on ? '' : 'opacity-55'}`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={!can}
                    aria-label={`Keep ${c.symbol}`}
                    onClick={() =>
                      setUntick((u) => {
                        const n = new Set(u)
                        if (n.has(c.symbol)) n.delete(c.symbol)
                        else n.add(c.symbol)
                        return n
                      })
                    }
                    className={`grid size-5 shrink-0 place-items-center rounded-[6px] ${on ? 'bg-lav-400 text-background' : 'ring-1 ring-lift/25'}`}
                  >
                    {on ? <Check className="size-3" strokeWidth={3} /> : null}
                  </button>
                  <TickerLogo symbol={c.symbol} size={26} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13.5px] text-foreground">
                      <b className="font-mono text-lav-300">{c.symbol}</b>{' '}
                      {c.change === 'new'
                        ? 'new — bought'
                        : c.change === 'more'
                          ? 'bought more'
                          : c.change === 'less'
                            ? 'sold some'
                            : 'not on this screenshot — sold?'}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-500">
                      {c.shares ? `${c.shares} sh` : '? sh'} ×{' '}
                      {c.priceEur ? money(c.priceEur) : '?'}
                      {c.by === 'paid' ? ' · calc from what you paid' : ''}
                      {c.change === 'gone'
                        ? ' · the list may just be cut off'
                        : ''}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[13px] ${c.side === 'sell' ? 'text-state-good' : 'text-ink-100'}`}
                  >
                    {c.side === 'sell' ? '+' : '−'}
                    {c.shares && c.priceEur
                      ? money(Math.round(c.shares * c.priceEur * 100) / 100)
                      : '—'}
                  </span>
                </div>
              )
            })
          )}
          <span className="text-[12px] text-ink-500">
            A buy comes out of the account&apos;s free cash; a sell goes back
            into it.
          </span>
        </Section>
      ) : null}
      <Section
        title="positions — check the ticker"
        aside="calc = worked out, not on the screen"
      >
        {positions.map((p, i) => {
          const d = drafts[i] as PosDraft | undefined
          if (!d) return null
          return (
            <div
              key={i}
              className={`flex flex-col gap-2 border-t border-lift/[0.04] py-2.5 ${d.keep ? '' : 'opacity-45'}`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={d.keep}
                  aria-label={`Keep ${p.name}`}
                  onClick={() => set(i, { keep: !d.keep })}
                  className={`grid size-5 shrink-0 place-items-center rounded-[6px] ${d.keep ? 'bg-lav-400 text-background' : 'ring-1 ring-lift/25'}`}
                >
                  {d.keep ? <Check className="size-3" strokeWidth={3} /> : null}
                </button>
                {d.candidate ? (
                  <TickerLogo symbol={d.candidate.symbol} size={30} />
                ) : (
                  <span className="size-[30px]" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px]">
                    <span className="text-ink-400">{p.name} →</span>{' '}
                    <b className="font-mono text-lav-300">
                      {d.candidate?.symbol ?? '?'}
                    </b>{' '}
                    <span className="font-mono text-[10px] text-ink-500">
                      {d.candidate?.exchange}
                    </span>
                  </span>
                  {/\((?:class\s*)?[ABC]\)/i.test(p.name) && d.candidate ? (
                    <span className="font-mono text-[10.5px] text-ink-500">
                      share class read from the name
                    </span>
                  ) : null}
                </span>
                <span className="text-right font-mono text-[12.5px]">
                  {p.valueEur !== undefined ? money(p.valueEur) : '—'}
                  {p.changePct !== undefined ? (
                    <span
                      className={`block text-[11px] ${p.changePct >= 0 ? 'text-state-good' : 'text-state-danger'}`}
                    >
                      {p.changePct >= 0 ? '▲' : '▼'}{' '}
                      {Math.abs(p.changePct).toFixed(2)}%
                    </span>
                  ) : null}
                </span>
              </div>
              {d.keep ? (
                <div className="flex flex-wrap items-center gap-2 pl-8">
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
                    <select
                      value={d.candidate?.symbol ?? ''}
                      onChange={(e) => {
                        if (e.target.value === '__search') setSearching(i)
                        else
                          set(i, {
                            candidate:
                              p.candidates.find(
                                (c) => c.symbol === e.target.value,
                              ) ?? d.candidate,
                          })
                      }}
                      aria-label={`Ticker for ${p.name}`}
                      className={`${FIELD} max-w-full py-1.5 font-mono text-[12px]`}
                    >
                      {d.candidate === null ? (
                        <option value="">pick a ticker</option>
                      ) : null}
                      {d.candidate &&
                      !p.candidates.some(
                        (c) => c.symbol === d.candidate?.symbol,
                      ) ? (
                        <option value={d.candidate.symbol}>
                          {d.candidate.symbol} · {d.candidate.name}
                        </option>
                      ) : null}
                      {p.candidates.map((c) => (
                        <option key={c.symbol} value={c.symbol}>
                          {c.symbol} · {c.exchange} · {c.name}
                        </option>
                      ))}
                      <option value="__search">search another…</option>
                    </select>
                  )}
                  <label
                    className={`${FIELD} inline-flex w-36 items-center gap-1.5 py-1.5`}
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
                      sh
                    </span>
                    {d.sharesCalc ? (
                      <span className="rounded-[4px] bg-lav-400/14 px-1 font-mono text-[9.5px] text-lav-300">
                        calc
                      </span>
                    ) : null}
                  </label>
                  <label
                    className={`${FIELD} inline-flex w-40 items-center gap-1.5 py-1.5`}
                  >
                    <span className="font-mono text-[11px] text-ink-500">
                      €
                    </span>
                    <input
                      inputMode="decimal"
                      value={d.price}
                      onChange={(e) =>
                        set(i, { price: e.target.value, priceCalc: false })
                      }
                      aria-label={`What you paid per share of ${p.name}`}
                      className="w-full bg-transparent font-mono text-[12.5px] focus:outline-none"
                    />
                    <span className="font-mono text-[10px] text-ink-500">
                      /sh
                    </span>
                    {d.priceCalc ? (
                      <span className="rounded-[4px] bg-lav-400/14 px-1 font-mono text-[9.5px] text-lav-300">
                        calc
                      </span>
                    ) : null}
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
      </Section>
      <label className={`${FIELD} flex items-center gap-2`}>
        <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
          free cash in the account €
        </span>
        <input
          inputMode="decimal"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          placeholder={
            intake.cashEur === undefined
              ? 'not on the screen — type it or leave it'
              : ''
          }
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      {intake.totalEur !== undefined ? (
        <span className="font-mono text-[11px] text-ink-500">
          the app states {money(intake.totalEur)} in all
        </span>
      ) : null}
      <span className="text-[12px] text-ink-500">
        Want exact shares instead of calc? Tap a position in the broker&apos;s
        app and drop that screen too.
      </span>
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
          disabled={!ready || saving}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          {mode === 'changes'
            ? `confirm · ${ticked.length} ${ticked.length === 1 ? 'trade' : 'trades'}`
            : `confirm · ${kept.length} positions`}
          {cash.trim() ? ' · cash' : ''}
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
              {pick ? <TickerLogo symbol={pick.symbol} size={22} /> : null}
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

const MONTH_LONG = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

/* After a statement from another month: where its rows went, and a way
   there. */
function Landed({
  count,
  months,
  account,
  onDone,
}: {
  count: number
  months: Array<string>
  account?: string
  onDone: () => void
}) {
  const name = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return MONTH_LONG.format(new Date(y, mo - 1, 1))
  }
  const last = months[months.length - 1]
  return (
    <div className="motion-land flex flex-col gap-4">
      <span className="flex items-center gap-2 text-[16px] text-foreground">
        <Check className="size-4 text-state-good" />
        Added {count} rows{account ? ` to ${account}` : ''}
      </span>
      <p className="text-[13.5px] text-ink-300">
        They are in {months.map(name).join(', ')} — Flow shows one month at a
        time, and opens on this one.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/finances"
          search={{ room: 'flow', month: last }}
          onClick={onDone}
          className={`${PILL_LOUD} justify-center py-2.5`}
        >
          see {name(last)} in Flow →
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
}

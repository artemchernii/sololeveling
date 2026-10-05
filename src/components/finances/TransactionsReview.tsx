import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { FileBadge, ReadBy } from '@/components/finances/Reading'
import { Landed } from '@/components/finances/IntakeLanded'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { dayLabel } from '@/lib/bills'
import { merchantKey } from '@/lib/intake'
import { SPEND_CATEGORIES, categoryLabel } from '@/lib/money'
import { addLabel, groupByDay, rowsSpan } from '@/lib/checkFile'
import {
  Section,
  CreateSuggested,
  AnotherAccount,
} from '@/components/finances/IntakeParts'
import {
  DAY_FMT,
  OrdersFound,
  Kpi,
  Row,
  MoveChip,
  DayHeading,
} from '@/components/finances/TransactionRows'

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

export function TransactionsReview({
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
  const balances = useQuery(api.aggregate.balances, {})
  const [landed, setLanded] = useState<{
    count: number
    months: Array<string>
    orders?: { written: number; skipped: number; noTicker: number }
    accountId?: Id<'accounts'>
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
        accountId={landed.accountId}
        count={landed.count}
        months={landed.months}
        orders={landed.orders}
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
        accountId,
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
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              adding
            </>
          ) : (
            addLabel({
              rows: kept.length,
              noun: noun(kept.length),
              orders,
              balance: keepsBalance,
            })
          )}
        </button>
      </div>
    </div>
  )
}

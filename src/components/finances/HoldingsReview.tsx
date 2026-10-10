import { useEffect, useMemo, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { addedWords } from '@/lib/addedWords'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, ChevronRight, Loader2, Search } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Busy, FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { ReadBy } from '@/components/finances/Reading'
import { HoldingsSummary } from '@/components/finances/HoldingsSummary'
import { ReviewLanded } from '@/components/finances/IntakeLanded'
import { useDayStarts } from '@/components/track/useDayStarts'
import { failureMessage } from '@/lib/convex-errors'
import { money } from '@/lib/currency'
import { metalOf } from '@/lib/holdingLine'
import { lookFamily } from '@/lib/holdings'
import { completePosition } from '@/lib/intake'
import { tickerBase } from '@/lib/market'
import type { Candidate } from '@/lib/market'
import {
  CreateSuggested,
  AnotherAccount,
} from '@/components/finances/IntakeParts'

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
/** Gold and silver are held in ounces, not shares. */
const unit = (symbol: string | undefined) =>
  symbol !== undefined && metalOf(symbol) ? 'oz' : 'sh'

export function HoldingsReview({
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
  /* How many say what they are worth: a file of ounces says none (10
     Oct: unknown was shown as €0). */
  const valued = kept.filter((r) => r.p.valueEur !== undefined).length
  /* Read by code, not by Claude: a file, not a screenshot. */
  const fromFile =
    intake.model !== undefined && !intake.model.startsWith('Claude')
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
                `${sym} ${n > h.shares ? '+' : '−'}${shareText(Math.abs(n - h.shares))} ${unit(sym)}`,
              )
          }
          /* Only what this kind of file lists can be missing from it: a
             gold file says nothing of his coins (10 Oct). */
          const kinds = new Set(
            kept.flatMap((r) =>
              r.d.candidate ? [lookFamily(r.d.candidate)] : [],
            ),
          )
          const gone = heldHere.filter(
            (h) =>
              kinds.has(lookFamily(h)) &&
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

  if (saved && target)
    return (
      <ReviewLanded
        landed={{
          accountId: target,
          added: kept.length,
          what: addedWords({ rows: kept.length, positions: kept.length }),
        }}
        onDone={onDone}
      />
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

      <HoldingsSummary
        targetName={targetName}
        totalEur={intake.totalEur}
        total={total}
        invested={invested}
        count={kept.length}
        valued={valued}
        cash={cash}
        setCash={setCash}
        cashNum={cashNum}
        known={known.length}
        paid={paid}
        gain={gain}
        fromFile={fromFile}
      />

      {changes ? (
        <div className="motion-arrive flex flex-col gap-1.5 rounded-[14px] bg-lav-400/[0.05] p-3 ring-1 ring-lav-400/22 ring-inset">
          <span className="text-[13.5px] text-foreground">
            {changes.out.length === 0 && changes.gone.length === 0
              ? valued === 0
                ? `Same as ${targetName} already has. Nothing new in this file.`
                : `Same shares as ${targetName} already has — only prices moved.`
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
              Not in this file: {changes.gone.map((g) => g.symbol).join(', ')}.
              They stay, in case the list was cut off
            </span>
          ) : null}
          <span className="text-[12px] text-ink-500">
            Saved as today&apos;s look. What you paid is never changed by{' '}
            {fromFile ? 'this file' : 'a screenshot'}.
          </span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[16px] bg-lift/[0.02] ring-1 ring-lift/[0.07] ring-inset">
        <div className="flex justify-between px-3.5 pt-3 pb-2">
          <span className="label-caps">
            {rows.length} {rows.length === 1 ? 'position' : 'positions'}
          </span>
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
                    {n > 0
                      ? `${shareText(n)} ${unit(d.candidate?.symbol)}`
                      : '? sh'}
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
          disabled={!ready || saving}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          <Busy on={saving} doing="saving">
            {target === null
              ? 'pick the account above'
              : `save ${kept.length} ${kept.length === 1 ? 'position' : 'positions'}${cashNum !== null ? ' and the cash' : ''}`}
          </Busy>
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

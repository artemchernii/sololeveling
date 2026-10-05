import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Busy, FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import type { LandedAccount } from '@/components/finances/Landed'
import { TickerLogo } from '@/components/finances/Logo'
import { ReadBy } from '@/components/finances/Reading'
import { ReviewLanded } from '@/components/finances/IntakeLanded'
import { money } from '@/lib/currency'
import type { Candidate } from '@/lib/market'
import {
  Section,
  CreateSuggested,
  AnotherAccount,
} from '@/components/finances/IntakeParts'

const TRADE_DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
})

/* A broker's order history: each buy and sell with its own day and price,
   the ticker checked like a holding's, into the broker it came from. */
export function TradesReview({
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
  const [landed, setLanded] = useState<LandedAccount | null>(null)
  const kept = trades
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !drop.has(i) && picks[i])
  const brokers = accounts.filter((a) => a.kinds.includes('broker'))

  async function save() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      const done = await confirm({
        intakeId: intake._id,
        accountId: target,
        rows: kept.map(({ i }) => ({
          index: i,
          candidate: picks[i] as Candidate,
        })),
      })
      setLanded({ accountId: target, added: done.written })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
          : 'Not saved',
      )
      setSaving(false)
    }
  }

  if (landed) return <ReviewLanded landed={landed} onDone={onDone} />

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
          <Busy on={saving} doing="adding">
            confirm · {kept.length} trades
          </Busy>
        </button>
      </div>
    </>
  )
}

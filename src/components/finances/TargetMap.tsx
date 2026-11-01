import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Pencil } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Part } from '@/components/finances/PortfolioMap'
import { Veiled } from '@/components/finances/Veil'
import { SaveLabel, useSave } from '@/components/Saving'
import { euros } from '@/lib/money'
import { BUCKETS, markOf, nowBy, split, toPlace } from '@/lib/targets'
import type { Bucket, Target } from '@/lib/targets'

/* TARGET, the fourth lens of WHERE THE MONEY IS (31 Oct, mockup
   targets.html, his "Go"): each bucket's euros now against his own range,
   and the cash waiting split by src/lib/targets.ts; what no bucket misses
   stays cash. A press on a bucket keeps its rows in the list below, as
   the other lenses do. */

export const TONE: Record<Bucket, string> = {
  stocks: 'var(--color-lav-400)',
  gold: 'var(--money-cash)',
  bonds: 'var(--area-knowledge)',
  crypto: 'var(--state-warn)',
}
const CASH_TONE = 'var(--color-ink-400)'

type Row = {
  symbol: string
  type: string
  name: string
  valueEur: number | null
}

const BADGE =
  'inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[9.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase ring-1 ring-inset'

function range(t: Target | undefined) {
  if (t === undefined) return ''
  if (t.min === t.max) return `target ${euros(t.min)}`
  if (t.min === 0) return `target up to ${euros(t.max)}`
  return `target ${euros(t.min)}–${euros(t.max)}`
}

function Badge({ now, t }: { now: number; t: Target | undefined }) {
  if (t === undefined)
    return <span className={`${BADGE} text-ink-400 ring-lift/20`}>not set</span>
  const m = markOf(now, t)
  if (m.kind === 'add')
    return (
      <span
        className={`${BADGE} bg-state-danger/14 text-state-danger ring-state-danger/35`}
      >
        to add <Veiled>{euros(Math.round(m.eur))}</Veiled>
      </span>
    )
  if (m.kind === 'above')
    return (
      <span className={`${BADGE} text-state-warn ring-state-warn/40`}>
        above · {euros(m.max)} max
      </span>
    )
  return (
    <span
      className={`${BADGE} bg-state-good/10 text-state-good ring-state-good/30`}
    >
      <Check className="size-3" strokeWidth={2.5} /> in target
    </span>
  )
}

export function TargetMap({
  rows,
  part,
  onPart,
}: {
  rows: ReadonlyArray<Row>
  part: Part
  onPart: (next: Part) => void
}) {
  const targets = useQuery(api.targets.list, {})
  const balances = useQuery(api.aggregate.balances, {})
  const [editing, setEditing] = useState(false)
  if (targets === undefined || balances === undefined) return null

  const now = nowBy(rows)
  const of = (b: Bucket) => targets.find((t) => t.bucket === b)
  const accounts = balances.accounts
  /* As the Treasury's hero: free cash is banks and cash; a broker's cash
     is all of a broker-only account's, and a bank-broker's broker line. */
  const free = accounts
    .filter((a) => a.kinds.includes('bank') || a.kinds.includes('cash'))
    .reduce((s, a) => s + a.cashEur, 0)
  const atBrokers = accounts
    .filter((a) => a.kinds.includes('broker'))
    .reduce(
      (s, a) =>
        s + (a.kinds.includes('bank') ? (a.brokerCash?.eur ?? 0) : a.cashEur),
      0,
    )
  const cash = toPlace(free, atBrokers)
  const puts = targets.length > 0 ? split(cash, now, targets) : []
  const on = (b: Bucket) => part?.lens === 'target' && part.key === b
  const filled = puts.filter((p) => p.bucket !== 'cash')
  const inTarget = targets.filter(
    (t) => markOf(now[t.bucket], t).kind === 'in',
  ).length

  if (editing)
    return <TargetEdit targets={targets} onClose={() => setEditing(false)} />

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${BADGE} motion-press text-lav-300 ring-lav-400/45 hover:bg-lav-400/10`}
        >
          <Pencil className="size-3" /> targets
        </button>
      </div>
      <div className="-mx-2 flex flex-col gap-1">
        {BUCKETS.map((b, i) => {
          const t = of(b)
          const top = Math.max(now[b], t?.max ?? 0, 1) * 1.15
          return (
            <button
              key={b}
              type="button"
              data-testid="target-row"
              aria-pressed={on(b)}
              onClick={() => onPart(on(b) ? null : { lens: 'target', key: b })}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`motion-arrive grid grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-2 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-lift/[0.06] sm:grid-cols-[96px_minmax(0,1fr)_200px_auto] ${
                on(b) ? 'bg-lift/[0.07]' : ''
              }`}
            >
              <span className="label-caps flex items-center gap-2 text-ink-200">
                <i
                  className="inline-block size-2 rounded-[2px]"
                  style={{ background: TONE[b] }}
                />
                {b}
              </span>
              <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                <span className="relative block h-2.5 rounded-full bg-lift/[0.07]">
                  {t !== undefined ? (
                    <span
                      className="absolute -inset-y-[3px] rounded-full border-[1.5px] border-dashed opacity-60"
                      style={{
                        left: `${(t.min / top) * 100}%`,
                        width: `${Math.max(((t.max - t.min) / top) * 100, 1.2)}%`,
                        borderColor: TONE[b],
                      }}
                    />
                  ) : null}
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                    style={{
                      width: `${(now[b] / top) * 100}%`,
                      background: TONE[b],
                    }}
                  />
                </span>
              </span>
              <span className="col-span-2 row-start-3 flex flex-wrap gap-x-2.5 font-mono text-[12px] sm:col-span-1 sm:row-start-auto sm:flex-col sm:gap-0">
                <span className="font-semibold text-foreground">
                  now <Veiled>{euros(Math.round(now[b]))}</Veiled>
                </span>
                <span className="text-[10.5px] tracking-[0.04em] text-ink-500 uppercase">
                  {range(t)}
                </span>
              </span>
              <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                <Badge now={now[b]} t={t} />
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-lift/10 pt-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="label-caps">to place</span>
          <span className="text-[28px] leading-none font-light text-foreground">
            <Veiled>{euros(Math.round(cash))}</Veiled>
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.04em] text-ink-500 uppercase">
            free cash <Veiled>{euros(Math.round(free))}</Veiled> · broker cash{' '}
            <Veiled>{euros(Math.round(atBrokers))}</Veiled>
          </span>
        </div>
        {targets.length === 0 ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${BADGE} motion-press self-start text-lav-300 ring-lav-400/45 hover:bg-lav-400/10`}
          >
            <Pencil className="size-3" /> set targets
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {puts.map((p, i) => {
              const t = p.bucket === 'cash' ? undefined : of(p.bucket)
              const tone = p.bucket === 'cash' ? CASH_TONE : TONE[p.bucket]
              return (
                <div
                  key={p.bucket}
                  data-testid="target-put"
                  style={{ animationDelay: `${200 + i * 80}ms` }}
                  className="motion-arrive flex min-w-[200px] flex-1 items-center gap-2.5 rounded-[12px] bg-lift/[0.04] px-3 py-2.5 ring-1 ring-lift/10 ring-inset"
                >
                  <i
                    className="inline-block size-2 rounded-[2px]"
                    style={{ background: tone }}
                  />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="label-caps text-ink-200">{p.bucket}</span>
                    <span className="font-mono text-[10px] tracking-[0.04em] text-ink-500 uppercase">
                      {p.bucket !== 'cash' && t !== undefined ? (
                        <>
                          to add <Veiled>{euros(Math.round(p.misses))}</Veiled>{' '}
                          · now{' '}
                          <Veiled>{euros(Math.round(now[p.bucket]))}</Veiled> ·
                          target {euros(t.min)}
                        </>
                      ) : (
                        <>
                          to place <Veiled>{euros(Math.round(cash))}</Veiled>
                          {filled.length > 0
                            ? filled.map((f) => (
                                <span key={f.bucket}>
                                  {' '}
                                  · {f.bucket} <Veiled>{euros(f.eur)}</Veiled>
                                </span>
                              ))
                            : ` · ${inTarget} in target`}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="font-mono text-[17px] font-semibold text-foreground">
                    <Veiled>{euros(p.eur)}</Veiled>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* Min and max per bucket, one save for all; a bucket left empty is not
   saved. */
function TargetEdit({
  targets,
  onClose,
}: {
  targets: ReadonlyArray<Target>
  onClose: () => void
}) {
  const save = useMutation(api.targets.save)
  const { status, run, settle, busy } = useSave()
  const [failed, setFailed] = useState(false)
  const start = (b: Bucket) => targets.find((t) => t.bucket === b)
  const [form, setForm] = useState(
    () =>
      Object.fromEntries(
        BUCKETS.map((b) => [
          b,
          {
            min: String(start(b)?.min ?? ''),
            max: String(start(b)?.max ?? ''),
          },
        ]),
      ) as Record<Bucket, { min: string; max: string }>,
  )
  const num = (s: string) =>
    s.trim() === '' ? 0 : Number(s.replace(/[^\d.]/g, ''))
  const out: Array<Target> = BUCKETS.filter(
    (b) => form[b].min.trim() !== '' || form[b].max.trim() !== '',
  ).map((b) => ({ bucket: b, min: num(form[b].min), max: num(form[b].max) }))
  const valid = out.every((t) => t.min >= 0 && t.max >= t.min)
  const field = (b: Bucket, k: 'min' | 'max', label: string) => (
    <label className="flex flex-col gap-1">
      <span className="label-caps text-[9.5px]">{label}</span>
      <input
        inputMode="numeric"
        aria-label={`${b} ${label}`}
        value={form[b][k]}
        onChange={(e) =>
          setForm((f) => ({ ...f, [b]: { ...f[b], [k]: e.target.value } }))
        }
        className="w-full rounded-[10px] bg-lift/[0.05] px-2.5 py-2 font-mono text-[14px] text-foreground ring-1 ring-lift/12 ring-inset outline-none focus:ring-lav-400/60"
      />
    </label>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[70px_1fr_1fr] items-end gap-x-3.5 gap-y-2.5 sm:grid-cols-[96px_1fr_1fr]">
        {BUCKETS.map((b) => (
          <div key={b} className="contents">
            <span className="label-caps flex items-center gap-2 pb-2.5 text-ink-200">
              <i
                className="inline-block size-2 rounded-[2px]"
                style={{ background: TONE[b] }}
              />
              {b}
            </span>
            {field(b, 'min', 'min €')}
            {field(b, 'max', 'max €')}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        {failed ? (
          <span className={`${BADGE} text-state-danger ring-state-danger/35`}>
            not saved
          </span>
        ) : null}
        {!valid ? (
          <span className={`${BADGE} text-state-warn ring-state-warn/40`}>
            max under min
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={`${BADGE} motion-press text-ink-300 ring-lift/20`}
        >
          close
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => {
            setFailed(false)
            run(() => save({ targets: out })).catch(() => setFailed(true))
          }}
          className="motion-press rounded-full bg-lav-400 px-5 py-2 font-mono text-[10.5px] font-bold tracking-[0.14em] text-background uppercase disabled:opacity-50"
        >
          <SaveLabel
            status={status}
            onSettled={() => {
              settle()
              onClose()
            }}
          >
            save
          </SaveLabel>
        </button>
      </div>
    </div>
  )
}

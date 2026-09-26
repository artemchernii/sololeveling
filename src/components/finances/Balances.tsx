import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CandlestickChart, Check, Landmark, Plus, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  FIELD,
  PILL_LOUD,
  PILL_QUIET,
  Panel,
  Sparkline,
} from '@/components/finances/bits'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { agoLabel } from '@/lib/format'
import { euros } from '@/lib/money'
import { Veiled, VeilToggle } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'

/* Balances (Finances F2, 26 Sep): his sheet, in the app. One card per
   account — what it holds, when he last read it off the bank's app, and a
   line through his readings. Tap the number, type, Enter: a new reading
   (a same-day one replaces that day's). The total sits in the hero. */
export function Balances() {
  const data = useQuery(api.aggregate.balances, {})
  const worth = useQuery(api.aggregate.worth, {})
  const [adding, setAdding] = useState(false)

  return (
    <Panel
      title="accounts"
      aside={
        <>
          <VeilToggle />
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className={PILL_QUIET}
          >
            {adding ? <X className="size-3" /> : <Plus className="size-3" />}
            {adding ? 'cancel' : 'account'}
          </button>
        </>
      }
    >
      {adding ? <AddAccount onDone={() => setAdding(false)} /> : null}
      {data === undefined ? (
        <SkeletonRows rows={2} twoLine rowClassName="py-4" />
      ) : data.accounts.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Landmark className="size-6 text-area" />
          <p className="max-w-sm text-[13.5px] text-ink-400">
            Add where your money sits — Revolut, BPI, a broker — and what each
            holds. The total lands in the header, as of your oldest reading.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={PILL_LOUD}
          >
            <Plus className="size-3" />
            first account
          </button>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {data.accounts.map((a, i) => (
            <AccountCard
              key={a.accountId}
              account={a}
              held={worth?.byAccount.find((w) => w.accountId === a.accountId)}
              delay={i * 50}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}

function AddAccount({ onDone }: { onDone: () => void }) {
  const create = useMutation(api.accounts.create)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'bank' | 'broker'>('bank')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (name.trim().length === 0) return
    try {
      await create({ name, kind })
      onDone()
    } catch (e) {
      setError(
        e instanceof Error ? e.message.replace(/^.*: /, '') : 'Not saved',
      )
    }
  }

  return (
    <div className="motion-arrive flex flex-wrap items-center gap-2 rounded-[14px] bg-lav-400/6 p-3 ring-1 ring-lav-400/25 ring-inset">
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
        }}
        placeholder="Revolut"
        aria-label="Account name"
        className={`${FIELD} min-w-0 flex-1`}
      />
      {(['bank', 'broker'] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => setKind(k)}
          aria-pressed={kind === k}
          className={kind === k ? PILL_LOUD : PILL_QUIET}
        >
          {k === 'bank' ? (
            <Landmark className="size-3" />
          ) : (
            <CandlestickChart className="size-3" />
          )}
          {k}
        </button>
      ))}
      <button type="button" onClick={() => void save()} className={PILL_LOUD}>
        <Check className="size-3" />
        add
      </button>
      {error ? (
        <span className="w-full font-mono text-[11px] text-state-warn">
          {error}
        </span>
      ) : null}
    </div>
  )
}

type Account = {
  accountId: Id<'accounts'>
  name: string
  kind: 'bank' | 'broker'
  value: number | null
  recordedAt: number | null
}

function AccountCard({
  account,
  held,
  delay,
}: {
  account: Account
  held: { invested: number | null; positions: number } | undefined
  delay: number
}) {
  const today = useDayStarts(1).at(-1) as number
  const setBalance = useMutation(api.accounts.setBalance)
  const retire = useMutation(api.accounts.retire)
  const remove = useMutation(api.accounts.remove)
  const history = useQuery(api.aggregate.stateHistory, {
    key: `balance:${account.accountId}`,
    start: today - 180 * 86_400_000,
    end: today + 2 * 86_400_000,
  })
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [burst, setBurst] = useState(0)
  const [confirmRetire, setConfirmRetire] = useState(false)

  async function save() {
    const n = Number(text.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n)) return
    setEditing(false)
    if (
      n === account.value &&
      account.recordedAt !== null &&
      account.recordedAt >= today
    ) {
      return
    }
    await setBalance({
      accountId: account.accountId,
      value: n,
      dayStart: today,
    })
    setBurst((b) => b + 1)
  }

  const Icon = account.kind === 'bank' ? Landmark : CandlestickChart
  const stale =
    account.recordedAt !== null && today - account.recordedAt > 30 * 86_400_000

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="motion-land group relative flex flex-col gap-2 rounded-[16px] bg-lift/[0.035] p-3.5 ring-1 ring-lift/10 ring-inset"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-(--area)/15 text-area">
          <Icon className="size-3.5" />
        </span>
        <span className="flex-1 truncate text-[14.5px] text-foreground">
          {account.name}
        </span>
        {confirmRetire ? (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              /* Removed outright when nothing hangs off it (a typo);
                 otherwise retired, so its trades and bills keep their
                 account. */
              onClick={() =>
                void remove({ accountId: account.accountId }).catch(() =>
                  retire({ accountId: account.accountId }),
                )
              }
              className="font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase"
            >
              remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmRetire(false)}
              className="font-mono text-[10px] tracking-[0.12em] text-ink-500 uppercase"
            >
              keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Retire ${account.name}`}
            onClick={() => setConfirmRetire(true)}
            className="grid size-5 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-300 [@media(hover:none)]:opacity-100"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        {editing ? (
          <input
            autoFocus
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={() => void save()}
            aria-label={`What ${account.name} holds, in euros`}
            className="w-full min-w-0 bg-transparent text-[28px] leading-none font-light text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setText(account.value === null ? '' : String(account.value))
              setEditing(true)
            }}
            className="relative min-w-0 text-left"
            title="Type what it holds now"
          >
            <span
              key={account.value ?? 'none'}
              className={`motion-pop block truncate text-[28px] leading-none font-light ${
                account.value === null ? 'text-ink-500' : 'text-foreground'
              }`}
            >
              {account.value === null ? (
                'tap to add'
              ) : (
                <Veiled>{euros(account.value)}</Veiled>
              )}
            </span>
            {burst > 0 ? <Sparks key={burst} count={12} reach={40} /> : null}
          </button>
        )}
        <Sparkline
          points={(history?.rows ?? [])
            .filter((r) => r.value !== undefined)
            .map((r) => ({ t: r.recordedAt, v: r.value as number }))}
        />
      </div>
      <span
        className={`font-mono text-[11px] ${stale ? 'text-state-warn' : 'text-ink-500'}`}
      >
        {account.recordedAt === null
          ? 'free cash — the money not in shares'
          : `free cash · read ${agoLabel(account.recordedAt)}${stale ? ' — worth a fresh look' : ''}`}
      </span>
      {/* Its investments, apart from its cash (26 Sep): Revolut holds
          both. Tap through to the positions. */}
      {held && held.positions > 0 ? (
        <Link
          to="/finances"
          search={{ tab: 'invest' }}
          className="motion-arrive flex items-center gap-2 border-t border-lift/10 pt-2 text-[13px] text-ink-300 hover:text-foreground"
        >
          <CandlestickChart className="size-3.5 text-area" />
          <span className="flex-1">
            invested · {held.positions}{' '}
            {held.positions === 1 ? 'position' : 'positions'}
          </span>
          <span className="font-mono text-[14px] text-foreground">
            {held.invested === null ? (
              '—'
            ) : (
              <Veiled>{euros(held.invested)}</Veiled>
            )}
          </span>
        </Link>
      ) : null}
    </div>
  )
}

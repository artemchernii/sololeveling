import { useState } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { ChevronRight } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'
import { GroupBadge, PaidChip } from '@/components/finances/GroupBadge'
import { SPEND_CATEGORIES } from '@/lib/money'
import { PayeeMark, PayeeName } from './Payees'
import type { Who } from './Payees'
import { eur } from './time'

/* Spending's parts (split from Spending.tsx, 5 Oct): a section, a row
   with its group picker, a bill made of parts. */

type Detail = FunctionReturnType<typeof api.aggregate.payMonthDetail>
export type Row = Detail['groups'][number]['rows'][number]

/** A bill shows his payee name, or a name the app knows ("Home
    insurance"), else the bill's own. */
export function billWho(w: Who, billName: string): Who {
  return w.source !== null
    ? w
    : {
        ...w,
        name: billName,
        original: w.original ?? (billName !== w.name ? w.name : null),
      }
}

export function Section({
  title,
  sum,
  tone,
  children,
}: {
  title: string
  sum: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between border-b border-lift/10 pb-2">
        <span className="label-caps text-ink-300">{title}</span>
        <span className={`text-[26px] font-light tabular-nums ${tone}`}>
          <Veiled>{sum}</Veiled>
        </span>
      </div>
      {children}
    </div>
  )
}

export function RowLine({
  row,
  who,
  sub,
  account,
  income,
  onName,
  onMoved,
  status,
}: {
  row: Row
  who: Who
  sub: string
  account?: Doc<'accounts'>
  income?: boolean
  onName?: () => void
  /** Money out: its group badge opens the picker, and this hears where
      it went. */
  onMoved?: (n: number, to: string) => void
  /** Under the amount: PAID, for a bill. */
  status?: React.ReactNode
}) {
  const refile = useMutation(api.logs.refile)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const now = row.category ?? null
  return (
    <div className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-lift/4 px-1 py-2.5">
      <PayeeMark who={who} account={account} />
      <span className="min-w-0">
        <PayeeName who={who} onName={onName} />
        {who.original ? (
          <span className="block truncate text-[12px] text-ink-400">
            {who.original}
          </span>
        ) : null}
        <span className="mt-1 flex flex-wrap items-center gap-2">
          {saving ? (
            <span className="font-mono text-[10.5px] text-ink-300">
              <Busy on doing="saving">
                {null}
              </Busy>
            </span>
          ) : income && now === null ? null : (
            <GroupBadge
              kind={income ? 'income' : 'expense'}
              category={now}
              open={picking}
              onClick={onMoved ? () => setPicking(!picking) : undefined}
            />
          )}
          <span className="font-mono text-[10.5px] text-ink-500">{sub}</span>
        </span>
        {picking && onMoved ? (
          <span className="motion-arrive mt-1.5 flex flex-wrap gap-1">
            {SPEND_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicking(false)
                  if (c.id === now) return
                  setSaving(true)
                  void refile({ logId: row.id, category: c.id })
                    .then((n) => onMoved(n, c.id))
                    .finally(() => setSaving(false))
                }}
                className={`rounded-full px-2.5 py-1 text-[12px] ring-1 ring-inset transition-colors ${
                  c.id === now
                    ? 'bg-lav-400/14 text-foreground ring-lav-400/45'
                    : 'text-ink-300 ring-lift/12 hover:text-foreground hover:ring-lift/25'
                }`}
              >
                {c.label}
              </button>
            ))}
          </span>
        ) : null}
        {row.raw && row.raw !== who.name && row.raw !== who.original ? (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-600">
            {row.raw}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className={`font-mono ${income ? 'text-state-good' : ''}`}>
          <Veiled>
            {income ? '+' : '−'}
            {eur(row.amount, true)}
          </Veiled>
        </span>
        {status}
      </span>
    </div>
  )
}

/** One thing made of several bills (Mortgage): one line, opening into its parts. */
export function Parts({
  name,
  open,
  onToggle,
  total,
  sub,
  account,
  children,
}: {
  name: string
  open: boolean
  onToggle: () => void
  total: number
  sub: string
  account?: Doc<'accounts'>
  children: React.ReactNode
}) {
  const count = Array.isArray(children) ? children.length : 1
  return (
    <div className="border-b border-lift/4">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] px-1 py-2.5 text-left transition-colors hover:bg-lift/[0.035]"
      >
        <PayeeMark
          who={{
            key: name,
            name,
            original: null,
            domain: null,
            partOf: null,
            source: null,
          }}
          account={account}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14px]">
            {name}
            <ChevronRight
              className={`size-3.5 text-ink-500 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <span className="rounded-[5px] bg-lav-400/10 px-1.5 py-px font-mono text-[9px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/25 ring-inset">
              {count} parts
            </span>
          </span>
          <span className="block font-mono text-[10.5px] text-ink-500">
            {sub}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="font-mono">
            <Veiled>−{eur(total, true)}</Veiled>
          </span>
          <PaidChip />
        </span>
      </button>
      {open ? (
        <div className="motion-arrive mb-2 ml-2.5 border-l border-lift/8 pl-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <span className="py-3 text-[13px] text-ink-500">{children}</span>
}

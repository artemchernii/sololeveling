import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET, Panel } from '@/components/finances/bits'
import { dayEndsBack } from '@/components/finances/WorthChart'
import { OpenAccount } from '@/components/finances/OpenAccount'
import { SkeletonRows } from '@/components/Skeleton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { ACCOUNT_KINDS } from '@/lib/currency'
import type { AccountKind } from '@/lib/currency'
import { freshness } from '@/lib/freshness'
import { monthRange } from '@/lib/month'
import { paidSums } from '@/components/finances/Portfolio'
import { AccountCard } from '@/components/finances/AccountCard'
import { AccountSheet } from '@/components/finances/AccountForm'
import { UpdateSheet } from '@/components/finances/UpdateSheet'

/* Accounts, in the Overview room (Treasury, 27 Sep). His, not hard-coded:
   filter by what they are, add one, edit or delete one, update one. Each
   card shows what the account holds in all, a line per currency pocket
   (a USD pocket with the euros it is worth), what its investments are worth
   when it holds any, and how fresh it is. */

export function Accounts() {
  const data = useQuery(api.aggregate.balances, {})
  const worth = useQuery(api.aggregate.worth, {})
  const accounts = useQuery(api.accounts.list, {})
  const today = useDayStarts(1).at(-1) as number
  const dayEnds = useMemo(() => dayEndsBack(today, 365), [today])
  const history = useQuery(api.aggregate.cashHistory, { dayEnds })
  const { monthStart, nextStart } = monthRange(today)
  const positions = useQuery(api.aggregate.positions, {})
  const month = useQuery(api.aggregate.accountMonth, {
    start: monthStart,
    end: nextStart,
  })
  const [kind, setKind] = useState<AccountKind | 'all'>('all')
  const [editing, setEditing] = useState<Doc<'accounts'> | 'new' | null>(null)
  const [updating, setUpdating] = useState<Doc<'accounts'> | null>(null)
  const [opened, setOpened] = useState<Id<'accounts'> | null>(null)
  const openRow = data?.accounts.find((a) => a.accountId === opened)
  const openDoc = accounts?.find((a) => a._id === opened) ?? null
  const investedOf = (id: Id<'accounts'>) =>
    worth?.byAccount.find((x) => x.accountId === id)?.invested ?? null

  const list = (data?.accounts ?? []).filter(
    (a) => kind === 'all' || a.kinds.includes(kind),
  )

  return (
    <Panel
      title="accounts"
      aside={
        <>
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...ACCOUNT_KINDS] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={kind === k ? PILL_LOUD : PILL_QUIET}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_QUIET}
          >
            <Plus className="size-3" />
            account
          </button>
        </>
      }
    >
      {data === undefined || accounts === undefined ? (
        <SkeletonRows rows={3} twoLine rowClassName="py-4" />
      ) : data.accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="max-w-sm text-[13.5px] text-ink-400">
            Add where your money sits — a bank, a broker, the cash in your
            wallet. Then drop a statement or a screenshot on + and it fills
            itself.
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_LOUD}
          >
            <Plus className="size-3" />
            first account
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-ink-500">
          No {kind} accounts.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a, i) => (
            <AccountCard
              key={a.accountId}
              row={a}
              index={i}
              invested={investedOf(a.accountId)}
              onOpen={() => setOpened(a.accountId)}
              month={
                month?.accounts.find((m) => m.accountId === a.accountId) ?? null
              }
              monthStart={monthStart}
              held={(() => {
                const rows = positions?.rows.filter(
                  (r) => r.accountId === a.accountId,
                )
                return rows?.length ? paidSums(rows) : null
              })()}
              line={
                history?.accounts
                  .find((h) => h.accountId === a.accountId)
                  ?.values.slice(-30) ?? []
              }
              onEdit={() => {
                const doc = accounts.find((x) => x._id === a.accountId)
                if (doc) setEditing(doc)
              }}
              onUpdate={() => {
                const doc = accounts.find((x) => x._id === a.accountId)
                if (doc) setUpdating(doc)
              }}
            />
          ))}
        </div>
      )}

      <StillCounted />
      <AccountSheet account={editing} onClose={() => setEditing(null)} />
      <OpenAccount
        account={openDoc}
        total={
          openRow
            ? Math.round(
                (openRow.cashEur + (investedOf(openRow.accountId) ?? 0)) * 100,
              ) / 100
            : 0
        }
        meta={openRow ? freshness(openRow.pockets, Date.now()).label : ''}
        onClose={() => setOpened(null)}
        onUpdate={() => openDoc && setUpdating(openDoc)}
      />
      <UpdateSheet account={updating} onClose={() => setUpdating(null)} />
    </Panel>
  )
}

/* Deleted accounts whose rows still count (27 Sep: a test account holding
   the same statement as his Revolut made "this month" count twice). One
   line each, and an erase that asks first. */
function StillCounted() {
  const gone = useQuery(api.accounts.retired, {})
  const erase = useMutation(api.accounts.erase)
  const [asking, setAsking] = useState<Id<'accounts'> | null>(null)
  const counted = (gone ?? []).filter((g) => g.rows + g.trades > 0)
  if (counted.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-lift/[0.06] pt-3">
      {counted.map((g) => (
        <div
          key={g.accountId}
          className="motion-land flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-500"
        >
          <span className="min-w-0 flex-1">
            Deleted, still counted:{' '}
            <span className="text-ink-300">{g.name}</span> · {g.rows} row
            {g.rows === 1 ? '' : 's'}
            {g.trades > 0
              ? ` · ${g.trades} trade${g.trades === 1 ? '' : 's'}`
              : ''}
          </span>
          {asking === g.accountId ? (
            <>
              <span className="text-state-warn">
                Erase them? Transfers to your other accounts keep their side.
              </span>
              <button
                type="button"
                onClick={() => setAsking(null)}
                className={PILL_QUIET}
              >
                keep
              </button>
              <button
                type="button"
                onClick={() =>
                  void erase({ accountId: g.accountId }).then(() =>
                    setAsking(null),
                  )
                }
                className="motion-press inline-flex items-center rounded-full bg-state-danger/14 px-3 py-1 text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/45 ring-inset"
              >
                erase
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(g.accountId)}
              className={PILL_QUIET}
            >
              erase
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

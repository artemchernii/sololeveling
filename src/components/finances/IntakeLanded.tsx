import { Link } from '@tanstack/react-router'

import type { Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountsLanded } from '@/components/finances/Landed'
import type { LandedAccount } from '@/components/finances/Landed'

const MONTH_LONG = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

/* After a statement from another month: where its rows went, and a way
   there. */
/** A broker file landed: its account's line, Portfolio, done. */
export function ReviewLanded({
  landed,
  onDone,
}: {
  landed: LandedAccount
  onDone: () => void
}) {
  return (
    <AccountsLanded accounts={[landed]} cash={false}>
      <Link
        to="/finances"
        search={{ room: 'portfolio' }}
        onClick={onDone}
        className={`${PILL_QUIET} justify-center py-2.5`}
      >
        Portfolio →
      </Link>
      <button
        type="button"
        onClick={onDone}
        className={`${PILL_LOUD} justify-center px-8 py-2.5`}
      >
        done
      </button>
    </AccountsLanded>
  )
}

/** What a confirm wrote: one line an account, and the way on. */
export function Landed({
  accountId,
  count,
  months,
  orders,
  onDone,
}: {
  accountId?: Id<'accounts'>
  count: number
  months: Array<string>
  orders?: { written: number; skipped: number; noTicker: number }
  onDone: () => void
}) {
  const last = months.at(-1)
  const name = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return MONTH_LONG.format(new Date(y, mo - 1, 1))
  }
  return (
    <AccountsLanded accounts={accountId ? [{ accountId, added: count }] : []}>
      {orders ? (
        <Link
          to="/finances"
          search={{ room: 'portfolio' }}
          onClick={onDone}
          className={`${PILL_QUIET} justify-center py-2.5`}
        >
          {orders.written} {orders.written === 1 ? 'order' : 'orders'} in
          Portfolio →
        </Link>
      ) : null}
      {last ? (
        <Link
          to="/finances"
          search={{ room: 'flow', month: last }}
          onClick={onDone}
          className={`${PILL_QUIET} justify-center py-2.5`}
        >
          {name(last)} in Flow →
        </Link>
      ) : null}
      <button
        type="button"
        onClick={onDone}
        className={`${PILL_LOUD} justify-center px-8 py-2.5`}
      >
        done
      </button>
    </AccountsLanded>
  )
}

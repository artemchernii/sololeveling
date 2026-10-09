import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { STALE_MS } from '@/lib/freshness'
import { landedTitle } from '@/lib/checkFile'

/* What landed, one line an account (5 Oct, after two rounds: "why we see
   Bolt and Pingo Doce in landed? What if many transactions … bulk upload
   statements"). The question after confirming is "is my account right
   now?", so each account touched is one line — its logo, its name, what
   it holds in each currency, how many rows went in, the day its balance
   is of — the same for one file or sixty. The rows themselves are in
   Flow. */

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

export type LandedAccount = {
  accountId: Id<'accounts'>
  added: number
  /** What came in, in words (addedWords): "1 position added · Gold". */
  what?: string
}

export function AccountsLanded({
  accounts,
  cash = true,
  children,
}: {
  accounts: Array<LandedAccount>
  /** False for a file of trades or holdings: it says nothing about the
      account's cash, so its cash is neither dated nor asked about. */
  cash?: boolean
  /** The way on: Flow, Portfolio, done. */
  children: React.ReactNode
}) {
  const data = useQuery(api.aggregate.balances, {})
  const list = useQuery(api.accounts.list, {})
  const lines = accounts.flatMap((l) => {
    const a = list?.find((x) => x._id === l.accountId)
    const b = data?.accounts.find((x) => x.accountId === l.accountId)
    return a && b ? [{ ...l, account: a, pockets: b.pockets }] : []
  })
  const now = Date.now()
  const old = (p: { recordedAt: number | null }) =>
    p.recordedAt === null || now - p.recordedAt > STALE_MS
  const allFresh = !cash || lines.every((l) => !l.pockets.some(old))
  return (
    <div className="flex flex-col items-center gap-4 py-5">
      <span
        className="motion-pop relative grid size-16 place-items-center rounded-full bg-state-good/16 text-state-good shadow-[0_0_36px_-6px_var(--color-state-good)] ring-1 ring-state-good/45"
        style={{ '--area': 'var(--color-state-good)' } as React.CSSProperties}
      >
        <Check className="size-8" strokeWidth={2.5} />
        <Sparks count={14} reach={46} />
      </span>
      <span className="motion-land text-center text-[24px] font-light text-foreground">
        {landedTitle(
          lines.map((l) => l.account.name),
          allFresh,
        )}
      </span>
      <div className="flex w-full max-w-xl flex-col gap-1.5">
        {lines.map((l, i) => (
          <div
            key={l.accountId}
            style={{ animationDelay: `${200 + i * 80}ms` }}
            className="motion-arrive flex flex-col gap-2 rounded-[14px] bg-lift/[0.04] px-3.5 py-3 ring-1 ring-lift/[0.08] ring-inset"
          >
            <div className="flex items-center gap-3">
              <AccountLogo
                name={l.account.name}
                domain={l.account.domain}
                size={30}
              />
              <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                {l.account.name}
              </span>
              <span className="text-right text-[17px] font-light text-foreground">
                {l.pockets
                  .filter((p) => p.value !== null)
                  .map((p) => money(p.value as number, p.currency))
                  .join(' · ')}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-[42px] font-mono text-[10.5px] text-ink-500">
              <span className={l.added > 0 ? 'text-state-good' : ''}>
                {l.what ?? (l.added > 0 ? `${l.added} added` : 'nothing new')}
              </span>
              {cash ? (
                <>
                  <span>·</span>
                  <span>{asOf(l.pockets.filter((p) => !old(p)))}</span>
                </>
              ) : null}
            </div>
            {cash
              ? l.pockets
                  .filter(old)
                  .map((p) => (
                    <OldPocket
                      key={p.currency}
                      accountId={l.accountId}
                      pocket={p}
                    />
                  ))
              : null}
          </div>
        ))}
      </div>
      <div
        style={{ animationDelay: `${260 + lines.length * 80}ms` }}
        className="motion-arrive flex flex-wrap justify-center gap-2 pt-1"
      >
        {children}
      </div>
    </div>
  )
}

/** The day the fresh balances are of: "Oct 4". */
function asOf(pockets: Array<{ recordedAt: number | null }>): string {
  const at = Math.max(0, ...pockets.map((p) => p.recordedAt ?? 0))
  return at > 0 ? `balance of ${DAY_FMT.format(new Date(at))}` : 'no balance'
}

/** A pocket still old after this: its day, and one press to say it holds. */
function OldPocket({
  accountId,
  pocket,
}: {
  accountId: Id<'accounts'>
  pocket: { currency: string; value: number | null; recordedAt: number | null }
}) {
  const today = useDayStarts(1).at(-1) as number
  const setBalance = useMutation(api.accounts.setBalance)
  const [busy, setBusy] = useState(false)
  if (pocket.value === null) return null
  return (
    <div className="flex items-center gap-2 pl-[42px]">
      <span className="flex-1 font-mono text-[10.5px] text-state-warn">
        {money(pocket.value, pocket.currency)} ·{' '}
        {pocket.recordedAt
          ? `from ${DAY_FMT.format(new Date(pocket.recordedAt))}`
          : 'never set'}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void setBalance({
            accountId,
            currency: pocket.currency,
            value: pocket.value as number,
            dayStart: today,
          }).finally(() => setBusy(false))
        }}
        className="motion-press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-good/10 px-3 py-1 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-state-good uppercase ring-1 ring-state-good/40 ring-inset"
      >
        {busy ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            saving
          </>
        ) : (
          '✓ still the same'
        )}
      </button>
    </div>
  )
}

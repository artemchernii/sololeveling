import { Check, TriangleAlert } from 'lucide-react'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import type { Position } from '@/components/finances/PortfolioList'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import type { Owned } from '@/lib/owned'
import type { Round } from '@/lib/rounds'
import type { soldSums } from '@/lib/sold'

const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const SHORT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

/* The tiles on one position's page: what it is worth, the buy total,
   up or down since, and the accounts it is in (split out of
   PortfolioPosition, 14 Oct). */
export function PositionTiles({
  owned,
  sold,
  gain,
  bought,
  sells,
  since,
  part,
  gap,
  unit,
  accountOf,
}: {
  owned: Owned<Position>
  sold?: ReturnType<typeof soldSums>
  gain: { eur: number; pct: number } | null
  /** How many buys and sells are saved. */
  bought: number
  sells: number
  /** The round held now (src/lib/rounds.ts): PAID counts its buys and
      sells and says its first day, not the rounds sold out before. */
  since?: Round<{
    occurredAt: number
    side: 'buy' | 'sell'
    shares: number
    priceEur: number
  }>
  /** The sum of the buys saved, where they do not reach what is held. */
  part: number | null
  /** The units held that no buy accounts for. */
  gap: number
  unit: (n: number) => string
  accountOf: (id: Id<'accounts'>) => Doc<'accounts'> | undefined
}) {
  const up = (gain?.eur ?? 0) >= 0
  const tone = up ? 'text-state-good' : 'text-state-danger'
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Tile label="worth now" delay={0}>
        <span
          className={`text-[27px] leading-tight tabular-nums ${sold ? 'text-ink-500' : 'text-foreground'}`}
        >
          {owned.valueEur === null ? (
            '—'
          ) : (
            <Veiled>{euros(owned.valueEur)}</Veiled>
          )}
        </span>
        <span className="font-mono text-[11px] text-ink-300">
          {sold ? (
            'all sold'
          ) : (
            <Veiled>{`${owned.shares} ${unit(owned.shares)}`}</Veiled>
          )}
        </span>
      </Tile>
      <Tile
        label={`paid${bought + sells > 0 ? ` · ${since?.buys ?? bought} buy${(since?.sells ?? sells) > 0 ? ` · ${since?.sells ?? sells} sell` : ''}` : ''}`}
        delay={40}
        tone={gap > 0 ? 'warn' : undefined}
      >
        <span
          className={`text-[27px] leading-tight tabular-nums ${owned.paid === null && part === null ? 'text-ink-500' : 'text-foreground'}`}
        >
          {owned.paid !== null ? (
            <Veiled>{euros(owned.paid)}</Veiled>
          ) : part !== null ? (
            <Veiled>{euros(part)}</Veiled>
          ) : (
            '—'
          )}
        </span>
        {since && (owned.paid !== null || part !== null) ? (
          <span className="flex">
            <span
              data-testid="paid-since"
              className="rounded-full bg-lift/[0.06] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-300 uppercase"
            >
              since {FULL.format(new Date(since.from))}
            </span>
          </span>
        ) : null}
        {gap > 0 ? (
          /* Buys saved, and not all of them: the two numbers, and the
             state in colour (14 Oct: "BUY TOTAL still confusing"). */
          <span
            data-testid="buys-missing"
            className="flex flex-col gap-0.5 font-mono text-[11px]"
          >
            <span className="text-ink-300">
              <b className="font-medium text-foreground">
                <Veiled>{Number((owned.shares - gap).toFixed(6))}</Veiled>
              </b>{' '}
              of{' '}
              <b className="font-medium text-foreground">
                <Veiled>{owned.shares}</Veiled>
              </b>{' '}
              {unit(owned.shares)}
            </span>
            <span className="flex items-center gap-1.5 text-state-warn">
              <TriangleAlert className="motion-pulse size-3 shrink-0" />
              <Veiled>{`${Number(gap.toFixed(6))} ${unit(gap)}`}</Veiled>{' '}
              missing
            </span>
          </span>
        ) : owned.paid !== null ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-state-good">
            <Check className="size-3 shrink-0" />
            every buy in
          </span>
        ) : (
          <span className="font-mono text-[11px] text-ink-400">
            not in the files yet · add buys
          </span>
        )}
      </Tile>
      {sold ? (
        <Tile label="sold for" delay={80}>
          <span className="text-[27px] leading-tight text-foreground tabular-nums">
            {sold.got === null ? '—' : <Veiled>{euros(sold.got)}</Veiled>}
          </span>
          <span className="font-mono text-[11px] text-ink-300">
            {sold.got === null
              ? 'not in the files yet'
              : FULL.format(new Date(sold.day))}
          </span>
        </Tile>
      ) : null}
      <Tile
        label={
          sold
            ? gain === null
              ? 'when sold'
              : `${up ? 'up' : 'down'} when sold`
            : gain === null
              ? 'since bought'
              : `${up ? 'up' : 'down'} since ${since ? SHORT.format(new Date(since.from)) : 'bought'}`
        }
        delay={sold ? 120 : 80}
        tone={gain === null ? undefined : up ? 'good' : 'danger'}
      >
        {gain === null ? (
          <>
            <span className="text-[27px] leading-tight text-ink-500">—</span>
            {sold ? null : (
              <span className="font-mono text-[11px] text-ink-400">
                {gap > 0 ? 'needs every buy' : 'needs a buy'}
              </span>
            )}
          </>
        ) : (
          <>
            <span className={`text-[27px] leading-tight tabular-nums ${tone}`}>
              <Veiled>{`${up ? '+' : '−'}${euros(Math.abs(gain.eur))}`}</Veiled>
            </span>
            <span className={`font-mono text-[11px] ${tone}`}>
              {up ? '▲' : '▼'} {Math.abs(gain.pct).toFixed(1)}%
            </span>
          </>
        )}
      </Tile>
      {sold ? null : owned.stakedEur !== null && owned.at.length === 1 ? (
        <Tile label="from staking" delay={120}>
          <span className="text-[27px] leading-tight text-state-good tabular-nums">
            <Veiled>{euros(owned.stakedEur)}</Veiled>
          </span>
          <span className="font-mono text-[11px] text-ink-300">
            <Veiled>{`${Number(owned.staked.toFixed(4))} ${unit(owned.staked)}`}</Veiled>{' '}
            · not counted as income
          </span>
        </Tile>
      ) : (
        <Tile label={owned.at.length > 1 ? 'accounts' : 'account'} delay={120}>
          {owned.at.map((r) => {
            const a = accountOf(r.accountId)
            return (
              <span
                key={r.accountId}
                className="flex min-h-5 items-center justify-between gap-2 font-mono text-[12px]"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-ink-300">
                  <AccountLogo
                    name={a?.name ?? ''}
                    domain={a?.domain}
                    size={14}
                  />
                  <span className="truncate">{a?.name}</span>
                </span>
                <span className="text-foreground">
                  {r.valueEur === null ? (
                    '—'
                  ) : (
                    <Veiled>{euros(r.valueEur)}</Veiled>
                  )}
                </span>
              </span>
            )
          })}
        </Tile>
      )}
    </div>
  )
}

function Tile({
  label,
  delay,
  tone,
  children,
}: {
  label: string
  delay: number
  /** A state, said with the tile's colour (14 Oct: "very bland"). */
  tone?: 'warn' | 'good' | 'danger'
  children: React.ReactNode
}) {
  const look =
    tone === 'warn'
      ? 'bg-state-warn/[0.07] ring-state-warn/35'
      : tone === 'good'
        ? 'bg-state-good/[0.06] ring-state-good/30'
        : tone === 'danger'
          ? 'bg-state-danger/[0.06] ring-state-danger/30'
          : 'bg-lift/[0.035] ring-lift/7'
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`motion-arrive flex flex-col gap-1 rounded-[14px] p-3 ring-1 ring-inset ${look}`}
    >
      <span className="label-caps text-ink-300">{label}</span>
      {children}
    </div>
  )
}

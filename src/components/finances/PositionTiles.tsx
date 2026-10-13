import { TriangleAlert } from 'lucide-react'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import type { Position } from '@/components/finances/PortfolioList'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import type { Owned } from '@/lib/owned'
import type { soldSums } from '@/lib/sold'

const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/* The tiles on one position's page: what it is worth, the buy total,
   up or down since, and the accounts it is in (split out of
   PortfolioPosition, 14 Oct). */
export function PositionTiles({
  owned,
  sold,
  gain,
  bought,
  part,
  gap,
  unit,
  accountOf,
}: {
  owned: Owned<Position>
  sold?: ReturnType<typeof soldSums>
  gain: { eur: number; pct: number } | null
  /** How many buys are saved. */
  bought: number
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
          className={`text-[22px] leading-tight font-light tabular-nums ${sold ? 'text-ink-500' : 'text-foreground'}`}
        >
          {owned.valueEur === null ? (
            '—'
          ) : (
            <Veiled>{euros(owned.valueEur)}</Veiled>
          )}
        </span>
        <span className="font-mono text-[10.5px] text-ink-500">
          {sold ? (
            'all sold'
          ) : (
            <Veiled>{`${owned.shares} ${unit(owned.shares)}`}</Veiled>
          )}
        </span>
      </Tile>
      <Tile label="buy total" delay={40}>
        <span className="text-[22px] leading-tight font-light text-foreground tabular-nums">
          {owned.paid !== null ? (
            <Veiled>{euros(owned.paid)}</Veiled>
          ) : part !== null ? (
            <Veiled>{euros(part)}</Veiled>
          ) : (
            '—'
          )}
        </span>
        {owned.paid === null && part !== null ? (
          /* Buys saved, and not all of them: a state, not grey words. */
          <span
            data-testid="buys-missing"
            className="flex items-center gap-1.5 font-mono text-[10.5px] text-state-warn"
          >
            <TriangleAlert className="motion-pulse size-3 shrink-0" />
            <span>
              {bought} {bought === 1 ? 'buy' : 'buys'} ·{' '}
              <Veiled>{`${Number(gap.toFixed(6))} ${unit(gap)}`}</Veiled>{' '}
              missing
            </span>
          </span>
        ) : (
          <span className="font-mono text-[10.5px] text-ink-500">
            {owned.paid === null
              ? 'not in the files yet'
              : bought > 0
                ? `${bought} ${bought === 1 ? 'buy' : 'buys'}`
                : ''}
          </span>
        )}
      </Tile>
      {sold ? (
        <Tile label="sold for" delay={80}>
          <span className="text-[22px] leading-tight font-light text-foreground tabular-nums">
            {sold.got === null ? '—' : <Veiled>{euros(sold.got)}</Veiled>}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
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
              : `${up ? 'up' : 'down'} since bought`
        }
        delay={sold ? 120 : 80}
      >
        {gain === null ? (
          <span className="text-[22px] leading-tight font-light text-ink-500">
            —
          </span>
        ) : (
          <>
            <span
              className={`text-[22px] leading-tight font-light tabular-nums ${tone}`}
            >
              <Veiled>{`${up ? '+' : '−'}${euros(Math.abs(gain.eur))}`}</Veiled>
            </span>
            <span className={`font-mono text-[10.5px] ${tone}`}>
              {up ? '▲' : '▼'} {Math.abs(gain.pct).toFixed(1)}%
            </span>
          </>
        )}
      </Tile>
      {sold ? null : owned.stakedEur !== null && owned.at.length === 1 ? (
        <Tile label="from staking" delay={120}>
          <span className="text-[22px] leading-tight font-light text-state-good tabular-nums">
            <Veiled>{euros(owned.stakedEur)}</Veiled>
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
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
  children,
}: {
  label: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="motion-arrive flex flex-col gap-1 rounded-[14px] bg-lift/[0.035] p-3 ring-1 ring-lift/7 ring-inset"
    >
      <span className="label-caps">{label}</span>
      {children}
    </div>
  )
}

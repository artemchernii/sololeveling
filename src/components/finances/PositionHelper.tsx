import type { ReactNode } from 'react'

import type { Lines } from '@/components/finances/ChartLines'
import { PositionFundamentals } from '@/components/finances/PositionFundamentals'
import { PositionNews } from '@/components/finances/PositionNews'
import { PositionTabs, useKeptTab } from '@/components/finances/PositionSignals'
import { PositionVerdict } from '@/components/finances/PositionVerdict'
import { usePositionFeeds } from '@/components/finances/usePositionFeeds'
import { ARROW, WAY_TEXT } from '@/components/finances/ChartLines'
import type { Id } from '../../../convex/_generated/dataModel'
import type { Way } from '@/lib/indicators'
import { fundWays } from '@/lib/indicators'

/* The portfolio helper under a position's chart (16 Oct, mockup
   fundamentals.html): the verdict above the tabs, so it stays in view
   on every tab, and the tabs — SIGNALS, FUNDAMENTALS, NEWS, BUYS AND
   SELLS. Sold out: no verdict, SIGNALS and BUYS AND SELLS only. */
export function PositionHelper({
  instrumentId,
  name,
  share,
  held,
  lines,
  say,
  trades,
  count,
  asOf,
}: {
  instrumentId: Id<'instruments'>
  name: string
  /** A share (EQUITY) has fundamentals; a fund has none. */
  share: boolean
  /** Something is held now (not sold out) and has closes. */
  held: boolean
  lines: Lines
  say: (v: number) => string
  trades: ReactNode
  count: number
  /** The day of the latest stored close. */
  asOf: number | null
}) {
  const [tab, setTab] = useKeptTab()
  const feeds = usePositionFeeds(instrumentId, held)
  const price = lines.rows.at(0)?.price ?? 0
  const r = feeds.fund?.reading
  const ways = r
    ? Object.values(
        fundWays(
          {
            asOf: r.asOf,
            targetMean: r.target?.mean,
            revenueGrowth: r.revenueGrowth,
            ratingMean: r.rating?.mean,
          },
          price,
        ),
      )
    : []
  /* P/E and dividend are shown, not read: counted flat on the tab. */
  const flat = (r?.pe ? 1 : 0) + (r?.dividend ? 1 : 0)
  const n = (w: Way) =>
    ways.filter((x) => x === w).length + (w === 'flat' ? flat : 0)
  const tail = (body: ReactNode) => (
    <span className="flex gap-1.5 tracking-[0.06em]">{body}</span>
  )
  return (
    <div className="flex flex-col gap-3">
      {held && asOf !== null ? (
        <PositionVerdict
          rows={lines.rows}
          avg={lines.avg?.price ?? null}
          asOf={asOf}
          say={say}
          fund={feeds.fund}
          share={share}
          updating={feeds.updating}
          news={feeds.news}
          onTab={setTab}
        />
      ) : null}
      <PositionTabs
        lines={lines}
        say={say}
        trades={trades}
        count={count}
        tab={tab}
        onTab={setTab}
        fund={
          held
            ? {
                label: tail(
                  share && r ? (
                    (['up', 'down', 'flat'] as const).map((w) => (
                      <span key={w} className={WAY_TEXT[w]}>
                        {n(w)} {ARROW[w]}
                      </span>
                    ))
                  ) : (
                    <span className="text-ink-400">{share ? '' : 'fund'}</span>
                  ),
                ),
                body: (
                  <PositionFundamentals
                    fund={feeds.fund}
                    share={share}
                    updating={feeds.updating}
                    price={price}
                    name={name}
                    say={say}
                  />
                ),
              }
            : undefined
        }
        news={
          held
            ? {
                label: tail(
                  feeds.news.state === 'ok' ? (
                    <span className="text-ink-400">
                      {feeds.news.items.length}
                    </span>
                  ) : feeds.news.state === 'failed' ? (
                    <span className="text-state-warn">!</span>
                  ) : (
                    <i className="size-[7px] self-center animate-pulse rounded-full bg-lav-400" />
                  ),
                ),
                body: <PositionNews news={feeds.news} onRetry={feeds.retry} />,
              }
            : undefined
        }
      />
    </div>
  )
}

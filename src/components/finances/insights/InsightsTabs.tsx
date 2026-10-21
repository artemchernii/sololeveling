import { useEffect, useState } from 'react'

import type { Kind } from '@/lib/marketRead'

/* The room in four tabs (21 Oct, mockup
   design/treasury-mockup/insights-tabs.html, his "go on tabs and
   drawer" after "maybe lets devided this page into tabs"). The hero stays
   on top; under it a sticky bar, 1 MARKET · 2 READ · 3 MINE · 4 IDEAS,
   each with a badge from what the page already holds. One band shows at
   a time. The tab pressed last is kept on this device. */

export type Tab = 'market' | 'read' | 'mine' | 'ideas'

export const TABS: Array<{ id: Tab; n: number; name: string }> = [
  { id: 'market', n: 1, name: 'MARKET' },
  { id: 'read', n: 2, name: 'READ' },
  { id: 'mine', n: 3, name: 'MINE' },
  { id: 'ideas', n: 4, name: 'IDEAS' },
]

/** The tile a read line of this kind is about, and the tab it sits in. */
export const TILE_OF: Partial<Record<Kind, { tab: Tab; tile: string }>> = {
  inflation: { tab: 'market', tile: 'inflation' },
  rates: { tab: 'market', tile: 'rates' },
  market: { tab: 'market', tile: 'markets' },
  allocation: { tab: 'mine', tile: 'allocation' },
  dont: { tab: 'mine', tile: 'positions' },
}

const KEY = 'insights-tab'
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v)

function stored(): Tab | null {
  try {
    const v = localStorage.getItem(KEY)
    return isTab(v) ? v : null
  } catch {
    return null
  }
}

/** The tab shown: the one pressed last on this device, else READ when
    the month has a read, else MARKET. Null while the read is loading
    and nothing is kept, so the bar never jumps from one to the other. */
export function useTab(hasRead: boolean, loading: boolean) {
  const [pressed, setPressed] = useState<Tab | null>(null)
  const [kept, setKept] = useState<Tab | null | undefined>(undefined)
  useEffect(() => setKept(stored()), [])
  const tab: Tab | null =
    pressed ??
    kept ??
    (kept === undefined || loading ? null : hasRead ? 'read' : 'market')
  function pick(t: Tab) {
    setPressed(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* private window: the tab is kept for this visit only */
    }
  }
  return [tab, pick] as const
}

export type Badge = { text: string; tone: 'good' | 'bad' | 'lav' | 'dim' }

export function TabBar({
  tab,
  badges,
  onPick,
}: {
  tab: Tab | null
  badges: Partial<Record<Tab, Badge>>
  onPick: (t: Tab) => void
}) {
  return (
    <nav data-testid="insights-tabs" className="ins-tabs" aria-label="Insights">
      {TABS.map((t) => {
        const b = badges[t.id]
        return (
          <button
            key={t.id}
            type="button"
            data-testid="insights-tab"
            data-tab={t.id}
            aria-pressed={tab === t.id}
            className="ins-tab"
            onClick={(e) => {
              onPick(t.id)
              e.currentTarget.parentElement?.scrollIntoView({
                block: 'nearest',
              })
            }}
          >
            <span className="n">{t.n}</span>
            {t.name}
            {b ? (
              <span data-testid="tab-badge" className={`ins-badge ${b.tone}`}>
                {b.text}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

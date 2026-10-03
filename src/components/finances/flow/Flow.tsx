import { useEffect, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../../convex/_generated/api'
import { useDayStarts } from '@/components/track/useDayStarts'
import { categoryLabel } from '@/lib/money'
import { spendingOf } from '@/lib/spending'
import { Ahead } from './Ahead'
import type { Notice } from './Ahead'
import { MonthLine } from './MonthLine'
import { Movements } from './Movements'
import { Spending } from './Spending'
import { eur, monthName, monthsBack } from './time'

type Tab = 'ahead' | 'spending' | 'movements'

/* Flow (3 Oct; journey docs/specs/2026-10-03-flow-journey.md, mockup
   design/treasury-mockup/flow.html). His words: "flow should be useful, i
   actually analyze my spending and future". The month in one line on top;
   under it three tabs (his ask: too much scrolling), AHEAD first. Each
   tab carries one line of what is inside, so a warning on a tab he is not
   looking at is still seen. Bills are looked for each time it opens. */
export function Flow({ open }: { open?: string } = {}) {
  const today = useDayStarts(1).at(-1) as number
  const find = useMutation(api.recurring.find)
  useEffect(() => {
    void find({}).catch(() => undefined)
  }, [find])

  const spans = useMemo(() => monthsBack(today, 7), [today])
  const months = useQuery(api.aggregate.flowMonths, { months: spans })
  const aheadArgs = useMemo(
    () => ({
      today,
      days: 89,
      monthStart: spans[6].start,
      past: spans.slice(3, 6),
    }),
    [today, spans],
  )
  const ahead = useQuery(api.aggregate.ahead, aheadArgs)
  const accounts = useQuery(api.accounts.list, {}) ?? []
  const [tab, setTab] = useState<Tab>('ahead')
  const [notice, setNotice] = useState<Notice>(null)
  /* "See August in Flow" from a read statement: SPENDING, on that month. */
  useEffect(() => {
    if (open) setTab('spending')
  }, [open])

  const lines = useMemo(() => {
    let a = 'bills and salary, next 3 months'
    let aDot: string | null = null
    if (ahead) {
      const shorts = ahead.events.filter((e) => e.short).length
      const fresh = ahead.bills.filter((b) => b.isNew).length
      const next = ahead.events.find((e) => e.kind === 'expense')
      if (shorts) {
        a = `${shorts} not covered on the day`
        aDot = 'bg-state-warn'
      } else if (fresh) {
        a = `${fresh} new found · added`
        aDot = 'bg-lav-400'
      } else if (next) {
        a = `next: ${next.name} −${eur(next.amount)} · ${new Date(next.t).getDate()} ${monthName(next.t)}`
      }
    }
    let s = 'six months, by group'
    let sDot: string | null = null
    if (months) {
      const at =
        new Date(today).getDate() < 10 ? months.length - 2 : months.length - 1
      const sp = spendingOf(months, at)
      if (sp.grew && sp.grew.change > 40) {
        s = `${categoryLabel('expense', sp.grew.category).toLowerCase()} ▲ ${eur(sp.grew.change)} in ${monthName(spans[at].start)}`
        sDot = 'bg-state-danger'
      } else if (months[at]?.rows) {
        s = `${monthName(spans[at].start)} −${eur(months[at].out)} out`
      }
    }
    return [
      { id: 'ahead' as const, title: 'Ahead', line: a, dot: aDot },
      { id: 'spending' as const, title: 'Spending', line: s, dot: sDot },
      {
        id: 'movements' as const,
        title: 'Movements',
        line: 'every account, one list',
        dot: null,
      },
    ]
  }, [ahead, months, today, spans])

  return (
    <div className="flex flex-col gap-3">
      <MonthLine
        months={months}
        today={today}
        onRows={() => setTab('movements')}
      />
      {/* Pinned just under the top bar (shell/TopBar.tsx, 58px). */}
      <nav
        aria-label="Flow"
        className="sticky top-[58px] z-10 grid grid-cols-3 gap-2 py-2"
      >
        {lines.map((l) => {
          const on = tab === l.id
          return (
            <button
              key={l.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => setTab(l.id)}
              className={`motion-press flex flex-col items-start gap-1 rounded-[16px] px-3 py-2.5 text-left ring-1 ring-inset transition-colors sm:px-4 sm:py-3 ${
                on
                  ? 'glass shadow-[0_0_30px_-16px_var(--system-shine)] ring-[color:var(--system-edge)]'
                  : 'glass ring-transparent hover:ring-lift/16'
              }`}
            >
              <span
                className={`font-mono text-[10px] tracking-[0.14em] uppercase sm:text-[11px] sm:tracking-[0.24em] ${
                  on
                    ? 'text-lav-400 [text-shadow:0_0_10px_var(--system-shine)]'
                    : 'text-ink-400'
                }`}
              >
                {l.title}
              </span>
              <span
                className={`text-[11px] leading-snug sm:text-[12.5px] ${on ? 'text-ink-300' : 'text-ink-500'}`}
              >
                {l.dot ? (
                  <span
                    className={`mr-1.5 inline-block size-1.5 rounded-full align-[1px] ${l.dot}`}
                  />
                ) : null}
                {l.line}
              </span>
            </button>
          )
        })}
      </nav>
      <div hidden={tab !== 'ahead'}>
        <Ahead
          a={ahead}
          today={today}
          accounts={accounts}
          notice={notice}
          onNotice={setNotice}
        />
      </div>
      <div hidden={tab !== 'spending'}>
        <Spending months={months} spans={spans} today={today} open={open} />
      </div>
      <div hidden={tab !== 'movements'}>
        <Movements
          today={today}
          accounts={accounts}
          ahead={ahead}
          onBill={(n) => {
            setNotice(n)
            setTab('ahead')
          }}
        />
      </div>
    </div>
  )
}

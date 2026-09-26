import { createFileRoute, Link } from '@tanstack/react-router'
import { History, Receipt } from 'lucide-react'

import { AddMoney } from '@/components/finances/AddMoney'
import { FinancesHero } from '@/components/finances/FinancesHero'
import { MoneyCalendar } from '@/components/finances/MoneyCalendar'
import { MonthMoney } from '@/components/finances/MonthMoney'
import { areaVars } from '@/lib/areas'

/* Finances (R6b-c, F1 Spending, 26 Sep). Body's shape: the hero with this
   month's out and in over two tabs. SPENDING — log an amount in two taps,
   then where the month went, by category, each opening its rows. HISTORY
   — the month calendar and the tapped day's rows. Balances and
   Investments arrive as tabs when F2 and F3 ship, not as empty
   placeholders. The sums are source 1 as widened on 26 Sep (PLAN.md §1). */
const TABS = [
  { id: 'spending', label: 'Spending', Icon: Receipt },
  { id: 'history', label: 'History', Icon: History },
] as const

type Tab = (typeof TABS)[number]['id']

function Finances() {
  const { tab = 'spending' } = Route.useSearch()
  return (
    <div className="flex flex-col gap-[18px]">
      <FinancesHero />
      <nav
        style={areaVars('money')}
        aria-label="Finances tabs"
        className="flex flex-wrap gap-2"
      >
        {TABS.map(({ id, label, Icon }) => {
          const on = id === tab
          return (
            <Link
              key={id}
              to="/finances"
              search={id === 'spending' ? {} : { tab: id }}
              replace
              aria-current={on ? 'page' : undefined}
              className={`motion-press inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11.5px] tracking-[0.14em] uppercase ring-1 transition-colors ring-inset ${
                on
                  ? 'bg-lav-400/12 text-foreground ring-lav-400/45 shadow-[0_0_18px_-6px_var(--system-shine)]'
                  : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lift/25'
              }`}
            >
              <Icon className={`size-4 ${on ? 'text-area' : ''}`} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div
        key={tab}
        style={areaVars('money')}
        className="motion-arrive flex flex-col gap-3"
      >
        {tab === 'spending' ? (
          <>
            <AddMoney />
            <MonthMoney />
          </>
        ) : (
          <section className="glass flex flex-col gap-5 rounded-[22px] p-4 sm:p-5">
            <MoneyCalendar />
          </section>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_app/finances')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.id === search.tab) && search.tab !== 'spending'
      ? { tab: search.tab as Tab }
      : {},
  component: Finances,
})

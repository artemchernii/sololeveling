import { createFileRoute, Link } from '@tanstack/react-router'
import { History, Library, Sun } from 'lucide-react'

import { BodyHero, LogSession } from '@/components/body/BodyHero'
import { MyRoutines, ProgramLibrary } from '@/components/body/Programs'
import { RecentBody } from '@/components/body/RecentBody'
import { useBodyProgress } from '@/components/body/useBodyProgress'
import { areaVars } from '@/lib/areas'

/* Body (R6b-a; rebuilt 25 Sep in the Languages style). In tabs since 26
   Sep — "order is still confusing. Maybe we should do tabs": one long page
   mixed what a morning uses with what is opened once a month.

   The hero stays over the tabs. TODAY — a session or a shake in one tap,
   then today's routine open with DID ALL, the rest folded. PROGRAMS — the
   library they come from. HISTORY — the record by day, with a select mode
   to remove several at once. The tab is in the URL, so a refresh keeps it.

   Frame matches projects.index.tsx: the shell's grid pads the page. */
const TABS = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'programs', label: 'Programs', Icon: Library },
  { id: 'history', label: 'History', Icon: History },
] as const

type Tab = (typeof TABS)[number]['id']

function Body() {
  const { tab = 'today' } = Route.useSearch()
  const progress = useBodyProgress()
  return (
    <div className="flex flex-col gap-[18px]">
      <BodyHero featured={progress.pick?.program.kind ?? 'stretch'} />
      <nav
        style={areaVars('body')}
        aria-label="Body tabs"
        className="flex flex-wrap gap-2"
      >
        {TABS.map(({ id, label, Icon }) => {
          const on = id === tab
          return (
            <Link
              key={id}
              to="/body"
              search={id === 'today' ? {} : { tab: id }}
              replace
              aria-current={on ? 'page' : undefined}
              className={`motion-press inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11.5px] tracking-[0.14em] uppercase ring-1 transition-colors ring-inset ${
                on
                  ? 'bg-(--area)/20 text-foreground ring-(--area)/50 shadow-[0_0_18px_-6px_var(--area)]'
                  : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-(--area)/35'
              }`}
            >
              <Icon className={`size-4 ${on ? 'text-(--area)' : ''}`} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Keyed so a tab arrives rather than swapping in place. */}
      <div key={tab} className="motion-arrive flex flex-col gap-3">
        {tab === 'today' ? (
          <>
            <LogSession />
            <MyRoutines progress={progress} delay={80} />
          </>
        ) : tab === 'programs' ? (
          <ProgramLibrary progress={progress} />
        ) : (
          <RecentBody />
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_app/body')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.id === search.tab) && search.tab !== 'today'
      ? { tab: search.tab as Tab }
      : {},
  component: Body,
})

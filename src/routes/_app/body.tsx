import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { History, Sun } from 'lucide-react'

import { BodyHero, LogSession } from '@/components/body/BodyHero'
import { RecentBody } from '@/components/body/RecentBody'
import { WorkoutPanel } from '@/components/body/Workout'
import { areaVars } from '@/lib/areas'
import { workoutById, WORKOUTS } from '@/lib/body/library'
import type { Workout } from '@/lib/body/library'

/* Body (R6b-a; rebuilt 25 Sep, simplified 26 Sep). "Not simple to use
   and not clear … I'm not sure if I gonna log all this."

   So Body saves sessions and not exercises. The hero stays over two tabs.
   TODAY — a session or a shake in one tap, then the workout guide: pick
   one, tick through its moves, Finish logs the session. HISTORY — what was
   logged, by day, with a select mode to remove several at once. The tab is
   in the URL, so a refresh keeps it; the workout picked is remembered in
   this browser.

   Frame matches projects.index.tsx: the shell's grid pads the page. */
const TABS = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'history', label: 'History', Icon: History },
] as const

type Tab = (typeof TABS)[number]['id']

const WORKOUT_KEY = 'sl-body-workout'

function usePickedWorkout(): [Workout, (id: string) => void] {
  const [id, setId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(WORKOUT_KEY)
    } catch {
      return null
    }
  })
  const pick = (next: string) => {
    setId(next)
    try {
      localStorage.setItem(WORKOUT_KEY, next)
    } catch {
      /* Storage refused: the pick lasts until the page closes. */
    }
  }
  return [workoutById(id) ?? WORKOUTS[0], pick]
}

function Body() {
  const { tab = 'today' } = Route.useSearch()
  const [workout, pick] = usePickedWorkout()
  return (
    <div className="flex flex-col gap-[18px]">
      <BodyHero featured={workout.kind} />
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
                  ? 'bg-lift/[0.06] text-foreground ring-(--area)/55'
                  : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lift/25'
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
            <WorkoutPanel workout={workout} onPick={pick} delay={80} />
          </>
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

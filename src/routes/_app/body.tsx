import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { BodyHero, LogSession } from '@/components/body/BodyHero'
import { MyRoutines, ProgramLibrary } from '@/components/body/Programs'
import { RecentBody } from '@/components/body/RecentBody'
import { useBodyProgress } from '@/components/body/useBodyProgress'
import { areaVars } from '@/lib/areas'

/* Body (R6b-a; rebuilt 25 Sep in the Languages style, reordered the same
   day: "hard to read and navigate"). Three parts, in the order a morning
   uses them, with a row of links to jump between them:

   TODAY — a session or a shake in one tap, then today's routine open with
   the rest folded. LIBRARY — the programs they come from. DONE — the
   record, by day. Weight lives in the hero only (his call: "not THAT
   important").

   Frame matches projects.index.tsx: the shell's grid pads the page. */
const SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'library', label: 'Library' },
  { id: 'done', label: 'Done' },
]

function Body() {
  const progress = useBodyProgress()
  return (
    <div className="flex flex-col gap-[18px]">
      <BodyHero featured={progress.pick?.program.kind ?? 'stretch'} />
      <nav
        style={areaVars('body')}
        aria-label="Body sections"
        className="flex flex-wrap gap-2"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="motion-press rounded-full px-3.5 py-1.5 font-mono text-[11px] tracking-[0.14em] text-ink-300 uppercase ring-1 ring-lift/15 transition-colors ring-inset hover:bg-(--area)/12 hover:text-(--area) hover:ring-(--area)/40"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <Section id="today" label="Today">
        <LogSession />
        <MyRoutines progress={progress} delay={80} />
      </Section>

      <Section id="library" label="Library">
        <ProgramLibrary progress={progress} />
      </Section>

      <Section id="done" label="Done">
        <RecentBody />
      </Section>
    </div>
  )
}

/* A part of the page with its name over it, so a long page reads as three
   things rather than eight cards. */
function Section({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      style={areaVars('body')}
      className="flex scroll-mt-6 flex-col gap-3"
    >
      <h2 className="mt-2 flex items-center gap-3 font-mono text-[12px] tracking-[0.2em] text-(--area) uppercase">
        {label}
        <span aria-hidden className="h-px flex-1 bg-(--area)/25" />
      </h2>
      {children}
    </section>
  )
}

export const Route = createFileRoute('/_app/body')({ component: Body })

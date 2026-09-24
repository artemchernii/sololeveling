import { createFileRoute } from '@tanstack/react-router'

import { BodyHero, LogSession } from '@/components/body/BodyHero'
import { MyRoutines, NextUp, ProgramLibrary } from '@/components/body/Programs'
import { RecentBody } from '@/components/body/RecentBody'
import { useBodyProgress } from '@/components/body/useBodyProgress'
import { WeightLine } from '@/components/body/WeightLine'

/* Body (R6b-a; rebuilt 25 Sep in the Languages style). His order:
   consistency first — "the main thing" — in one card with the body's
   identity; a session in one tap; what to do today and the weight; his
   routines with DID per exercise; the library they come from; then what
   was done, by day.

   Frame matches projects.index.tsx: the shell's grid pads the page. */
function Body() {
  const progress = useBodyProgress()
  return (
    <div className="flex flex-col gap-[18px]">
      <BodyHero featured={progress.pick?.program.kind ?? 'stretch'} />
      <LogSession />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <NextUp progress={progress} delay={80} />
        <WeightLine delay={140} />
      </div>
      <MyRoutines progress={progress} delay={180} />
      <ProgramLibrary progress={progress} delay={220} />
      <RecentBody delay={260} />
    </div>
  )
}

export const Route = createFileRoute('/_app/body')({ component: Body })

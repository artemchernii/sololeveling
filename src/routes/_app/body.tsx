import { createFileRoute } from '@tanstack/react-router'

import { Consistency } from '@/components/body/Consistency'
import { RecentBody } from '@/components/body/RecentBody'
import { Routines } from '@/components/body/Routines'
import { WeightLine } from '@/components/body/WeightLine'

/* Body (R6b-a). Consistency first and weight second, which is his ordering
   rather than PLAN.md §3's: "what is most important is consistency" (21 Sep).
   The four kinds §3 promised are a starting set, not a fixed list — a kind is
   a word typed into the capture chip.

   Frame matches projects.index.tsx (task 8): the shell's own grid already
   pads the page, and that file adds no heading and no padding of its own —
   so neither does this one. */
function Body() {
  /* 25 Sep: a tracking page. What he does today first — the routines with
     their DID buttons — then how often, then the weight and the record. */
  return (
    <div className="flex flex-col gap-[18px]">
      <Routines />
      <Consistency delay={120} />
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <WeightLine delay={180} />
        <RecentBody delay={240} />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_app/body')({ component: Body })

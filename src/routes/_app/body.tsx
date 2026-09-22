import { createFileRoute } from '@tanstack/react-router'

import { Consistency } from '@/components/body/Consistency'
import { RecentBody } from '@/components/body/RecentBody'
import { WeightLine } from '@/components/body/WeightLine'

/* Body (R6b-a). Consistency first and weight second, which is his ordering
   rather than PLAN.md §3's: "what is most important is consistency" (21 Sep).
   The four kinds §3 promised are a starting set, not a fixed list — a kind is
   a word typed into the capture chip.

   Frame matches projects.index.tsx (task 8): the shell's own grid already
   pads the page, and that file adds no heading and no padding of its own —
   so neither does this one. */
function Body() {
  return (
    <div className="flex flex-col gap-[18px]">
      <Consistency />
      <WeightLine />
      <RecentBody />
    </div>
  )
}

export const Route = createFileRoute('/_app/body')({ component: Body })

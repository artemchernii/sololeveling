import { useEffect, useRef } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { useDemo } from '@/lib/useDemo'

/* DEMO · FAKE DATA on every screen of the demo account (27 Oct, mockup
   design/firstrun-mockup/demo.html): its numbers are made up, so it says
   so (CLAUDE.md, Reality over gamification). Its open also asks for a
   refill when the rows were written before today. */
export function DemoBadge() {
  const demo = useDemo()
  const freshen = useMutation(api.demo.freshen)
  const asked = useRef(false)
  useEffect(() => {
    if (!demo || asked.current) return
    asked.current = true
    void freshen({}).catch(() => undefined)
  }, [demo, freshen])

  if (!demo) return null
  return (
    <span
      data-testid="demo-badge"
      className="motion-arrive inline-flex items-center gap-1.5 rounded-full border border-state-warn/55 px-2.5 py-[3px] font-mono text-[9.5px] tracking-[0.16em] text-state-warn"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-state-warn" />
      DEMO · FAKE DATA
    </span>
  )
}

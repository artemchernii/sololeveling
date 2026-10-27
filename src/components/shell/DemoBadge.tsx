import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { DEMO_REFUSED } from '@/lib/demoRefused'
import { useDemo } from '@/lib/useDemo'

/* DEMO · FAKE DATA on every screen of the demo account (27 Oct, mockup
   design/firstrun-mockup/demo.html): its numbers are made up, so it says
   so (CLAUDE.md, Nothing is seeded). Its open also asks for a refill when
   the rows were written before today, and every refused press shows as
   DEMO · NOT SAVED or DEMO · NO AI for a moment. */
export function DemoBadge() {
  const demo = useDemo()
  const freshen = useMutation(api.demo.freshen)
  const asked = useRef(false)
  useEffect(() => {
    if (!demo || asked.current) return
    asked.current = true
    void freshen({}).catch(() => undefined)
  }, [demo, freshen])

  const [said, setSaid] = useState<{ words: string; at: number } | null>(null)
  useEffect(() => {
    const onRefused = (e: Event) =>
      setSaid({ words: (e as CustomEvent<string>).detail, at: Date.now() })
    window.addEventListener(DEMO_REFUSED, onRefused)
    return () => window.removeEventListener(DEMO_REFUSED, onRefused)
  }, [])
  useEffect(() => {
    if (said === null) return
    const t = setTimeout(() => setSaid(null), 1800)
    return () => clearTimeout(t)
  }, [said])

  if (!demo) return null
  return (
    <>
      <span
        data-testid="demo-badge"
        className="motion-arrive inline-flex items-center gap-1.5 rounded-full border border-state-warn/55 px-2.5 py-[3px] font-mono text-[9.5px] tracking-[0.16em] whitespace-nowrap text-state-warn"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-state-warn" />
        DEMO · FAKE DATA
      </span>
      {said &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-[60] flex justify-center md:bottom-6">
            <span
              key={said.at}
              role="status"
              className="glass-modal motion-arrive rounded-full border border-state-warn/55 px-3.5 py-2 font-mono text-[10.5px] tracking-[0.16em] text-state-warn"
            >
              {said.words}
            </span>
          </div>,
          /* Out of the top bar: its blur would hold a fixed child. */
          document.body,
        )}
    </>
  )
}

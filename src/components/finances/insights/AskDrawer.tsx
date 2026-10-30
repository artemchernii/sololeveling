import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Ask, MONTH, Star } from './Ask'
import { ModelPick } from '@/components/ask/ModelPick'
import { useSheetDrag } from '@/components/ask/useSheetDrag'
import { useSheetViewport } from '@/components/ask/useSheetViewport'
import { usePrefill } from './askPrefill'
import { usd } from './readParts'
import { useAsk } from './useAsk'
import type { useMarketRead } from './useMarketRead'

/* ASK leaves the page (21 Oct, mockup insights-tabs.html, his "chat
   maybe can be like a floating or drawer"): a ✦ ASK pill floats left of
   the 🌴 button, its star spinning while asking and a badge counting the
   answers; it opens a drawer over the page — from the right, from the
   bottom on a phone. ✕, a tap outside and Esc close it. The thread stays
   in page memory (useAsk), so closing it loses nothing. */

type Read = ReturnType<typeof useMarketRead>

/** docked: IDEAS shows ASK beside the board on a wide screen (29 Oct);
    there a ✦ fills the dock, and the pill and drawer step aside. */
const WIDE = '(min-width: 1100px)'

export function AskDrawer({
  r,
  docked = false,
}: {
  r: Read
  docked?: boolean
}) {
  const a = useAsk(r)
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  useSheetViewport(open)
  const panel = useRef<HTMLElement>(null)
  useSheetDrag(panel, open, () => setOpen(false))
  useEffect(() => setReady(true), [])
  /* A card's ✦ opens it; Ask puts the question in the box. */
  const prefill = usePrefill()
  useEffect(() => {
    if (prefill && !(docked && window.matchMedia(WIDE).matches)) setOpen(true)
  }, [prefill])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    /* The box takes the keys on a wide screen; a phone keeps its
       keyboard down until the box is pressed. */
    if (window.matchMedia('(min-width: 641px)').matches)
      panel.current
        ?.querySelector<HTMLInputElement>('[data-testid="ask-input"]')
        ?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!ready) return null
  const answers = a.turns.filter((t) => t.state === 'done').length
  const pro = r.path === 'pro'

  return createPortal(
    <div
      className={`ask-layer ${open ? 'open' : ''} ${docked ? 'docked' : ''}`}
    >
      <button
        type="button"
        data-testid="ask-open"
        aria-expanded={open}
        className={`ask-fab ${a.busy ? 'busy' : ''}`}
        onClick={() => setOpen(true)}
      >
        <span className="o">
          <Star />
        </span>
        <span className="w">ASK</span>
        {answers > 0 ? (
          <span data-testid="ask-fab-count" className="cnt">
            {answers}
          </span>
        ) : null}
      </button>
      <div
        data-testid="ask-scrim"
        className="ask-scrim"
        onClick={() => setOpen(false)}
      />
      <aside
        ref={panel}
        data-testid="ask-drawer"
        className="ask-drawer"
        aria-label="Ask"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="ask-dh">
          <span className={`ask-orb ${a.busy ? 'busy' : ''}`}>
            <Star />
          </span>
          <span className="system-title whitespace-nowrap">[ ASK ]</span>
          <span className="grow" />
          {pro ? (
            <ModelPick />
          ) : r.path !== null ? (
            <span data-testid="ask-pay" className="ins-badge warn">
              {`💳 ${MONTH[Number(r.month.slice(5, 7)) - 1]} · ${usd(r.spent)} OF ${usd(r.cap)}`}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="ask-close"
            className="ask-x"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        <Ask r={r} a={a} />
      </aside>
    </div>,
    document.body,
  )
}

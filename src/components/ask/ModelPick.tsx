import { useEffect, useRef, useState } from 'react'

import { modelWord } from '@/components/finances/insights/readParts'
import { setLocalModel, useLocalModel } from '@/lib/localModel'
import { LOCAL_MODELS } from '@/lib/marketRead'
import type { LocalModel } from '@/lib/marketRead'

/* The model on localhost (22 Oct, mockup design/model-pick/ option B, his
   "go with B"): the PRO badge is the button and opens its own menu of the
   three. One pick for ⌘J, Insights ASK and the read; it applies to the
   next press. Only on the Pro path — the API path has no pick. */

const BADGE: Record<LocalModel, [string, string]> = {
  'claude-haiku-5-5': ['good', '⚡ FAST'],
  'claude-sonnet-5-5': ['lav', 'DEFAULT'],
  'claude-opus-5-5': ['warn', '🔋 HEAVY'],
}

export function ModelPick({ label = 'PRO' }: { label?: string }) {
  const model = useLocalModel()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      /* Esc folds the menu, not the drawer under it. */
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', out)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', out)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  return (
    <span ref={box} className="model-pick">
      <button
        type="button"
        data-testid="model-pick"
        className="ins-badge good"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ask-ping" />⚡ {label} · {modelWord(model)} ▾
      </button>
      {open ? (
        <span role="menu" data-testid="model-menu" className="model-menu">
          {LOCAL_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === model}
              data-testid="model-option"
              className={m === model ? 'on' : ''}
              onClick={() => {
                setLocalModel(m)
                setOpen(false)
              }}
            >
              <span className="tick">{m === model ? '✓' : ''}</span>
              {modelWord(m)}
              <span className="grow" />
              <span className={`ins-badge ${BADGE[m][0]}`}>{BADGE[m][1]}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}

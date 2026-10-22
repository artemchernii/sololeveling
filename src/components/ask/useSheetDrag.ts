import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/* An Ask sheet on a phone closes by its handle (23 Oct, his "I can close
   that drawer on mobile only with X, I cant drag it down with that
   dash"). A drag that starts on the handle or the header (not a button)
   moves the sheet with the finger; let go past 100px, or flicked down,
   it closes, else it springs back. */

const PHONE = '(max-width: 640px)'
const CLOSE_PX = 100
const FLICK = 0.5 // px per ms

export function useSheetDrag(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  const shut = useRef(close)
  shut.current = close
  useEffect(() => {
    const el = panel.current
    if (!open || !el || !window.matchMedia(PHONE).matches) return
    let from: number | null = null
    let at = 0
    let dy = 0
    const grab = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('button, input, a')) return
      /* the handle is the sheet's own top strip; the header is .ask-dh */
      if (t !== el && !t.closest('.ask-dh')) return
      from = e.clientY
      at = e.timeStamp
      dy = 0
      el.style.transition = 'none'
      el.setPointerCapture(e.pointerId)
    }
    const drag = (e: PointerEvent) => {
      if (from === null) return
      dy = Math.max(0, e.clientY - from)
      el.style.transform = `translateY(${dy}px)`
    }
    const drop = (e: PointerEvent) => {
      if (from === null) return
      from = null
      const flick = dy / Math.max(1, e.timeStamp - at) > FLICK
      el.style.transition = ''
      el.style.transform = ''
      if (dy > CLOSE_PX || (flick && dy > 30)) shut.current()
    }
    el.addEventListener('pointerdown', grab)
    el.addEventListener('pointermove', drag)
    el.addEventListener('pointerup', drop)
    el.addEventListener('pointercancel', drop)
    return () => {
      el.removeEventListener('pointerdown', grab)
      el.removeEventListener('pointermove', drag)
      el.removeEventListener('pointerup', drop)
      el.removeEventListener('pointercancel', drop)
      el.style.transition = ''
      el.style.transform = ''
    }
  }, [open, panel])
}

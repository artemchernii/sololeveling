import { useEffect, useRef, useState } from 'react'

/* A hover card that can be reached and used (29 Oct, his "after hover it
   disappears and i cant click on 1w 1m or copy ticker"): hovering opens
   it; leaving closes it only after a short wait, so the mouse can cross
   to the card, and entering the card keeps it. A click pins it open —
   then only a click outside, Esc or another click on its cell closes it. */

const LEAVE_MS = 220

export function usePop<T extends string>() {
  const [on, setOn] = useState<T | null>(null)
  const [pinned, setPinned] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  useEffect(() => {
    if (!pinned) return
    const out = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setPinned(false)
        setOn(null)
      }
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPinned(false)
      setOn(null)
    }
    document.addEventListener('pointerdown', out)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', out)
      window.removeEventListener('keydown', esc)
    }
  }, [pinned])
  return {
    on,
    pinned,
    box,
    /** The mouse is on a cell or its card. */
    enter(id: T) {
      stop()
      if (!pinned) setOn(id)
    },
    /** The mouse left the cell and its card: close after a moment. */
    leave() {
      stop()
      if (pinned) return
      timer.current = setTimeout(() => setOn(null), LEAVE_MS)
    },
    /** A click or Enter on a cell: pin it, or unpin it if pinned. */
    press(id: T) {
      stop()
      if (pinned && on === id) {
        setPinned(false)
        setOn(null)
      } else {
        setPinned(true)
        setOn(id)
      }
    },
  }
}

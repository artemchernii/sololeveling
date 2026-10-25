import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { useSave } from '@/components/Saving'
import { euros } from '@/lib/money'
import { SESSION_KINDS } from '@/lib/sessionKinds'

/* THIS MONTH's small pieces, apart from MonthSix (25 Oct) so neither file
   grows past the size it can be read at. */

export type Press = {
  label: string
  kind: 'session' | 'workout' | 'intake' | 'post'
  area: string
  category?: string
  /** A session: the press opens CLASS · HOMEWORK · AT HOME first. */
  kinds?: boolean
}

/** One log with a press: saving at once, saved, back to rest. A session
    asks its kind first, one tap (25 Oct). */
export function PressButton({
  press: p,
  onLanded,
}: {
  press: Press
  onLanded: () => void
}) {
  const log = useMutation(api.logs.create)
  const save = useSave()
  const [asking, setAsking] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (save.status !== 'saved') return
    const id = setTimeout(save.settle, 1800)
    return () => clearTimeout(id)
  }, [save.status, save.settle])
  useEffect(() => {
    if (!asking) return
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setAsking(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAsking(false)
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [asking])

  async function press(extra: {
    category?: string
    value?: number
    unit?: string
    text?: string
  }) {
    if (save.busy) return
    setAsking(false)
    await save.run(() =>
      log({
        kind: p.kind,
        area: p.area,
        occurredAt: Date.now(),
        ...(p.category ? { category: p.category } : {}),
        ...extra,
      }),
    )
    onLanded()
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={p.kinds ? asking : undefined}
        onClick={() => (p.kinds ? setAsking((a) => !a) : void press({}))}
        className={`h-[28px] rounded-full border px-2.5 font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap sm:h-[30px] sm:px-3.5 sm:text-[10px] sm:tracking-[0.16em] transition-[background,box-shadow] ${
          save.status === 'saving'
            ? 'border-dashed border-lav-400/40 text-ink-400'
            : save.status === 'saved'
              ? 'border-lav-400 bg-lav-400 text-background'
              : asking
                ? 'border-lav-400 bg-lav-400/12 text-lav-300'
                : 'border-lav-400/40 text-lav-300 hover:bg-lav-400/12 hover:shadow-[0_0_16px_-4px_var(--color-lav-400)]'
        }`}
      >
        {save.status === 'saving'
          ? 'SAVING…'
          : save.status === 'saved'
            ? '✓ SAVED'
            : p.label}
      </button>
      {asking ? (
        <div
          role="menu"
          data-testid="session-kinds"
          className="motion-arrive absolute right-0 bottom-[calc(100%+6px)] z-30 flex flex-col gap-0.5 rounded-[12px] border border-lift/[0.09] bg-popover p-1.5 shadow-2xl"
        >
          {SESSION_KINDS.map((k) => (
            <button
              key={k.category}
              type="button"
              role="menuitem"
              onClick={() => void press({ category: k.category, ...k.extra })}
              className="rounded-lg px-3 py-1.5 text-left font-mono text-[10.5px] tracking-[0.14em] whitespace-nowrap text-ink-200 hover:bg-lav-400/10"
            >
              {k.label}
              {'value' in k.extra ? (
                <span className="text-ink-500"> · 50 MIN</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** €44.9k, €820. */
export function kEur(n: number): string {
  return Math.abs(n) >= 1000
    ? `€${(n / 1000).toFixed(1)}k`
    : euros(Math.round(n))
}

export function Spark({ points }: { points: Array<number> }) {
  if (points.length < 2) return <div className="h-[22px]" />
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  const d = points
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i / (points.length - 1)) * 100).toFixed(1)} ${(20 - ((v - lo) / span) * 18).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg
      className="td-spark h-[22px] w-full"
      viewBox="0 0 100 22"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-lav-400)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** The month's number counts up the first time it is drawn. */
export function CountUp({ to }: { to: number }) {
  const [shown, setShown] = useState(to)
  const first = useRef(true)
  useEffect(() => {
    if (!first.current) {
      setShown(to)
      return
    }
    first.current = false
    if (to === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t0 = performance.now() + 300
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / 900))
      setShown(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{shown}</>
}

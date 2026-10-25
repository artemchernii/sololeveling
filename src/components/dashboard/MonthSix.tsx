import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import { useWorthHistory } from '@/lib/useWorthHistory'
import { useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { euros } from '@/lib/money'
import { monthWorth } from '@/lib/monthSix'
import type { Six } from '@/lib/monthSix'
import { AreaIcon } from './AreaIcon'
import type { ICONS } from './AreaIcon'

type Counts = FunctionReturnType<typeof api.aggregate.monthSix>
type Worth = FunctionReturnType<typeof api.aggregate.worthHistory>

/** This month's local midnights, the month before's first, the next's. */
export function monthBounds(now: Date) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const length = new Date(y, m + 1, 0).getDate()
  const dayStarts = Array.from({ length }, (_, i) =>
    new Date(y, m, i + 1).getTime(),
  )
  return {
    prevStart: new Date(y, m - 1, 1).getTime(),
    dayStarts,
    nextStart: new Date(y, m + 1, 1).getTime(),
    todayIndex: now.getDate() - 1,
  }
}

/** The six's reads, for the tiles and for the three's picks (a goal
    behind its month). All from convex/aggregate.ts. */
export function useMonth(now: Date, languages: Array<string> | undefined) {
  const b = monthBounds(now)
  const counts = useQuery(
    api.aggregate.monthSix,
    languages === undefined
      ? 'skip'
      : {
          prevStart: b.prevStart,
          dayStarts: b.dayStarts,
          nextStart: b.nextStart,
          languages: languages.length > 0 ? languages : ['portuguese'],
        },
  )
  const targets = useQuery(api.aggregate.tileTargets, {})
  /* The month before's last moment, then each day's end to today's — the
     same args all day, so the read is not asked again on every render. */
  const dayEnds = [
    b.dayStarts[0] - 1,
    ...b.dayStarts
      .slice(0, b.todayIndex + 1)
      .map((_, i) => (b.dayStarts[i + 1] ?? b.nextStart) - 1),
  ]
  const worth = useWorthHistory(dayEnds)
  return { counts, targets, worth, bounds: b }
}

type Tile = {
  key: Six | 'worth'
  name: string
  icon: keyof typeof ICONS
  area: string
  presses?: Array<Press>
  auto?: string
  /** LANGS: the badge of each language area, for its count chip. */
  langs?: Array<{ slug: string; short: string }>
}
type Press = {
  label: string
  kind: 'session' | 'workout' | 'intake' | 'post'
  area: string
  category?: string
}

/* THIS MONTH, his six (17 Oct; PLAN.md §3 item 4). Colour on the icon
   only. Each count against the month before, both numbers shown; a goal
   ring only where goals.targetValue gives it a denominator (§1). */
export function MonthSix({
  month,
  now,
  langs,
}: {
  month: ReturnType<typeof useMonth>
  now: Date
  /** One per language area (25 Oct, his "log PT or ENG"). */
  langs: Array<{ slug: string; short: string }>
}) {
  const { counts, targets, worth, bounds } = month
  const prevName = new Date(bounds.prevStart)
    .toLocaleDateString('en-GB', { month: 'long' })
    .toUpperCase()
  const tiles: Array<Tile> = [
    {
      key: 'langs',
      name: 'LANGS',
      icon: 'language',
      area: langs[0].slug,
      presses: langs.map((l) => ({
        label: `+ ${l.short}`,
        kind: 'session' as const,
        area: l.slug,
      })),
      langs,
    },
    {
      key: 'workout',
      name: 'WORKOUT',
      icon: 'body',
      area: 'body',
      presses: [{ label: '+ WORKOUT', kind: 'workout', area: 'body' }],
    },
    {
      key: 'shake',
      name: 'SHAKE',
      icon: 'shake',
      area: 'body',
      presses: [
        {
          label: '+ SHAKE',
          kind: 'intake',
          area: 'body',
          category: 'supplements',
        },
      ],
    },
    {
      key: 'post',
      name: 'POST',
      icon: 'social',
      area: 'social',
      presses: [{ label: '+ POST', kind: 'post', area: 'social' }],
    },
    {
      key: 'commits',
      name: 'COMMITS',
      icon: 'projects',
      area: 'projects',
      auto: 'GITHUB',
    },
    { key: 'worth', name: 'WORTH', icon: 'money', area: 'money', auto: 'BANK' },
  ]
  const goal = (k: Tile['key']) =>
    k === 'langs' ? targets?.portuguese : k === 'workout' ? targets?.body : null

  return (
    <section
      aria-label="This month"
      className="glass motion-arrive rounded-[18px] px-5 py-[18px]"
    >
      <div className="mb-[18px] flex items-center justify-between">
        <span className="label-caps">
          This month ·{' '}
          {now.toLocaleDateString('en-GB', { month: 'long' }).toUpperCase()}
        </span>
        <span className="label-caps">
          Day {bounds.todayIndex + 1} of {bounds.dayStarts.length}
        </span>
      </div>
      {counts === undefined || worth === undefined ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t, i) => (
            <MonthTile
              key={t.key}
              tile={t}
              index={i}
              today={bounds.todayIndex}
              count={t.key === 'worth' ? undefined : counts[t.key]}
              worth={t.key === 'worth' ? worth : undefined}
              target={goal(t.key)?.value}
              prevName={prevName}
              prevEnd={bounds.dayStarts[0] - 1}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function MonthTile({
  tile,
  index,
  today,
  count,
  worth,
  target,
  prevName,
  prevEnd,
}: {
  tile: Tile
  index: number
  today: number
  count?: Counts[Six]
  worth?: Worth
  target?: number
  prevName: string
  prevEnd: number
}) {
  /* A press that landed: the tile's edge lights and its number bumps. */
  const [landed, setLanded] = useState(0)
  useEffect(() => {
    if (landed === 0) return
    const id = setTimeout(() => setLanded(0), 1800)
    return () => clearTimeout(id)
  }, [landed])

  const sum = count ? count.days.reduce((a, b) => a + b, 0) : 0
  const points = (worth?.total ?? []).filter((v): v is number => v !== null)
  const {
    was: wasWorth,
    now: nowWorth,
    missing,
    delta: worthDelta,
  } = monthWorth(worth?.total ?? [], worth?.starts ?? [], prevEnd)

  let delta: {
    text: string
    tone: string
    was: string
    missing?: string
  } | null
  if (count && sum === 0 && count.prev === 0) {
    /* 0 against 0 says nothing (25 Oct): no comparison at all. */
    delta = null
  } else if (count) {
    const d = sum - count.prev
    delta = {
      text: d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : `= ${sum}`,
      tone:
        d > 0
          ? 'text-state-good'
          : d < 0
            ? 'text-state-danger'
            : 'text-ink-400',
      was: `${prevName} ${count.prev}`,
    }
  } else {
    const d = worthDelta
    const last = new Date(prevEnd)
    const day = `${prevName.slice(0, 3)} ${last.getDate()}`
    delta = {
      text:
        d > 0
          ? `▲ ${euros(Math.round(d))}`
          : d < 0
            ? `▼ ${euros(Math.round(-d))}`
            : '= SAME',
      tone:
        d > 0
          ? 'text-state-good'
          : d < 0
            ? 'text-state-danger'
            : 'text-ink-400',
      was:
        wasWorth === null ? `${day} · MISSING` : `${day} · ${kEur(wasWorth)}`,
      ...(missing > 0
        ? { missing: `MISSING ON ${day} · ${kEur(missing)}` }
        : {}),
    }
  }

  return (
    <div
      data-testid={`tile-${tile.key}`}
      style={{ ['--i' as string]: index }}
      className={`bento-tile flex flex-col gap-3 rounded-[16px] border border-lift/[0.09] bg-lift/[0.025] px-4 pt-4 pb-3.5 ${landed ? 'motion-edge' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.22em] text-ink-200">
          <AreaIcon icon={tile.icon} area={tile.area} />
          {tile.name}
        </span>
        {target !== undefined ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-400">
            <span
              className="td-ring"
              style={{ ['--p' as string]: Math.min(100, (sum / target) * 100) }}
            />
            {sum} / {target}
          </span>
        ) : null}
      </div>
      <div className="flex items-end gap-3.5">
        <span
          className={`leading-[0.9] font-light tracking-[-0.03em] tabular-nums ${count ? 'text-[44px]' : 'text-[34px]'}`}
        >
          {count ? (
            <span data-testid="count" className={landed ? 'td-bump' : ''}>
              <CountUp to={sum} />
            </span>
          ) : nowWorth === null ? (
            '—'
          ) : (
            kEur(nowWorth)
          )}
        </span>
        {delta ? (
          <span className="flex flex-col gap-[3px] pb-[3px]">
            <span
              data-testid="delta"
              className={`font-mono text-[12px] font-medium ${delta.tone}`}
            >
              {delta.text}
            </span>
            <span className="font-mono text-[9.5px] tracking-[0.12em] text-ink-500">
              {delta.was}
            </span>
            {delta.missing !== undefined ? (
              <span
                data-testid="missing"
                className="font-mono text-[9.5px] tracking-[0.12em] text-ink-500"
              >
                {delta.missing}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {tile.langs && tile.langs.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {tile.langs.map((l) => (
            <span
              key={l.slug}
              data-testid={`lang-${l.short}`}
              className="rounded-full border border-lift/[0.09] px-2.5 py-[3px] font-mono text-[10px] tracking-[0.12em] text-ink-300"
            >
              {l.short}{' '}
              <b className="font-medium text-ink-100">
                {count?.byArea?.[l.slug] ?? 0}
              </b>
            </span>
          ))}
        </div>
      ) : null}
      {count ? (
        <div
          className="td-days"
          style={{ ['--n' as string]: count.days.length }}
        >
          {count.days.map((n, d) => (
            <i
              key={d}
              data-on={n > 0}
              data-today={d === today}
              data-future={d > today}
              style={{ ['--d' as string]: d }}
            />
          ))}
        </div>
      ) : (
        <Spark points={points} />
      )}
      <div className="flex min-h-[30px] items-center justify-end gap-2">
        {tile.presses ? (
          tile.presses.map((p) => (
            <PressButton
              key={p.label}
              press={p}
              onLanded={() => setLanded(Date.now())}
            />
          ))
        ) : (
          <span className="font-mono text-[9px] tracking-[0.16em] text-ink-500">
            AUTO · {tile.auto}
          </span>
        )}
      </div>
    </div>
  )
}

/** One log with a press: saving at once, saved, back to rest. */
function PressButton({
  press: p,
  onLanded,
}: {
  press: Press
  onLanded: () => void
}) {
  const log = useMutation(api.logs.create)
  const save = useSave()
  useEffect(() => {
    if (save.status !== 'saved') return
    const id = setTimeout(save.settle, 1800)
    return () => clearTimeout(id)
  }, [save.status, save.settle])

  async function press() {
    if (save.busy) return
    await save.run(() =>
      log({
        kind: p.kind,
        area: p.area,
        occurredAt: Date.now(),
        ...(p.category ? { category: p.category } : {}),
      }),
    )
    onLanded()
  }

  return (
    <button
      type="button"
      onClick={() => void press()}
      className={`h-[30px] rounded-full border px-3.5 font-mono text-[10px] tracking-[0.16em] transition-[background,box-shadow] ${
        save.status === 'saving'
          ? 'border-dashed border-lav-400/40 text-ink-400'
          : save.status === 'saved'
            ? 'border-lav-400 bg-lav-400 text-background'
            : 'border-lav-400/40 text-lav-300 hover:bg-lav-400/12 hover:shadow-[0_0_16px_-4px_var(--color-lav-400)]'
      }`}
    >
      {save.status === 'saving'
        ? 'SAVING…'
        : save.status === 'saved'
          ? '✓ SAVED'
          : p.label}
    </button>
  )
}

/** €44.9k, €820. */
function kEur(n: number): string {
  return Math.abs(n) >= 1000
    ? `€${(n / 1000).toFixed(1)}k`
    : euros(Math.round(n))
}

function Spark({ points }: { points: Array<number> }) {
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
function CountUp({ to }: { to: number }) {
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

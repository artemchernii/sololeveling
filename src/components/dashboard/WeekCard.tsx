import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { SaveLabel, useSave } from '@/components/Saving'
import { SESSION_KINDS } from '@/lib/sessionKinds'
import { addDays, startOfWeek } from '@/lib/weeks'
import {
  BANDS,
  WEEK_KINDS,
  detail,
  dropAt,
  isFuture,
  pressAt,
  weekCells,
} from '@/lib/weekGrid'
import type { Block, WeekKind } from '@/lib/weekGrid'
import { AreaIcon } from './AreaIcon'
import {
  BandRow,
  BlockPill,
  DAYS,
  ICON,
  areaColour,
  clock,
  dayName,
  isCurrentBand,
  nameOf,
  todayIndex,
} from './WeekParts'

type Rows = FunctionReturnType<typeof api.aggregate.weekItems>

/* What each press writes: the same rows THIS MONTH's tiles write. */
type Write = {
  key: string
  name: string
  icon: WeekKind
  kind: string
  area: string
  category?: string
}
/** A language area as THIS WEEK shows it: its slug and its badge. */
export type Lang = { slug: string; short: string }

type Tip = { x: number; y: number; block: Block; day: number }
type Menu = { x: number; y: number; day: number; band: 0 | 1 | 2; at: number }

/* R8 · S3a: what a guest's week counts. */
const GUEST_KINDS: ReadonlyArray<WeekKind> = ['workout', 'langs']

/* THIS WEEK (18 Oct, mockup design/today-mockup/week.html, his "go"):
   Monday to Sunday across, three bands of the day down. A block is a row
   he logged; hover says what it was, a pressed cell lists what is in it
   and logs one more (22 Oct: on a phone a tap on a pill is the cell), a
   block dragged to another cell moves it. Counts are of what is shown (§1). */
export function WeekCard({
  now,
  languages,
  langs,
  bar,
  guest = false,
}: {
  now: Date
  languages: Array<string> | undefined
  /** One per language area, in the order chips and presses show them. */
  langs: Array<Lang>
  /** TASKS TODAY, under the header (25 Oct). */
  bar?: ReactNode
  /** R8 · S3a: a guest's week is WORKOUT and their language — shake, post
      and commits are Artem's. */
  guest?: boolean
}) {
  const short = (area: string) =>
    langs.find((l) => l.slug === area)?.short ?? 'LANG'
  /* What each press writes: the same rows THIS MONTH's tiles write; a
     session one per language (25 Oct, his "log PT or ENG"). */
  const allWrites: Array<Write> = [
    {
      key: 'workout',
      name: 'WORKOUT',
      icon: 'workout',
      kind: 'workout',
      area: 'body',
    },
    ...langs.map((l) => ({
      key: `langs-${l.slug}`,
      name: l.short,
      icon: 'langs' as const,
      kind: 'session',
      area: l.slug,
    })),
    {
      key: 'shake',
      name: 'SHAKE',
      icon: 'shake',
      kind: 'intake',
      area: 'body',
      category: 'supplements',
    },
    { key: 'post', name: 'POST', icon: 'post', kind: 'post', area: 'social' },
  ]
  const writes = guest
    ? allWrites.filter((w) => w.key !== 'shake' && w.key !== 'post')
    : allWrites
  const monday = startOfWeek(now)
  const dayStarts = Array.from({ length: 7 }, (_, i) =>
    addDays(monday, i).getTime(),
  )
  const end = addDays(monday, 7).getTime()
  const rows: Rows | undefined = useQuery(
    api.aggregate.weekItems,
    languages === undefined
      ? 'skip'
      : {
          from: dayStarts[0],
          to: end,
          languages: languages.length > 0 ? languages : ['portuguese'],
        },
  )
  const create = useMutation(api.logs.create)
  const move = useMutation(api.logs.setTime)
  const save = useSave()
  const [tip, setTip] = useState<Tip | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [landed, setLanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const drag = useRef<{ id: string; at: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const t = now.getTime()

  useEffect(() => {
    if (save.status !== 'saved') return
    const id = setTimeout(() => {
      save.settle()
      setLanded(null)
    }, 1800)
    return () => clearTimeout(id)
  }, [save.status, save.settle])

  useEffect(() => {
    if (!menu) return
    const off = () => setMenu(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && off()
    document.addEventListener('click', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('click', off)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  const cells = rows ? weekCells(rows, dayStarts) : undefined
  const count = (k: WeekKind, area?: string) =>
    rows
      ? rows.filter(
          (r) => r.kind === k && (area === undefined || r.area === area),
        ).length
      : 0
  /* The header's chips: a language each (25 Oct), never a task — a tick is
     intent, not something done. */
  type Chip = { key: string; kind: WeekKind; area: string; name: string }
  const chips = (guest ? GUEST_KINDS : WEEK_KINDS).flatMap((k): Array<Chip> =>
    k === 'langs'
      ? langs.map((l) => ({
          key: `langs-${l.slug}`,
          kind: k,
          area: l.slug,
          name: l.short,
        }))
      : [{ key: k, kind: k, area: areaOf(k), name: k.toUpperCase() }],
  )
  const place = (el: HTMLElement) => {
    const b = box.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return b
      ? { x: r.left - b.left + r.width / 2, y: r.top - b.top }
      : { x: 0, y: 0 }
  }

  async function write(job: () => Promise<unknown>, cell: string) {
    setError(null)
    try {
      await save.run(job)
      setLanded(cell)
    } catch (e) {
      setError(
        e instanceof Error && 'data' in e && typeof e.data === 'string'
          ? e.data.toUpperCase()
          : 'NOT SAVED',
      )
    }
  }

  const from = new Date(dayStarts[0])
  const to = new Date(dayStarts[6])
  const span = `${from.getDate()} – ${to.getDate()} ${to
    .toLocaleDateString('en-GB', { month: 'short' })
    .toUpperCase()}`

  return (
    <section
      aria-label="This week"
      className="glass motion-arrive @container relative z-10 rounded-[18px] px-5 py-[18px]"
    >
      <div className="mb-[14px] flex flex-wrap items-center justify-between gap-2.5">
        <span className="label-caps">This week · {span}</span>
        <div className="flex flex-wrap items-center gap-2">
          {rows?.length === 0 ? (
            <span
              data-testid="week-empty"
              className="rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-primary"
            >
              NOTHING LOGGED
            </span>
          ) : null}
          {error ? (
            <span
              role="alert"
              data-testid="week-error"
              className="rounded-full border border-state-danger/50 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-danger"
            >
              {error}
            </span>
          ) : null}
          <span
            data-testid="week-save"
            className={`font-mono text-[10px] tracking-[0.12em] ${save.status === 'idle' ? 'hidden' : 'text-ink-300'}`}
          >
            <SaveLabel status={save.status} onSettled={save.settle}>
              SAVED
            </SaveLabel>
          </span>
          {chips.map((c) => (
            <span
              key={c.key}
              data-testid={`chip-${c.key}`}
              className="flex items-center gap-1.5 rounded-full border border-lift/[0.09] px-2.5 py-[3px] font-mono text-[10px] tracking-[0.12em] text-ink-300"
            >
              <AreaIcon icon={ICON[c.kind]} area={c.area} size={14} />
              <span
                className={c.kind === 'langs' ? 'inline' : 'hidden @2xl:inline'}
              >
                {c.name}
              </span>
              <b className="font-medium text-ink-100">
                {count(c.kind, c.kind === 'langs' ? c.area : undefined)}
              </b>
            </span>
          ))}
        </div>
      </div>

      {bar}

      <div
        ref={box}
        data-testid="week-grid"
        className="relative grid grid-cols-[34px_repeat(7,1fr)] gap-1 @2xl:grid-cols-[72px_repeat(7,1fr)]"
      >
        <div />
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`pb-1 text-center font-mono text-[9.5px] tracking-[0.12em] ${i === todayIndex(dayStarts, t) ? 'text-lav-300' : 'text-ink-500'}`}
          >
            {d}
            <span className="hidden @2xl:inline">
              {' '}
              {new Date(dayStarts[i]).getDate()}
            </span>
          </div>
        ))}
        {BANDS.map((band, bi) => (
          <BandRow key={band.name} label={band} current={isCurrentBand(t, bi)}>
            {dayStarts.map((ds, di) => {
              const key = `${bi}-${di}`
              const future = isFuture(t, ds, bi as 0 | 1 | 2)
              const isNow =
                di === todayIndex(dayStarts, t) &&
                pressAt(t, ds, bi as 0 | 1 | 2) === t
              const blocks = cells?.[bi][di] ?? []
              return (
                <div
                  key={key}
                  data-testid={`cell-${key}`}
                  aria-disabled={future}
                  onClick={(e) => {
                    if (future || cells === undefined) return
                    e.stopPropagation()
                    const p = place(e.currentTarget)
                    setTip(null)
                    setMenu({
                      ...p,
                      day: di,
                      band: bi as 0 | 1 | 2,
                      at: pressAt(t, ds, bi as 0 | 1 | 2),
                    })
                  }}
                  onDragOver={(e) => {
                    if (!drag.current) return
                    setOver(key)
                    if (!future) e.preventDefault()
                  }}
                  onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOver(null)
                    const d = drag.current
                    drag.current = null
                    if (!d || future) return
                    const at = dropAt(d.at, ds, bi as 0 | 1 | 2)
                    if (at === d.at) return
                    void write(
                      () => move({ logId: d.id as Id<'logs'>, occurredAt: at }),
                      key,
                    )
                  }}
                  className={`group relative flex min-h-[38px] flex-wrap content-center justify-center gap-1 rounded-[10px] border p-[5px] transition-colors ${
                    over === key
                      ? future
                        ? 'border-state-danger'
                        : 'border-lav-400 bg-lav-400/10'
                      : isNow
                        ? 'border-lav-400 shadow-[0_0_22px_-8px_var(--color-lav-400)]'
                        : 'border-lift/[0.09] bg-lift/[0.02]'
                  } ${future ? 'opacity-35' : 'cursor-pointer hover:border-lav-400/40 hover:bg-lav-400/5'} ${landed === key ? 'motion-edge' : ''}`}
                >
                  {isNow ? (
                    <span
                      data-testid="week-now"
                      className="absolute -top-[7px] right-1 z-10 rounded bg-ink-100 px-1 font-mono text-[8.5px] leading-[13px] text-background"
                    >
                      {clock(t)}
                    </span>
                  ) : null}
                  {blocks.map((b, n) => (
                    <BlockPill
                      key={`${b.id ?? b.kind}${b.at}`}
                      block={b}
                      name={nameOf(b, short)}
                      index={n}
                      onTip={(el) =>
                        setTip(el ? { ...place(el), block: b, day: di } : null)
                      }
                      onDrag={(on) => {
                        setTip(null)
                        drag.current =
                          on && b.id ? { id: b.id, at: b.at } : null
                        if (!on) setOver(null)
                      }}
                    />
                  ))}
                  {!future ? (
                    <i className="hidden h-[18px] min-w-[18px] rounded-[6px] border border-dashed border-lav-400/60 text-center font-mono text-[11px] leading-4 text-lav-300 not-italic group-hover:block">
                      +
                    </i>
                  ) : null}
                </div>
              )
            })}
          </BandRow>
        ))}

        {tip ? (
          <div
            data-testid="week-tip"
            style={{
              left: tip.x,
              top: tip.y - 8,
              ['--area' as string]: areaColour(tip.block),
            }}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full rounded-xl border border-lift/[0.09] bg-popover px-3 py-2.5 font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap text-ink-200 shadow-xl"
          >
            <b className="mb-1 block text-[12px] font-medium tracking-[0.14em] text-(--area)">
              {nameOf(tip.block, short)}
              {tip.block.movedFrom !== undefined ? ' · MOVED' : ''}
            </b>
            {detail(tip.block)}
            <br />
            <span className="text-ink-400">
              {DAYS[tip.day]} {new Date(dayStarts[tip.day]).getDate()} ·{' '}
              {clock(tip.block.at)}
              {tip.block.movedFrom !== undefined
                ? ` · WAS ${dayName(tip.block.movedFrom)} ${clock(tip.block.movedFrom)}`
                : ''}
            </span>
          </div>
        ) : null}

        {menu ? (
          <div
            data-testid="week-menu"
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              left: Math.max(
                8,
                Math.min(menu.x - 130, (box.current?.clientWidth ?? 0) - 268),
              ),
              top: menu.y + 44,
            }}
            className="absolute z-40 w-[260px] rounded-[14px] border border-lift/[0.09] bg-popover p-2.5 shadow-2xl"
          >
            <div className="mb-2 font-mono text-[10px] tracking-[0.14em] text-ink-300">
              {DAYS[menu.day]} {new Date(dayStarts[menu.day]).getDate()} ·{' '}
              {clock(menu.at)}
            </div>
            {(cells?.[menu.band][menu.day] ?? []).map((b) => (
              <div
                key={`${b.id ?? b.kind}${b.at}`}
                data-testid="menu-block"
                className="flex items-center gap-2 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-ink-300"
              >
                <AreaIcon
                  icon={ICON[b.kind]}
                  area={b.kind === 'task' ? 'projects' : b.area}
                  size={14}
                />
                <span className="min-w-0 flex-1 truncate">{detail(b)}</span>
                <span className="text-ink-500">{clock(b.at)}</span>
              </div>
            ))}
            {(cells?.[menu.band][menu.day].length ?? 0) > 0 ? (
              <div className="my-1.5 border-t border-lift/[0.09]" />
            ) : null}
            {writes.map((w) => {
              const log = (extra: object = {}) => {
                const m = menu
                setMenu(null)
                void write(
                  () =>
                    create({
                      kind: w.kind as 'workout',
                      area: w.area,
                      occurredAt: m.at,
                      ...(w.category ? { category: w.category } : {}),
                      ...extra,
                    }),
                  `${m.band}-${m.day}`,
                )
              }
              const row =
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[10.5px] tracking-[0.12em] text-ink-200'
              /* A session says its kind, one tap (25 Oct), so Languages
                 counts it. */
              return w.kind === 'session' ? (
                <div key={w.key} className={`${row} flex-wrap`}>
                  <AreaIcon icon={ICON[w.icon]} area={w.area} size={14} />
                  {w.name}
                  <span className="flex flex-wrap gap-1">
                    {SESSION_KINDS.map((k) => (
                      <button
                        key={k.category}
                        type="button"
                        role="menuitem"
                        aria-label={`Log ${w.name} ${k.label}`}
                        onClick={() =>
                          log({ category: k.category, ...k.extra })
                        }
                        className="rounded-md border border-lift/[0.09] px-1.5 py-0.5 text-[9.5px] text-ink-300 hover:border-lav-400/50 hover:bg-lav-400/10 hover:text-ink-100"
                      >
                        {k.label}
                      </button>
                    ))}
                  </span>
                </div>
              ) : (
                <button
                  key={w.key}
                  type="button"
                  role="menuitem"
                  aria-label={`Log ${w.name}`}
                  onClick={() => log()}
                  className={`${row} hover:bg-lift/[0.07]`}
                >
                  <AreaIcon icon={ICON[w.icon]} area={w.area} size={14} />
                  {w.name}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function areaOf(k: WeekKind) {
  return k === 'post' ? 'social' : k === 'commits' ? 'projects' : 'body'
}

import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { ChevronDown, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { SaveLabel, useSave } from '@/components/Saving'
import { inLabel, nextItem } from '@/lib/day'
import { buildTimeline } from '@/lib/timeline'
import type { ICONS } from './AreaIcon'
import { AreaIcon } from './AreaIcon'

const TODAY_LIMIT = 3

/** The ＋ TASK button, for anything handing you the day's first move. */
export const PICK_BUTTON_ID = 'pick-todays-three'

/** Something offered in the dropdown: one of today's events still ahead, a
    goal behind its month, the focus project's next task. */
export type Pick = {
  title: string
  area?: string
  icon?: keyof typeof ICONS
  taskId?: Id<'tasks'>
}

/* TASKS TODAY (25 Oct, mockup design/today-mockup/three.html, his "go"):
   picking is rare ("three we wont see every day"), so it is one bar inside
   THIS WEEK, not a card of empty rows. A picked task is a chip; a ticked
   one is also a ✓ TASK pill in the week where it was ticked. The NEXT line
   of the old TODAY card lives here. §3c.1 holds: pickForToday refuses a
   fourth (TODAY_FULL), a finished one keeps its place until the day ends,
   only drop frees it. */
export function TaskBar({
  tasks,
  events,
  today,
  picks,
  iconFor,
  now,
}: {
  tasks: Array<Doc<'tasks'>>
  events: Array<Doc<'events'>>
  today: string
  picks: Array<Pick>
  iconFor: (area: string | undefined) => keyof typeof ICONS | undefined
  now: Date
}) {
  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const complete = useMutation(api.tasks.complete)
  const reopen = useMutation(api.tasks.reopen)
  const drop = useMutation(api.tasks.dropFromToday)
  const save = useSave()

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState(false)
  /* What was pressed, until the server agrees. */
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)

  const isDone = (t: Doc<'tasks'>) => ticked[t._id] ?? t.status === 'done'
  const done = tasks.filter(isDone).length
  const full = tasks.length >= TODAY_LIMIT
  const busy = save.status === 'saving'

  useEffect(() => {
    if (!open) return
    field.current?.focus()
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const items = buildTimeline(tasks, events, [], {
    start: dayStart.getTime(),
    end: dayEnd.getTime(),
  })
  const next = nextItem(items, now.getTime())
  const taken = new Set(tasks.map((t) => t.title.toLowerCase()))
  /* What is still ahead today, then the rest; four at most. */
  const offered = [
    ...items
      .filter((i) => i.source === 'event' && i.startsAt > now.getTime())
      .map((i) => ({ title: i.title, area: i.area, icon: iconFor(i.area) })),
    ...picks,
  ]
    .filter(
      (p, i, all) =>
        !taken.has(p.title.toLowerCase()) &&
        all.findIndex((q) => q.title === p.title) === i,
    )
    .slice(0, 4)

  async function take(pick: Pick) {
    if (busy || full) return
    setError(false)
    try {
      await save.run(async () => {
        const taskId =
          pick.taskId ??
          (await createTask({
            title: pick.title,
            ...(pick.area ? { area: pick.area } : {}),
          }))
        await pickForToday({ taskId, today })
      })
      setTitle('')
      setOpen(false)
    } catch {
      setError(true)
    }
  }

  async function tick(task: Doc<'tasks'>) {
    const d = !isDone(task)
    setTicked((m) => ({ ...m, [task._id]: d }))
    setFlash(d ? task._id : null)
    try {
      if (d) await complete({ taskId: task._id })
      else await reopen({ taskId: task._id })
    } catch {
      setTicked((m) => ({ ...m, [task._id]: !d }))
    }
  }

  return (
    <div
      ref={box}
      data-testid="task-bar"
      className="relative z-20 mb-[14px] flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-[12px] border border-dashed border-lift/[0.12] px-2.5 py-2"
    >
      <span className="label-caps whitespace-nowrap">Tasks today</span>
      <span
        data-testid="three-count"
        className="rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap text-lav-400"
      >
        {full ? `${done} OF 3 DONE` : `${tasks.length} OF 3`}
      </span>
      {error ? (
        <span
          role="alert"
          className="rounded-full border border-state-danger/50 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-danger"
        >
          NOT SAVED
        </span>
      ) : null}
      {tasks.map((task) => {
        const d = isDone(task)
        const icon = iconFor(task.area)
        return (
          <div
            key={task._id}
            data-testid="task-chip"
            data-done={d}
            data-flash={flash === task._id}
            className="td-slot group motion-arrive flex max-w-full min-w-0 items-center gap-2 rounded-full border border-lift/[0.09] bg-lift/[0.04] py-1 pr-2 pl-1"
          >
            <button
              type="button"
              aria-label={`${d ? 'Un-tick' : 'Complete'} ${task.title}`}
              aria-pressed={d}
              onClick={() => void tick(task)}
              className="td-tick !size-[18px]"
            >
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
              </svg>
            </button>
            {icon && task.area ? (
              <AreaIcon icon={icon} area={task.area} size={14} />
            ) : null}
            <span
              className={`td-label min-w-0 truncate text-[13px] ${d ? 'line-through decoration-ink-500' : ''}`}
            >
              {task.title}
            </span>
            <button
              type="button"
              aria-label={`Drop ${task.title}`}
              onClick={() => void drop({ taskId: task._id })}
              className="text-ink-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-400 focus:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
      <span className="grow" />
      {next ? (
        <span
          data-testid="next"
          className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-ink-300"
        >
          <span className="text-lav-400">NEXT</span>
          <span data-testid="next-title" className="text-ink-100">
            {next.title}
          </span>
          <span
            data-testid="next-in"
            className="td-live rounded-full border border-current px-2 py-0.5 text-[9.5px] text-lav-400"
          >
            {inLabel(next.startsAt - now.getTime())}
            {next.durationMin ? ` · ${next.durationMin} MIN` : ''}
          </span>
        </span>
      ) : null}
      {full ? null : (
        <div className="relative">
          <button
            id={PICK_BUTTON_ID}
            type="button"
            aria-expanded={open}
            aria-busy={busy}
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded-full border border-lav-400/45 px-3 py-1 font-mono text-[10px] tracking-[0.16em] whitespace-nowrap text-lav-400 transition-[background,box-shadow] hover:bg-lav-400/10 hover:shadow-[0_0_18px_-8px_var(--color-lav-400)] ${open ? 'bg-lav-400/10' : ''}`}
          >
            <SaveLabel status={save.status} onSettled={save.settle}>
              ＋ TASK
            </SaveLabel>
            <ChevronDown
              className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
          {open ? (
            <div
              role="menu"
              data-testid="task-menu"
              className="absolute top-[calc(100%+8px)] right-0 z-40 w-[min(340px,calc(100vw-40px))] origin-top-right rounded-[14px] border border-lift/[0.09] bg-popover p-2 shadow-2xl"
            >
              <label className="flex items-center gap-2 rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] px-2.5 py-2">
                <input
                  ref={field}
                  value={title}
                  readOnly={busy}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    const t = title.trim()
                    if (e.key === 'Enter' && t) void take({ title: t })
                  }}
                  placeholder="own task"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground caret-lav-400 outline-none placeholder:text-ink-600"
                />
                <kbd className="rounded border border-lift/[0.09] px-1 font-mono text-[10px] text-ink-500">
                  ↵
                </kbd>
              </label>
              {offered.length > 0 ? (
                <div className="label-caps px-2 pt-3 pb-1.5">Suggested</div>
              ) : null}
              {offered.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  role="menuitem"
                  aria-label={`Pick ${p.title}`}
                  disabled={busy}
                  onClick={() => void take(p)}
                  className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left text-[14px] text-ink-200 hover:bg-lav-400/10"
                >
                  {p.icon && p.area ? (
                    <AreaIcon icon={p.icon} area={p.area} size={16} />
                  ) : (
                    <span className="size-4" />
                  )}
                  <span className="min-w-0 flex-1">{p.title}</span>
                  {p.area ? (
                    <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-500 uppercase">
                      {p.area}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

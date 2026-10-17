import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { ICONS } from './AreaIcon'
import { AreaIcon } from './AreaIcon'

const TODAY_LIMIT = 3

/** The own-task field, for anything handing you the day's first move. */
export const PICK_FIELD_ID = 'pick-todays-three'

/** Something offered for the next empty slot: one of today's events, a
    goal behind its month, the focus project's next task. */
export type Pick = {
  title: string
  area?: string
  icon?: keyof typeof ICONS
  taskId?: Id<'tasks'>
}

/* TODAY'S THREE inside the TODAY card (17 Oct mockup). Three slots, the
   next empty one offering picks and an own task. A tick plays in place —
   the slot is the same element before and after, and the done state is
   set at once, before the write lands, so nothing re-renders under it.
   §3c.1 holds: pickForToday refuses a fourth (TODAY_FULL), a finished one
   keeps its slot until the day ends, only drop frees it. */
export function ThreeSlots({
  tasks,
  today,
  picks,
  iconFor,
}: {
  tasks: Array<Doc<'tasks'>>
  today: string
  picks: Array<Pick>
  iconFor: (area: string | undefined) => keyof typeof ICONS | undefined
}) {
  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const complete = useMutation(api.tasks.complete)
  const reopen = useMutation(api.tasks.reopen)
  const drop = useMutation(api.tasks.dropFromToday)

  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  /* What was pressed, until the server agrees. */
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [flash, setFlash] = useState<string | null>(null)

  const isDone = (t: Doc<'tasks'>) => ticked[t._id] ?? t.status === 'done'
  const done = tasks.filter(isDone).length
  const open = tasks.length

  const field = useRef<HTMLInputElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    field.current?.focus()
  }, [open])

  async function take(pick: Pick) {
    if (busy || open >= TODAY_LIMIT) return
    setBusy(true)
    refocus.current = true
    try {
      const taskId =
        pick.taskId ??
        (await createTask({
          title: pick.title,
          ...(pick.area ? { area: pick.area } : {}),
        }))
      await pickForToday({ taskId, today })
    } finally {
      setBusy(false)
    }
  }

  async function own() {
    const t = title.trim()
    if (t.length === 0) return
    await take({ title: t })
    setTitle('')
  }

  async function tick(task: Doc<'tasks'>) {
    const next = !isDone(task)
    setTicked((m) => ({ ...m, [task._id]: next }))
    setFlash(next ? task._id : null)
    try {
      if (next) await complete({ taskId: task._id })
      else await reopen({ taskId: task._id })
    } catch {
      setTicked((m) => ({ ...m, [task._id]: !next }))
    }
  }

  return (
    <>
      <div className="mt-[18px] mb-2.5 flex items-center justify-between border-t border-lift/[0.09] pt-4">
        <span className="label-caps">Today&rsquo;s three</span>
        <span
          data-testid="three-count"
          className="rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-400"
        >
          {open < TODAY_LIMIT ? `${open} OF 3` : `${done} OF 3 DONE`}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {Array.from({ length: TODAY_LIMIT }, (_, slot) => {
          const number = String(slot + 1).padStart(2, '0')
          const task = slot < tasks.length ? tasks[slot] : undefined
          if (task !== undefined) {
            const d = isDone(task)
            const icon = iconFor(task.area)
            return (
              <div
                key={task._id}
                data-testid={`slot-${slot}`}
                data-done={d}
                data-flash={flash === task._id}
                className="td-slot group motion-arrive flex min-h-[92px] flex-col gap-2 rounded-[12px] border border-lift/[0.09] bg-lift/[0.025] p-3"
              >
                <span className="font-mono text-[10px] text-ink-500">
                  {number}
                </span>
                <span className="flex flex-1 items-center gap-2.5 text-[15px]">
                  <button
                    type="button"
                    aria-label={`${d ? 'Un-tick' : 'Complete'} ${task.title}`}
                    aria-pressed={d}
                    onClick={() => void tick(task)}
                    className="td-tick"
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
                    <AreaIcon icon={icon} area={task.area} size={22} />
                  ) : null}
                  <span className="td-label min-w-0 flex-1 truncate">
                    {task.title}
                  </span>
                </span>
                <span className="absolute top-2.5 right-2.5 flex items-center gap-2">
                  <span className="td-ok rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-300">
                    DONE
                  </span>
                  <button
                    type="button"
                    aria-label={`Drop ${task.title}`}
                    onClick={() => void drop({ taskId: task._id })}
                    className="text-ink-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink-400 focus:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </div>
            )
          }
          return (
            <div
              key={`empty-${slot}`}
              data-testid={`slot-${slot}`}
              className="flex min-h-[92px] flex-col gap-2 rounded-[12px] border border-dashed border-lift/[0.09] bg-lift/[0.025] p-3"
            >
              <span className="font-mono text-[10px] text-ink-500">
                {number}
              </span>
              {slot === open ? (
                <div className="flex flex-wrap gap-1.5">
                  {picks.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      aria-label={`Pick ${p.title}`}
                      disabled={busy}
                      onClick={() => void take(p)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-lift/[0.09] px-2.5 py-1 text-[12px] text-ink-200 transition-[border-color,box-shadow] hover:border-lav-400/50 hover:shadow-[0_0_14px_-6px_var(--color-lav-400)]"
                    >
                      {p.icon && p.area ? (
                        <AreaIcon icon={p.icon} area={p.area} size={14} />
                      ) : null}
                      {p.title}
                    </button>
                  ))}
                  <input
                    ref={field}
                    id={PICK_FIELD_ID}
                    value={title}
                    readOnly={busy}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void own()
                    }}
                    placeholder="＋ own task"
                    className="min-w-0 flex-[1_1_120px] rounded-full border border-dashed border-lav-400/40 bg-transparent px-2.5 py-1 text-[12px] text-foreground outline-none placeholder:text-lav-300 focus:border-solid focus:border-lav-400"
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}

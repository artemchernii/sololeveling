import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { ArrowUp, CalendarPlus, Plus, Shapes, Target, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { BindOptions } from './BindSelect'
import { ChipSelect } from './ChipSelect'
import { SaveGlyph, useSave } from '@/components/Saving'
import { areaVars, useAreaLabel, useAreas } from '@/lib/areas'
import { localInputValue } from '@/lib/format'

/* The way into the backlog (24 Sep). Artem: "when we create it's a bit too
   bland. We can add only text."

   A task is still creatable from a title alone (§3b.3) — Enter on the line
   does exactly that. What is new is what appears under it once you start
   typing: an area, what it is for, a time on the calendar, and "today" if
   there is room among the three. Each is one tap and none is required. */
export function AddTask({
  projects,
  goals,
  today,
  full,
}: {
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
  today: string
  full: boolean
}) {
  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const areas = useAreas()
  const areaLabel = useAreaLabel()
  const adding = useSave()

  const [title, setTitle] = useState('')
  const [area, setArea] = useState('')
  const [bound, setBound] = useState('')
  const [when, setWhen] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [forToday, setForToday] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const open = title.length > 0

  function reset() {
    setTitle('')
    setArea('')
    setBound('')
    setWhen('')
    setMinutes('60')
    setForToday(false)
  }

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    const at = when === '' ? undefined : new Date(when).getTime()
    const mins = Number(minutes)
    setProblem(null)
    try {
      await adding.run(async () => {
        const taskId = await createTask({
          title: trimmed,
          area: area === '' ? undefined : area,
          projectId: bound.startsWith('p:')
            ? (bound.slice(2) as Id<'projects'>)
            : undefined,
          goalId: bound.startsWith('g:')
            ? (bound.slice(2) as Id<'goals'>)
            : undefined,
          scheduledAt: at !== undefined && Number.isFinite(at) ? at : undefined,
          durationMin:
            at !== undefined && Number.isFinite(mins) && mins > 0
              ? Math.round(mins)
              : undefined,
        })
        if (forToday) await pickForToday({ taskId, today })
      })
      reset()
    } catch (e) {
      /* The task is written before today is asked for, so a full day still
         leaves it in the backlog — which is where it would be anyway. */
      setProblem(
        e instanceof ConvexError && e.data === 'TODAY_FULL'
          ? 'Added to the backlog — today was already full.'
          : 'That did not save.',
      )
      reset()
    }
  }

  const chosenBind = bound.startsWith('p:')
    ? projects.find((p) => p._id === bound.slice(2))?.title
    : bound.startsWith('g:')
      ? goals.find((g) => g._id === bound.slice(2))?.title
      : undefined

  return (
    <div
      className={`rounded-[16px] transition-colors ${
        open ? 'bg-lift/[0.035] ring-1 ring-lav-300/25' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <SaveGlyph
          status={adding.status}
          onSettled={adding.settle}
          idle={<Plus className="size-4" />}
          className={open ? 'text-lav-300' : 'text-ink-600'}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
            if (e.key === 'Escape') reset()
          }}
          placeholder="Something to do, eventually"
          aria-label="New task"
          className="flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-ink-600"
        />
        {open ? (
          /* A way out that is not "delete what I typed" (24 Sep). Esc does
             the same. */
          <div className="motion-arrive flex items-center gap-1">
            <button
              type="button"
              onClick={reset}
              className="motion-press rounded-full px-2.5 py-1 text-[12px] text-ink-500 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void add()}
              className="motion-press flex items-center gap-1.5 rounded-full bg-lav-300/16 px-3 py-1 text-[12px] text-lav-200 ring-1 ring-lav-300/40 hover:bg-lav-300/24"
            >
              Add
              <span className="font-mono text-[10.5px] text-lav-300/80">↵</span>
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="motion-arrive flex flex-wrap items-center gap-1.5 border-t border-lift/[0.06] px-3 py-2">
          <ChipSelect
            label="Area"
            value={area}
            text={area === '' ? 'area' : areaLabel(area)}
            onChange={setArea}
            icon={<Shapes className="size-3 shrink-0" />}
            style={area === '' ? undefined : areaVars(area)}
            className={
              area === ''
                ? 'text-ink-500 ring-1 ring-lift/10 hover:text-ink-200'
                : 'bg-(--area)/14 text-(--area) ring-1 ring-(--area)/35'
            }
          >
            <option value="">No area</option>
            {areas.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.label}
              </option>
            ))}
          </ChipSelect>

          <ChipSelect
            label="What it is for"
            value={bound}
            text={chosenBind ?? 'project or goal'}
            onChange={setBound}
            icon={<Target className="size-3 shrink-0" />}
            className={
              chosenBind
                ? 'bg-lift/[0.08] text-foreground ring-1 ring-lift/20'
                : 'text-ink-500 ring-1 ring-lift/10 hover:text-ink-200'
            }
          >
            <BindOptions projects={projects} goals={goals} />
          </ChipSelect>

          {when === '' ? (
            <button
              type="button"
              onClick={() => setWhen(localInputValue(nextHour()))}
              className="motion-press flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] text-ink-500 ring-1 ring-lift/10 hover:text-ink-200"
            >
              <CalendarPlus className="size-3" />
              schedule
            </button>
          ) : (
            <span className="motion-arrive flex items-center gap-1 rounded-full bg-lav-300/12 py-0.5 pr-1 pl-2 text-[11.5px] text-lav-200 ring-1 ring-lav-300/35">
              <CalendarPlus className="size-3" />
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                aria-label="When"
                className="bg-transparent font-mono text-[11px] text-lav-100 outline-none"
              />
              <input
                type="number"
                min={5}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                aria-label="Minutes"
                className="w-10 bg-transparent text-right font-mono text-[11px] text-lav-100 outline-none"
              />
              <span className="font-mono text-[10.5px] text-lav-300/80">
                min
              </span>
              <button
                type="button"
                aria-label="No time"
                onClick={() => setWhen('')}
                className="grid size-5 place-items-center rounded-full text-lav-300 hover:bg-lav-300/20"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={forToday}
            disabled={full}
            onClick={() => setForToday((v) => !v)}
            title={full ? 'Today is full. Finish one or drop one.' : undefined}
            className={`motion-press flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ring-1 transition-colors disabled:opacity-40 ${
              forToday
                ? 'bg-lav-300/16 text-lav-200 ring-lav-300/45'
                : 'text-ink-500 ring-lift/10 hover:text-ink-200'
            }`}
          >
            <ArrowUp className="size-3" />
            today
          </button>
        </div>
      ) : null}

      {problem ? (
        <p className="px-3 pb-2 text-[12px] text-ink-400">{problem}</p>
      ) : null}
    </div>
  )
}

/** The top of the next hour — a first guess, never a stored value. */
function nextHour(): number {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d.getTime()
}

import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, ListChecks, Plus, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'
import { agoLabel } from '@/lib/format'
import { useArrived } from '@/lib/loading'
import { QuestFollowUp } from './QuestFollowUp'
import { QuestRow, REVEAL, scheduleLabel } from './QuestRow'
import type { PendingEvidence } from './QuestRow'

const TODAY_LIMIT = 3

/** The open slot's field, for anything handing you the day's first move. */
export const PICK_FIELD_ID = 'pick-todays-three'

/* PLAN.md §3 item 2 and §3c.1: three, hard. Three slots are drawn whether or
   not they are filled, numbered 01–03 — the day has that shape before you
   choose anything, and an empty slot is the invitation. The first empty one
   is the field you type into; the rest wait behind it.

   The card is a fixed shape: a header and three 48px rows, and nothing
   ever appears under them (16 Sep, measured). A match list, a follow-up or
   a "today is full" line below the slots grew the card by 20–65px, and
   every card under it jumped with each keystroke and each tick. So the
   picker is an overlay, the follow-up lives inside its own slot, and being
   full is said by the third slot being filled.

   One kind of row (16 Sep, second pass): a box per slot, styled three ways
   for filled, open and empty, read as a form rather than a day. Now all
   three are the same hairline row as the TODAY card beside it, and only the
   number says which area a task is in.

   A finished one stays in its slot, ticked, until the day ends: before that
   it vanished and the card at night looked like a morning where nothing
   had happened. It can still be un-ticked, refiled or dropped.

   The three are chosen from the backlog, not a second list beside it. The
   open slot writes a new task, or opens the backlog to pick one — the whole
   list, behind a tap, never its count (§3c.3).

   The Quests page lived here until 15 Sep; this card is it now. */
export function QuestList({
  tasks,
  today,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  today: string
}) {
  const arrived = useArrived(tasks)
  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const [title, setTitle] = useState('')
  const adding = useSave()

  /* The §3b.1 follow-up for the slot that was just ticked. */
  const [pending, setPending] = useState<PendingEvidence | null>(null)

  const picked = tasks ?? []
  const done = picked.filter((t) => t.status === 'done').length
  /* The first slot with nothing in it is the one that takes the typing. */
  const openSlot = picked.length

  /* The backlog is read only once the open slot is reached for — focused,
     or its Backlog button hovered — so it is in hand by the time the list
     is asked for, and the list never opens as an empty box that snaps to
     size. Never on the morning screen by default (§3c.3). */
  const [warm, setWarm] = useState(false)
  const backlog = useQuery(api.tasks.listBacklog, warm ? {} : 'skip')
  const typed = title.trim().toLowerCase()
  const matches = (backlog ?? []).filter(
    (t) => typed.length === 0 || t.title.toLowerCase().includes(typed),
  )

  /* The list opens from the button, or by itself once what is typed matches
     something waiting — writing a new task does not summon an empty list.
     It is closed by a pick, Escape, or a click anywhere else. */
  const [picking, setPicking] = useState(false)
  const [active, setActive] = useState(-1)
  const [refusal, setRefusal] = useState<string | null>(null)
  const slotsRef = useRef<HTMLDivElement>(null)
  const showPicker =
    openSlot < TODAY_LIMIT &&
    backlog !== undefined &&
    (picking || (typed.length > 0 && matches.length > 0))

  useEffect(() => {
    if (!showPicker) return
    function away(e: MouseEvent) {
      if (!slotsRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [showPicker])

  /* Filling a slot moves the field to the next one, which is a new input;
     the cursor follows it, so three can be written without the mouse. */
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    document.getElementById(PICK_FIELD_ID)?.focus()
  }, [openSlot])

  function close() {
    setPicking(false)
    setActive(-1)
    setRefusal(null)
  }

  async function pickExisting(taskId: Doc<'tasks'>['_id']) {
    refocus.current = true
    try {
      await pickForToday({ taskId, today })
      setTitle('')
      close()
    } catch {
      refocus.current = false
      setRefusal('Today is full. Finish one or drop one.')
    }
  }

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    refocus.current = true
    await adding.run(async () => {
      const id = await createTask({ title: trimmed })
      /* Created here means "I intend to do it today" — so it takes a slot
         immediately. Created anywhere else, it waits in the backlog. */
      await pickForToday({ taskId: id, today })
    })
    setTitle('')
    close()
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!showPicker) {
        setPicking(true)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.max(-1, Math.min(matches.length - 1, i + step)))
    }
    if (e.key === 'Enter') {
      const chosen = showPicker && active >= 0 ? matches.at(active) : undefined
      if (chosen) void pickExisting(chosen._id)
      else void add()
    }
    if (e.key === 'Escape') close()
  }

  return (
    <div
      className={`glass relative flex min-h-[216px] flex-col gap-2 rounded-[22px] p-5 ${
        /* The card is its own layer (backdrop-filter), so the list can only
           rise above the next card if the whole card does. */
        showPicker ? 'z-10' : ''
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today&rsquo;s three</div>
        {/* Nothing until one is finished: the three rows already say how
            many are chosen. */}
        <div className="label-caps">{done > 0 ? `${done} done` : ''}</div>
      </div>

      {tasks === undefined ? (
        <SkeletonRows rows={2} />
      ) : (
        <div ref={slotsRef} className={`relative ${arrived}`}>
          <div className="flex flex-col">
            {Array.from({ length: TODAY_LIMIT }, (_, slot) => {
              /* `.length`, not a bare index: without noUncheckedIndexedAccess
                 TypeScript believes every index is filled. */
              const task = slot < picked.length ? picked[slot] : undefined
              if (task !== undefined) {
                const isDone = task.status === 'done'
                return (
                  <Slot
                    key={task._id}
                    number={slot}
                    area={task.area}
                    done={isDone}
                  >
                    {pending?.taskId === task._id ? (
                      <QuestFollowUp
                        pending={pending}
                        onDone={() => setPending(null)}
                      />
                    ) : isDone ? (
                      <DoneRow task={task} />
                    ) : (
                      <QuestRow task={task} onCompleted={setPending} />
                    )}
                  </Slot>
                )
              }

              if (slot === openSlot) {
                return (
                  <Slot key={`open-${slot}`} number={slot}>
                    {/* The same 18px box the tick occupies in a filled slot,
                        so the glyph and the text line up down the card. */}
                    <span className="grid size-[18px] shrink-0 place-items-center text-ink-600 transition-colors group-focus-within:text-lav-400">
                      <SaveGlyph
                        status={adding.status}
                        onSettled={adding.settle}
                        idle={<Plus className="size-3.5" />}
                      />
                    </span>
                    <input
                      id={PICK_FIELD_ID}
                      value={title}
                      role="combobox"
                      aria-expanded={showPicker}
                      aria-controls="todays-three-backlog"
                      aria-activedescendant={
                        showPicker && active >= 0
                          ? `backlog-option-${active}`
                          : undefined
                      }
                      autoComplete="off"
                      onFocus={() => setWarm(true)}
                      onChange={(e) => {
                        setTitle(e.target.value)
                        setActive(-1)
                      }}
                      onKeyDown={onKey}
                      placeholder={
                        slot === 0
                          ? 'What are you actually doing today?'
                          : 'And then?'
                      }
                      className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground caret-lav-400 outline-none placeholder:text-ink-700"
                    />
                    <button
                      type="button"
                      aria-label="Pick from the backlog"
                      title="Pick from the backlog"
                      aria-expanded={showPicker}
                      onPointerEnter={() => setWarm(true)}
                      onFocus={() => setWarm(true)}
                      onClick={() => {
                        if (showPicker) {
                          close()
                          return
                        }
                        setWarm(true)
                        setPicking(true)
                        document.getElementById(PICK_FIELD_ID)?.focus()
                      }}
                      className={`grid size-7 shrink-0 place-items-center rounded-[6px] transition-colors hover:text-lav-300 ${
                        showPicker ? 'text-lav-300' : 'text-ink-600'
                      }`}
                    >
                      <ListChecks className="size-4" />
                    </button>
                  </Slot>
                )
              }

              return <Slot key={`empty-${slot}`} number={slot} />
            })}
          </div>

          {showPicker ? (
            <Picker
              rows={matches}
              typed={typed.length > 0}
              active={active}
              refusal={refusal}
              onHover={setActive}
              onPick={pickExisting}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

/* The backlog, to pick from — over the page, not in it, so nothing moves.
   Opaque (glass-modal), because it sits on top of the cards below; the card
   material let their numbers read through it. What is typed narrows it. */
function Picker({
  rows,
  typed,
  active,
  refusal,
  onHover,
  onPick,
}: {
  rows: Array<Doc<'tasks'>>
  typed: boolean
  active: number
  refusal: string | null
  onHover: (index: number) => void
  onPick: (taskId: Doc<'tasks'>['_id']) => void
}) {
  return (
    <div
      id="todays-three-backlog"
      role="listbox"
      aria-label="Pick from the backlog"
      className="glass-modal absolute inset-x-0 top-full z-20 mt-2 flex max-h-[280px] flex-col overflow-y-auto rounded-[14px] p-1.5"
    >
      {rows.length === 0 ? (
        <p className="px-2.5 py-2 text-[12.5px] text-ink-500">
          {typed
            ? 'Nothing like that in the backlog. Enter writes it as new.'
            : 'Nothing waiting in the backlog.'}
        </p>
      ) : (
        rows.map((t, i) => (
          <button
            key={t._id}
            id={`backlog-option-${i}`}
            type="button"
            role="option"
            aria-selected={i === active}
            tabIndex={-1}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(t._id)}
            className={`flex h-9 shrink-0 items-center gap-3 rounded-[8px] px-2.5 text-left transition-colors ${
              i === active ? 'bg-lift/[0.07]' : ''
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
              {t.title}
            </span>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-700">
              {agoLabel(t._creationTime)}
            </span>
            {/* Unfiled says nothing about the task, so it gets no chip. */}
            {t.area ? <AreaBadge area={t.area} /> : null}
          </button>
        ))
      )}
      {refusal ? (
        <p className="px-2.5 pt-2 text-[12.5px] text-ink-400">{refusal}</p>
      ) : null}
    </div>
  )
}

/* A finished one: the tick filled, the title quiet, but still yours to
   change — un-tick it, refile it, or drop it from the day. Not struck
   through: it was done, not cancelled. Its controls sit where an open
   row's do, so ticking moves nothing sideways. */
function DoneRow({ task }: { task: Doc<'tasks'> }) {
  const reopen = useMutation(api.tasks.reopen)
  const drop = useMutation(api.tasks.dropFromToday)
  const setArea = useMutation(api.tasks.setArea)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button
        type="button"
        aria-label={`Un-tick ${task.title}`}
        aria-pressed
        onClick={() => void reopen({ taskId: task._id })}
        className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-primary bg-primary text-primary-foreground transition-opacity hover:opacity-80"
      >
        <Check className="size-3" strokeWidth={3} />
      </button>
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-500">
        {task.title}
      </span>
      <div className={REVEAL}>
        <span aria-hidden className="invisible font-mono text-[11px]">
          {scheduleLabel(task)}
        </span>
        <AreaBadge
          area={task.area}
          onChange={(area: Area) => void setArea({ taskId: task._id, area })}
        />
        <button
          type="button"
          aria-label={`Drop ${task.title}`}
          onClick={() => void drop({ taskId: task._id })}
          className="text-ink-700 transition-colors hover:text-ink-400"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/* One of the three, numbered, on a hairline like the TODAY card's rows. The
   number is the only colour at rest: a task's area, faded once it is done,
   and nothing where the slot is still empty. */
function Slot({
  number,
  area,
  done,
  children,
}: {
  number: number
  area?: Doc<'tasks'>['area']
  done?: boolean
  children?: React.ReactNode
}) {
  const tone = done
    ? 'text-ink-700'
    : area
      ? 'text-(--area)'
      : children
        ? 'text-ink-500'
        : 'text-ink-800'

  return (
    <div
      style={area ? areaVars(area) : undefined}
      className="group flex h-12 items-center gap-3 border-b border-lift/[0.05] last:border-b-0"
    >
      <span
        className={`w-4 shrink-0 font-mono text-[10px] tracking-[0.1em] ${tone}`}
      >
        {String(number + 1).padStart(2, '0')}
      </span>
      {children}
    </div>
  )
}

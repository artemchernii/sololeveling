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
import { QuestRow } from './QuestRow'
import type { PendingEvidence } from './QuestRow'

const TODAY_LIMIT = 3

/** The open slot's field, for anything handing you the day's first move. */
export const PICK_FIELD_ID = 'pick-todays-three'

/* PLAN.md §3 item 2 and §3c.1: three, hard. Three slots are drawn whether or
   not they are filled, numbered 01–03 — the day has that shape before you
   choose anything, and an empty slot is the invitation. The first empty one
   is the field you type into; the rest wait behind it.

   The card is a fixed shape: a header and three 44px slots, and nothing
   ever appears under them (16 Sep, measured). A match list, a follow-up or
   a "today is full" line below the slots grew the card by 20–65px, and
   every card under it jumped with each keystroke and each tick. So the
   picker is an overlay, the follow-up lives inside its own slot, and being
   full is said by the third slot being filled.

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

  /* The picker: open by the button, or by typing. It is closed by a pick,
     Escape, or a click anywhere else. */
  const [picking, setPicking] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const slotsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!picking) return
    function away(e: MouseEvent) {
      if (!slotsRef.current?.contains(e.target as Node)) {
        setPicking(false)
        setRefusal(null)
      }
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [picking])

  function close() {
    setPicking(false)
    setRefusal(null)
  }

  async function pickExisting(taskId: Doc<'tasks'>['_id']) {
    try {
      await pickForToday({ taskId, today })
      setTitle('')
      close()
    } catch {
      setRefusal('Today is full. Finish one or drop one.')
    }
  }

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    await adding.run(async () => {
      const id = await createTask({ title: trimmed })
      /* Created here means "I intend to do it today" — so it takes a slot
         immediately. Created anywhere else, it waits in the backlog. */
      await pickForToday({ taskId: id, today })
    })
    setTitle('')
    close()
  }

  return (
    <div className="glass flex min-h-[216px] flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today&rsquo;s three</div>
        <div className="label-caps">
          {tasks === undefined
            ? ''
            : done === 0
              ? `${picked.length} of ${TODAY_LIMIT}`
              : done === picked.length
                ? `${done} done`
                : `${done} done · ${picked.length - done} open`}
        </div>
      </div>

      {tasks === undefined ? (
        <SkeletonRows rows={2} />
      ) : (
        <div
          ref={slotsRef}
          className={`relative flex flex-col gap-1.5 ${arrived}`}
        >
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
                  filled
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
                <Slot key={`open-${slot}`} number={slot} open>
                  {/* The same 18px box the tick occupies in a filled slot,
                      so the glyph and the text line up down the card — a
                      bare "+" character sat on its own baseline, low. */}
                  <span className="grid size-[18px] shrink-0 place-items-center">
                    <SaveGlyph
                      status={adding.status}
                      onSettled={adding.settle}
                      idle={<Plus className="size-3.5" />}
                      className="text-ink-600"
                    />
                  </span>
                  <input
                    id={PICK_FIELD_ID}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      if (e.target.value.trim().length > 0) setPicking(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void add()
                      if (e.key === 'Escape') close()
                    }}
                    placeholder={
                      slot === 0
                        ? 'What are you actually doing today?'
                        : 'And then?'
                    }
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
                  />
                  <button
                    type="button"
                    aria-expanded={picking}
                    onClick={() => (picking ? close() : setPicking(true))}
                    className="label-caps flex shrink-0 items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-ink-500 transition-colors hover:text-lav-300"
                  >
                    <ListChecks className="size-3.5" />
                    <span className="hidden sm:inline">Backlog</span>
                  </button>
                </Slot>
              )
            }

            return (
              <Slot key={`empty-${slot}`} number={slot}>
                <span className="text-[13px] text-ink-800">&mdash;</span>
              </Slot>
            )
          })}

          {picking && openSlot < TODAY_LIMIT ? (
            <Picker query={title} refusal={refusal} onPick={pickExisting} />
          ) : null}
        </div>
      )}
    </div>
  )
}

/* The backlog, to pick from — over the page, not in it, so nothing moves.
   The backlog is read only while this is open (§3c.3: never on the morning
   screen by default, and its count nowhere). What is typed in the slot
   narrows it. */
function Picker({
  query,
  refusal,
  onPick,
}: {
  query: string
  refusal: string | null
  onPick: (taskId: Doc<'tasks'>['_id']) => void
}) {
  const backlog = useQuery(api.tasks.listBacklog, {})
  const typed = query.trim().toLowerCase()
  const rows = (backlog ?? []).filter(
    (t) => typed.length === 0 || t.title.toLowerCase().includes(typed),
  )

  return (
    <div
      role="listbox"
      aria-label="Pick from the backlog"
      className="glass absolute inset-x-0 top-full z-20 mt-2 flex max-h-[280px] flex-col overflow-y-auto rounded-[14px] border border-lift/10 p-2 shadow-lg"
    >
      {backlog === undefined ? (
        <SkeletonRows rows={3} />
      ) : rows.length === 0 ? (
        <p className="px-2 py-2 text-[12.5px] text-ink-500">
          {typed.length === 0
            ? 'Nothing waiting in the backlog.'
            : 'Nothing like that in the backlog. Enter writes it as new.'}
        </p>
      ) : (
        rows.map((t) => (
          <button
            key={t._id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onPick(t._id)}
            className="flex items-center gap-3 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-lift/[0.05]"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
              {t.title}
            </span>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-700">
              {agoLabel(t._creationTime)}
            </span>
            <AreaBadge area={t.area} />
          </button>
        ))
      )}
      {refusal ? (
        <p className="px-2 pt-2 text-[12.5px] text-ink-400">{refusal}</p>
      ) : null}
    </div>
  )
}

/* A finished one: the tick filled, the title quiet, but still yours to
   change — un-tick it, refile it, or drop it from the day. Not struck
   through: it was done, not cancelled. */
function DoneRow({ task }: { task: Doc<'tasks'> }) {
  const reopen = useMutation(api.tasks.reopen)
  const drop = useMutation(api.tasks.dropFromToday)
  const setArea = useMutation(api.tasks.setArea)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5">
      <button
        type="button"
        aria-label={`Un-tick ${task.title}`}
        aria-pressed
        onClick={() => void reopen({ taskId: task._id })}
        className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-lift/10 bg-lift/10 text-ink-400 transition-colors hover:border-lav-500 hover:text-lav-300"
      >
        <Check className="size-3" />
      </button>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-500">
        {task.title}
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
  )
}

/* One of the three, numbered. A filled slot wears its task's area colour on
   the number and the edge; a done one keeps its place but fades; the open
   one lights lavender because it is the live thing on this card; the rest
   are outlines waiting to be filled. */
function Slot({
  number,
  area,
  filled,
  done,
  open,
  children,
}: {
  number: number
  area?: Doc<'tasks'>['area']
  filled?: boolean
  done?: boolean
  open?: boolean
  children: React.ReactNode
}) {
  const tone = filled
    ? done
      ? 'border-lift/[0.06] bg-lift/[0.015]'
      : area
        ? 'border-(--area)/25 bg-(--area)/[0.04]'
        : 'border-lift/10 bg-lift/[0.03]'
    : open
      ? 'border-lav-500/40 bg-lav-900/15 focus-within:border-lav-500/70'
      : 'border-dashed border-lift/[0.08]'

  return (
    <div
      style={area ? areaVars(area) : undefined}
      className={`flex h-[44px] items-center gap-2.5 rounded-[12px] border px-3 transition-colors duration-(--motion-fast) ${tone}`}
    >
      <span
        className={`font-mono text-[10px] tracking-[0.1em] ${
          filled
            ? done
              ? 'text-ink-700'
              : area
                ? 'text-(--area)'
                : 'text-ink-500'
            : 'text-ink-800'
        }`}
      >
        {String(number + 1).padStart(2, '0')}
      </span>
      {children}
    </div>
  )
}

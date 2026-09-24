import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Dumbbell,
  Footprints,
  Mountain,
  PersonStanding,
  Plus,
  Swords,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AddDrill } from '@/components/track/AddDrill'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { WeekDots } from '@/components/track/WeekDots'
import { dayStartsBack } from '@/lib/day-strip'
import { groupDrills } from '@/lib/drills'

/* Routines (25 Sep): "GYM > things to do, list of exercise and buttons
   where we simply click to log DID". One card per routine — Stretch, Gym —
   with its exercises, a week of dots and a DID beside each.

   A DID writes one `exercise` log (drills.did). The session the Today tile
   counts as a workout is the card's own button, SESSION: six stretches are
   one stretch session, and pressing each of them is not the same claim as
   saying the session happened. Nothing is seeded — the first card is made
   here, with the words he types. */

const SUGGESTED = ['stretch', 'gym', 'boxing', 'hiking', 'run']

const ICONS: Record<string, ReactNode> = {
  gym: <Dumbbell className="size-4" />,
  stretch: <PersonStanding className="size-4" />,
  boxing: <Swords className="size-4" />,
  hiking: <Mountain className="size-4" />,
  run: <Footprints className="size-4" />,
}

export function Routines({ delay = 0 }: { delay?: number }) {
  const drills = useQuery(api.drills.list, { area: 'body' })
  /* Seven days for the dots and today's DID count; fixed per day, so the
     query's arguments do not change between renders. */
  const dayStarts = dayStartsBack(1)
  const days = useQuery(api.aggregate.drillDays, {
    area: 'body',
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
  })
  /* A routine exists once it has an exercise; until then it is a card
     waiting for its first one, held here. */
  const [drafts, setDrafts] = useState<Array<string>>([])

  if (drills === undefined) return null

  const groups = groupDrills(drills)
  for (const draft of drafts) {
    if (!groups.some((g) => g.group === draft)) {
      groups.push({ group: draft, drills: [] })
    }
  }
  const byDrill = new Map(days?.rows.map((r) => [r.drillId, r.days]) ?? [])

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <TrackPanel area="body" title="routines" delay={delay}>
          <p className="text-[13px] text-ink-400">
            Make a list of what you actually do — the stretches for your back,
            the gym plan — and each one gets a{' '}
            <span className="font-mono text-ink-200">DID</span> button. One tap
            logs it.
          </p>
          <NewRoutine
            existing={[]}
            onPick={(g) => setDrafts((d) => [...d, g])}
          />
        </TrackPanel>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((g, i) => (
              <RoutineCard
                key={g.group}
                group={g.group}
                drills={g.drills}
                byDrill={byDrill}
                dayStarts={dayStarts}
                delay={delay + i * 60}
                onEmptyClose={() =>
                  setDrafts((d) => d.filter((x) => x !== g.group))
                }
              />
            ))}
          </div>
          <NewRoutine
            existing={groups.map((g) => g.group)}
            onPick={(g) => setDrafts((d) => [...d, g])}
          />
        </>
      )}
    </div>
  )
}

function RoutineCard({
  group,
  drills,
  byDrill,
  dayStarts,
  delay,
  onEmptyClose,
}: {
  group: string
  drills: Array<Doc<'drills'>>
  byDrill: Map<Id<'drills'>, Array<number>>
  dayStarts: Array<number>
  delay: number
  onEmptyClose: () => void
}) {
  const create = useMutation(api.logs.create)
  const retire = useMutation(api.drills.retire)
  const restore = useMutation(api.drills.restore)
  const [gone, setGone] = useState<Doc<'drills'> | null>(null)
  const today = dayStarts[dayStarts.length - 1]
  const sessions = useQuery(api.aggregate.kindCount, {
    kind: 'workout',
    area: 'body',
    category: group,
    start: today,
    end: today + 86_400_000,
  })

  return (
    <TrackPanel
      area="body"
      delay={delay}
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-(--area)/15 text-(--area)">
            {ICONS[group] ?? <Dumbbell className="size-4" />}
          </span>
          <span className="text-[12px]">{group}</span>
        </span>
      }
      aside={
        <DidButton
          today={sessions}
          label="session"
          onDid={() =>
            create({
              kind: 'workout',
              area: 'body',
              occurredAt: Date.now(),
              category: group,
              text: `${group} session`,
            })
          }
        />
      }
    >
      {drills.length > 0 ? (
        <ul className="flex flex-col">
          {drills.map((drill, i) => (
            <DrillRow
              key={drill._id}
              drill={drill}
              days={byDrill.get(drill._id) ?? dayStarts.map(() => 0)}
              dayStarts={dayStarts}
              delay={delay + 80 + i * 40}
              onRetire={() => {
                setGone(drill)
                void retire({ drillId: drill._id })
              }}
            />
          ))}
        </ul>
      ) : null}
      {gone !== null ? (
        <p className="motion-arrive flex items-center gap-2 font-mono text-[10.5px] text-ink-500">
          {gone.title} is off the list
          <button
            type="button"
            onClick={() => {
              void restore({ drillId: gone._id })
              setGone(null)
            }}
            className="text-ink-300 underline decoration-lift/30 underline-offset-2 hover:text-foreground"
          >
            undo
          </button>
        </p>
      ) : null}
      <AddDrill
        group={group}
        autoFocus={drills.length === 0}
        onCancelEmpty={drills.length === 0 ? onEmptyClose : undefined}
      />
    </TrackPanel>
  )
}

function DrillRow({
  drill,
  days,
  dayStarts,
  delay,
  onRetire,
}: {
  drill: Doc<'drills'>
  days: Array<number>
  dayStarts: Array<number>
  delay: number
  onRetire: () => void
}) {
  const did = useMutation(api.drills.did)
  const today = days[days.length - 1] ?? 0

  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className="motion-arrive group flex min-h-11 items-center gap-3 border-b border-lift/[0.06] py-1.5 last:border-b-0"
    >
      <span
        className={`min-w-0 flex-1 truncate text-[14px] transition-colors ${
          today > 0 ? 'text-foreground' : 'text-ink-300'
        }`}
      >
        {drill.title}
      </span>
      <button
        type="button"
        aria-label={`Take ${drill.title} off the list`}
        onClick={onRetire}
        className="motion-press grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100"
      >
        <X className="size-3" />
      </button>
      <WeekDots days={days} dayStarts={dayStarts} noun="time" />
      <DidButton
        today={today}
        label="did"
        onDid={() => did({ drillId: drill._id })}
      />
    </li>
  )
}

function NewRoutine({
  existing,
  onPick,
}: {
  existing: Array<string>
  onPick: (group: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const offer = SUGGESTED.filter((s) => !existing.includes(s))

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass motion-press inline-flex items-center gap-2 self-start rounded-full py-2 pr-4 pl-2 text-[13px] text-ink-300 transition-colors hover:text-foreground"
      >
        <span className="grid size-6 place-items-center rounded-full bg-lift/10">
          <Plus className="size-3.5" />
        </span>
        New routine
      </button>
    )
  }

  function pick(raw: string) {
    const group = raw.trim().toLowerCase()
    if (group.length === 0 || existing.includes(group)) return
    onPick(group)
    setText('')
    setOpen(false)
  }

  return (
    <div className="motion-arrive flex flex-wrap items-center gap-2">
      {offer.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => pick(s)}
          className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-ink-300 uppercase ring-1 ring-lift/15 transition-colors hover:bg-lift/10 hover:text-foreground"
        >
          {ICONS[s]}
          {s}
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          pick(text)
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="or name one"
          aria-label="Name a routine"
          className="w-36 rounded-full border border-lift/15 bg-sink/20 px-3 py-1.5 text-[12.5px] text-foreground outline-none placeholder:text-ink-600 focus:border-lift/40"
        />
      </form>
    </div>
  )
}

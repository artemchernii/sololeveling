import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Area } from '@/lib/capture-parser'

/* PLAN.md §3 item 3. Six cells, each labelled with its source. Every number
   here comes from currentState(), monthCounts() or entityCounts(); this
   component reads them and renders them, and computes none of them.

   Each cell has up to two editable slots, because §3's strip contains two
   kinds of number: the state itself ("B1", "75.4 kg") and, on two cells, the
   target it is counted against ("2 of 4 sessions", "6 of 8 skills"). A target
   is a stateSnapshots row like any other — source 2 twice, not a fourth
   source — so it is recorded the same way, by clicking it.

   Nothing is seeded, so these editors are the only way any of this is ever
   filled. A cell with nothing recorded shows an em dash, never a zero: zero is
   a claim, and absence is not. */

type Slot = {
  key: string
  area: Area
  kind: 'number' | 'text'
  unit?: string
  placeholder: string
}

type Cell = {
  label: string
  source: string
  /** The big value. */
  lead: { text?: string; slot?: Slot }
  /** The quieter half — a count, or a count against a target. */
  trail?: { text?: string; slot?: Slot }
}

export function StateStrip({ today }: { today: number }) {
  const state = useQuery(api.aggregate.currentState, {})
  const counts = useQuery(api.aggregate.monthCounts, monthRange(today))
  const entities = useQuery(api.aggregate.entityCounts, {})

  const cells: Array<Cell> = [
    {
      label: 'Portuguese',
      source: 'state · log count',
      lead: {
        text: state?.cefr_level?.textValue,
        slot: {
          key: 'cefr_level',
          area: 'portuguese',
          kind: 'text',
          placeholder: 'B1',
        },
      },
      trail: {
        text: ofTarget(
          counts?.portuguese.now,
          state?.sessions_target?.value,
          'sessions',
        ),
        slot: {
          key: 'sessions_target',
          area: 'portuguese',
          kind: 'number',
          placeholder: 'sessions a month',
        },
      },
    },
    {
      label: 'Body',
      source: 'state · log count',
      lead: {
        text: unit(state?.weight?.value, 'kg'),
        slot: {
          key: 'weight',
          area: 'body',
          kind: 'number',
          unit: 'kg',
          placeholder: '75.4',
        },
      },
      trail: { text: plural(counts?.body.now, 'workout') },
    },
    {
      label: 'Money',
      source: 'state',
      lead: {
        text: money(state?.net_worth?.value),
        slot: {
          key: 'net_worth',
          area: 'money',
          kind: 'number',
          unit: '€',
          placeholder: '42100',
        },
      },
    },
    {
      label: 'Social',
      source: 'log count',
      lead: { text: plural(counts?.social.now, 'event') },
      trail: { text: 'this month' },
    },
    {
      label: 'Business',
      source: 'entity count',
      lead: { text: plural(entities?.activeProjects, 'chain') },
      trail: {
        text:
          entities === undefined
            ? undefined
            : entities.focusProjects > 0
              ? `${entities.focusProjects} in focus`
              : 'none in focus',
      },
    },
    {
      label: 'Career',
      source: 'state / state',
      lead: {
        text:
          state?.skills_logged?.value === undefined
            ? undefined
            : String(state.skills_logged.value),
        slot: {
          key: 'skills_logged',
          area: 'career',
          kind: 'number',
          placeholder: '6',
        },
      },
      trail: {
        text: target(state?.skills_target?.value, 'skills logged'),
        slot: {
          key: 'skills_target',
          area: 'career',
          kind: 'number',
          placeholder: 'skills to log',
        },
      },
    },
  ]

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="label-caps mb-4">Current state</div>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {cells.map((cell) => (
          <StateCell key={cell.label} cell={cell} />
        ))}
      </div>
    </div>
  )
}

function StateCell({ cell }: { cell: Cell }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="label-caps">{cell.label}</span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-ink-800 uppercase">
          {cell.source}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <Editable
          slot={cell.lead.slot}
          className="text-[19px] font-light text-foreground"
        >
          {cell.lead.text ?? '—'}
        </Editable>

        {cell.trail ? (
          <Editable slot={cell.trail.slot} className="text-[12px] text-ink-500">
            {cell.trail.text ?? '—'}
          </Editable>
        ) : null}
      </div>
    </div>
  )
}

/* A slot with no key is just text — Social and Business are pure counts and
   there is nothing to type into them. */
function Editable({
  slot,
  className,
  children,
}: {
  slot?: Slot
  className: string
  children: React.ReactNode
}) {
  const record = useMutation(api.state.record)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!slot) {
    return <span className={className}>{children}</span>
  }

  async function save() {
    if (!slot) return
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setEditing(false)
      return
    }

    const isText = slot.kind === 'text'
    const value = Number(trimmed.replace(',', '.'))
    if (!isText && !Number.isFinite(value)) {
      setEditing(false)
      return
    }

    await record({
      area: slot.area,
      key: slot.key,
      value: isText ? undefined : value,
      textValue: isText ? trimmed : undefined,
      unit: slot.unit,
      recordedAt: Date.now(),
    })
    setDraft('')
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder={slot.placeholder}
        aria-label={`Record ${slot.key.replace(/_/g, ' ')}`}
        className="w-28 rounded-[6px] border border-lav-500/50 bg-black/20 px-2 py-0.5 font-mono text-[13px] text-foreground outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={`Record ${slot.key.replace(/_/g, ' ')}`}
      className={`-mx-1 rounded-[5px] px-1 transition-colors hover:bg-white/10 ${className}`}
    >
      {children}
    </button>
  )
}

function unit(value: number | undefined, suffix: string) {
  return value === undefined ? undefined : `${value} ${suffix}`
}

function money(value: number | undefined) {
  return value === undefined ? undefined : `€${value.toLocaleString()}`
}

function plural(count: number | undefined, noun: string) {
  return count === undefined
    ? undefined
    : `${count} ${noun}${count === 1 ? '' : 's'}`
}

/* "2 of 4 sessions", but only once a target exists. Without one there is no
   denominator, so it renders the bare count (§1). */
function ofTarget(
  count: number | undefined,
  targetValue: number | undefined,
  noun: string,
) {
  if (count === undefined) return undefined
  return targetValue === undefined
    ? `${count} ${noun}`
    : `${count} of ${targetValue} ${noun}`
}

/** The trailing half of "6 of 8 skills logged" — clickable to set the 8. */
function target(targetValue: number | undefined, noun: string) {
  return targetValue === undefined
    ? `${noun} — set a target`
    : `of ${targetValue} ${noun}`
}

/** Local month boundaries, computed here because the server cannot know them. */
export function monthRange(now: number) {
  const d = new Date(now)
  return {
    prevStart: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
    monthStart: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    nextStart: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  }
}

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Area } from '@/lib/capture-parser'
import { whenLabel } from '@/lib/format'

/* PLAN.md §3 item 3. Four cells, each labelled with its source — Business and
   Career went on 15 Sep: projects were already counted on Projects, and
   Career had nothing to count. Every number here comes from currentState(),
   monthCounts(), tileTargets() or (since Task 7) languageLevels(); areas.list()
   supplies only the language's slug and label, never a number. This component
   reads these and renders them, and computes none of them.

   The big value is state ("B1", "75.4 kg") and is recorded by clicking it.
   Since Task 7 the Languages cell names which language its level belongs to
   — "B1 · Portuguese · today 14:05" — because currentState()'s bare
   `cefr_level` key stopped being able to say once a second language could
   exist (Task 3's migration to `cefr_level:<slug>`). It reads
   `languageLevels()` across every area ticked as a language and shows
   whichever was recorded most recently, the same latest-row-wins rule
   `currentState()` already applies to one key. Languages' quieter half is
   "2 of 4 sessions": the month's count against the target set on the
   Languages month tile — a goal's targetValue, the same number the tile
   reads (R2). It is set there, not here, so there is one place to change it.

   Nothing is seeded, so these editors are the only way any of this is ever
   filled. A cell with nothing recorded shows an em dash, never a zero: zero is
   a claim, and absence is not. */

type Slot = {
  key: string
  area: Area
  kind: 'number' | 'text'
  unit?: string
  placeholder: string
  /** Read aloud in the editor's aria-label/title in place of the key. Needed
      since Task 7: `cefr_level:portuguese`'s colon and slug are not words a
      person should have read back to them, so a slot whose key carries one
      says how to announce itself instead of leaving the label to guess. */
  announce?: string
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
  const targets = useQuery(api.aggregate.tileTargets, {})
  const areas = useQuery(api.areas.list, {})

  /* The areas ticked as a language, in `areas.order` — the same set and the
     same order LanguageTabs draws its tabs from. `api.areas.list({})`
     already excludes retired areas, so there is no `includeRetired` to pass
     wrong here. */
  const languages = areas?.filter((a) => a.track === 'language') ?? []
  const levels = useQuery(
    api.aggregate.languageLevels,
    areas === undefined ? 'skip' : { slugs: languages.map((a) => a.slug) },
  )

  /* Latest row wins across every language ticked, exactly as it already does
     across every log under one key — this just widens the set of keys it
     wins across. `languageLevels` is itself sourced from `stateSnapshots`
     (aggregate.ts); picking the greatest `recordedAt` among the rows it
     already returned is a selection over a source, not a fifth one. */
  let latestLanguage:
    | { slug: string; label: string; textValue: string; recordedAt: number }
    | undefined
  for (const entry of levels ?? []) {
    if (entry.textValue === null || entry.recordedAt === null) continue
    if (
      latestLanguage !== undefined &&
      entry.recordedAt <= latestLanguage.recordedAt
    ) {
      continue
    }
    const area = languages.find((a) => a.slug === entry.slug)
    if (area === undefined) continue
    latestLanguage = {
      slug: entry.slug,
      label: area.label,
      textValue: entry.textValue,
      recordedAt: entry.recordedAt,
    }
  }

  /* Where the editor writes when nothing is recorded yet: the first language
     ticked, so there is always somewhere to type a first level as long as
     one language exists. With none ticked there is nothing to record a level
     for, and the cell shows an em dash with no editor at all. */
  const editorArea = latestLanguage ?? languages.at(0)

  const cells: Array<Cell> = [
    {
      label: 'Languages',
      source: 'state · log count',
      lead: {
        text:
          latestLanguage === undefined
            ? undefined
            : `${latestLanguage.textValue} · ${latestLanguage.label} · ${whenLabel(latestLanguage.recordedAt)}`,
        slot:
          editorArea === undefined
            ? undefined
            : {
                /* The key carries the language's slug (Task 3's migration),
                   so the editor writes where `languageLevels` looks for that
                   language, not a bare `cefr_level` nothing reads any more. */
                key: `cefr_level:${editorArea.slug}`,
                area: editorArea.slug,
                kind: 'text',
                placeholder: 'B1',
                announce: `${editorArea.label} level`,
              },
      },
      trail: {
        text: ofTarget(
          counts?.portuguese.now,
          /* The number only. The words a tile may carry belong on the tile,
             not in a one-line "2 of 4 sessions". Unchanged since R6b-b: the
             month tile still counts Portuguese sessions only (PLAN.md §3),
             so this reads the same `portuguese` bucket regardless of which
             language the lead half is naming. */
          targets?.portuguese?.value,
          'sessions',
        ),
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
      label: 'Finances',
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
  ]

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="label-caps mb-4">Current state</div>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
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

/* A slot with no key is just text — Social is a pure count and
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
        aria-label={`Record ${slot.announce ?? slot.key.replace(/_/g, ' ')}`}
        className="w-28 rounded-[6px] border border-lav-500/50 bg-sink/20 px-2 py-0.5 font-mono text-[13px] text-foreground outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={`Record ${slot.announce ?? slot.key.replace(/_/g, ' ')}`}
      className={`-mx-1 rounded-[5px] px-1 transition-colors hover:bg-lift/10 ${className}`}
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

/** Local month boundaries, computed here because the server cannot know them. */
export function monthRange(now: number) {
  const d = new Date(now)
  return {
    prevStart: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
    monthStart: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    nextStart: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  }
}

import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  Check,
  ChevronDown,
  Clock,
  Info,
  Library,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { KindIcon, kindName } from '@/components/body/kinds'
import type { BodyProgress, DrillRow } from '@/components/body/useBodyProgress'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { WeekDots } from '@/components/track/WeekDots'
import { PROGRAMS, programById, SAFETY } from '@/lib/body/library'
import type { Exercise, Program } from '@/lib/body/library'
import { areaVars } from '@/lib/areas'
import { agoLabel } from '@/lib/format'

/* The routines (rebuilt 25 Sep): "where are some programs, a knowledge
   base and proper logging?" The app brings the content — a library of
   programs, each exercise with how to do it — and he picks. Picking makes
   his drills (drills.addProgram); DID on an exercise writes an `exercise`
   log against it (drills.did). Nothing is seeded. */

const todayOf = (row: DrillRow) => row.days[row.days.length - 1] ?? 0

/* ------------------------------------------------------------ TODAY */

/* His routines, the one to do today first (25 Sep, second pass: "hard to
   read and navigate"). NEXT UP is no longer its own card repeating the
   routine below it — the suggested routine opens at the top with the reason
   on it, and the others wait folded, one line each, until pressed. */
export function MyRoutines({
  progress,
  delay = 0,
}: {
  progress: BodyProgress
  delay?: number
}) {
  const add = useMutation(api.drills.addProgram)
  const [openDays, setOpenDays] = useState<Array<string>>([])
  if (!progress.ready) return null
  const { pick } = progress
  const days = PROGRAMS.flatMap((program) =>
    program.days
      .filter((d) => progress.pickedDays.has(d.id))
      .map((day) => ({ program, day })),
  ).sort(
    (x, y) =>
      Number(y.day.id === pick?.day.id) - Number(x.day.id === pick?.day.id),
  )
  const starter = programById('back') as Program
  const toggle = (id: string) =>
    setOpenDays((o) =>
      o.includes(id) ? o.filter((x) => x !== id) : [...o, id],
    )

  return (
    <div className="flex flex-col gap-3">
      {days.length === 0 ? (
        <TrackPanel
          area="body"
          delay={delay}
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              start here
            </span>
          }
        >
          <div className="flex flex-col gap-3">
            <span className="text-[24px] leading-tight font-light text-foreground">
              {starter.name}
            </span>
            <p className="text-[13.5px] leading-relaxed text-ink-300">
              {starter.rhythm} — nine gentle exercises for the lower back. Add
              it and each exercise gets a DID button and how to do it. More
              programs are in the library below.
            </p>
            <button
              type="button"
              onClick={() => void add({ programId: starter.id })}
              className="motion-press inline-flex items-center gap-2 self-start rounded-full bg-(--area) px-4 py-2 text-[13px] font-medium text-background"
            >
              <Plus className="size-4" />
              Add to my routines
            </button>
          </div>
        </TrackPanel>
      ) : pick === null ? (
        <p className="motion-arrive flex items-center gap-2 rounded-[16px] bg-state-good/10 px-4 py-3 text-[14px] text-state-good ring-1 ring-state-good/30 ring-inset">
          <Check className="size-4" />
          Everything in your routines is done for today. Rest well.
        </p>
      ) : null}
      {days.map(({ program, day }, i) => {
        const suggested = pick?.day.id === day.id
        return (
          <RoutineCard
            key={day.id}
            program={program}
            title={day.name}
            reason={suggested ? pick.reason : null}
            open={suggested || openDays.includes(day.id)}
            onToggle={suggested ? undefined : () => toggle(day.id)}
            delay={delay + i * 60}
            rows={day.exercises.map((ex) => ({
              ex,
              row: progress.rows.find(
                (r) => r.hit?.day.id === day.id && r.hit.exercise.id === ex.id,
              ),
            }))}
            dayStarts={progress.dayStarts}
          />
        )
      })}
      {progress.own.length > 0 ? (
        <OwnList
          rows={progress.own}
          dayStarts={progress.dayStarts}
          delay={delay + days.length * 60}
        />
      ) : null}
    </div>
  )
}

function RoutineCard({
  program,
  title,
  reason,
  open,
  onToggle,
  rows,
  dayStarts,
  delay,
}: {
  program: Program
  title: string
  /** Set on the routine NEXT UP picked. */
  reason: string | null
  open: boolean
  /** Absent on the suggested one, which stays open. */
  onToggle: (() => void) | undefined
  rows: Array<{ ex: Exercise; row: DrillRow | undefined }>
  dayStarts: Array<number>
  delay: number
}) {
  const drop = useMutation(api.drills.dropProgram)
  const [openEx, setOpenEx] = useState<string | null>(null)
  const allDone = rows.every((r) => r.row && todayOf(r.row) > 0)

  return (
    <section
      style={{ ...areaVars('body'), animationDelay: `${delay}ms` }}
      className={`glass motion-arrive relative flex flex-col overflow-hidden rounded-[22px] ${
        reason !== null ? 'ring-1 ring-(--area)/50' : ''
      }`}
    >
      {reason !== null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-(--area) via-(--area)/40 to-transparent"
        />
      ) : null}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 sm:px-6">
        <button
          type="button"
          onClick={onToggle}
          disabled={onToggle === undefined}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <span
            className={`grid shrink-0 place-items-center rounded-full bg-(--area)/15 text-(--area) ${
              reason !== null ? 'size-11' : 'size-9'
            }`}
          >
            <KindIcon
              kind={program.kind}
              className={reason !== null ? 'size-5' : 'size-4'}
            />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            {reason !== null ? (
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-(--area) uppercase">
                <Sparkles className="size-3" />
                next up
              </span>
            ) : null}
            <span
              className={`truncate font-light text-foreground ${
                reason !== null ? 'text-[24px] leading-tight' : 'text-[17px]'
              }`}
            >
              {title}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-500">
              <Clock className="size-3" />
              {program.rhythm} · {rows.length} exercises
            </span>
          </span>
        </button>
        {allDone ? (
          <span className="motion-pop inline-flex shrink-0 items-center gap-1 rounded-full bg-state-good/15 px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] text-state-good uppercase">
            <Check className="size-3" />
            done today
          </span>
        ) : null}
        {onToggle ? (
          <ChevronDown
            aria-hidden
            className={`size-4 shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        ) : null}
        <button
          type="button"
          onClick={() => void drop({ programId: program.id })}
          title={`Remove ${program.name} from my routines — history stays`}
          aria-label={`Remove ${program.name} from my routines`}
          className="motion-press grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-600 transition-colors hover:bg-state-danger/15 hover:text-state-danger"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {reason !== null ? (
        <p className="-mt-1 px-5 pb-2 text-[13px] text-ink-300 sm:px-6">
          {reason}
        </p>
      ) : null}
      {open ? (
        <div className="motion-arrive flex flex-col gap-3 px-5 pb-5 sm:px-6">
          <ul className="flex flex-col">
            {rows.map(({ ex, row }, i) => (
              <ExerciseRow
                key={ex.id}
                ex={ex}
                row={row}
                dayStarts={dayStarts}
                open={openEx === ex.id}
                onToggle={() => setOpenEx((o) => (o === ex.id ? null : ex.id))}
                delay={i * 30}
              />
            ))}
          </ul>
          {program.kind === 'stretch' ? <Safety compact /> : null}
        </div>
      ) : null}
    </section>
  )
}

function ExerciseRow({
  ex,
  row,
  dayStarts,
  open,
  onToggle,
  delay,
}: {
  ex: Exercise
  row: DrillRow | undefined
  dayStarts: Array<number>
  open: boolean
  onToggle: () => void
  delay: number
}) {
  const did = useMutation(api.drills.did)
  const today = row ? todayOf(row) : 0
  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className="motion-arrive border-b border-lift/[0.06] last:border-b-0"
    >
      <div className="flex min-h-12 items-center gap-3 py-1.5">
        <span
          aria-label={today > 0 ? 'done today' : 'not yet today'}
          className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors ${
            today > 0 ? 'bg-(--area) text-background' : 'ring-1 ring-lift/20'
          }`}
        >
          {today > 0 ? (
            <Check className="motion-draw size-3" strokeWidth={3} />
          ) : null}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex min-w-0 flex-col">
            <span
              className={`line-clamp-2 text-[14px] leading-snug transition-colors group-hover:text-foreground ${
                today > 0 ? 'text-foreground' : 'text-ink-200'
              }`}
            >
              {ex.name}
            </span>
            <span className="font-mono text-[11px] text-(--area)/80">
              {ex.dose}
            </span>
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-ink-600 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {row ? (
          <span className="hidden sm:inline-flex">
            <WeekDots days={row.days} dayStarts={dayStarts} noun="time" />
          </span>
        ) : null}
        {row ? (
          <DidButton
            today={today}
            label="did"
            onDid={() => did({ drillId: row.drill._id })}
          />
        ) : null}
      </div>
      {open ? (
        <div className="motion-arrive pb-3 pl-8">
          <HowTo ex={ex} lastAt={row?.lastAt ?? null} />
        </div>
      ) : null}
    </li>
  )
}

/* How to do it: what for, the steps, the mistake. Reference, from the
   library; the only thing of his here is when he last did it. */
function HowTo({ ex, lastAt }: { ex: Exercise; lastAt: number | null }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-start gap-1.5 text-[13px] text-ink-200">
        <Info className="mt-0.5 size-3.5 shrink-0 text-(--area)" />
        {ex.why}
      </p>
      <ol className="flex flex-col gap-1.5 border-l-2 border-(--area)/40 pl-3">
        {ex.steps.map((step, i) => (
          <li key={step} className="flex gap-2 text-[13.5px] text-ink-100">
            <span className="w-3 shrink-0 font-mono text-[11px] leading-[1.6] text-(--area)">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-1.5 text-[12.5px] text-state-warn">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        Avoid: {ex.avoid}
      </p>
      {lastAt !== null ? (
        <span className="font-mono text-[10.5px] text-ink-500">
          last done {agoLabel(lastAt)}
        </span>
      ) : null}
    </div>
  )
}

function Safety({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`flex items-start gap-1.5 text-ink-500 ${compact ? 'text-[11px]' : 'text-[12px]'}`}
    >
      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
      {SAFETY}
    </p>
  )
}

/* Exercises he typed himself before the library existed — one quiet list,
   each still one tap, each with a visible × to take it off. */
function OwnList({
  rows,
  dayStarts,
  delay,
}: {
  rows: Array<DrillRow>
  dayStarts: Array<number>
  delay: number
}) {
  const did = useMutation(api.drills.did)
  const retire = useMutation(api.drills.retire)
  return (
    <TrackPanel area="body" delay={delay} title="added by you">
      <ul className="-mt-1 flex flex-col">
        {rows.map((row) => (
          <li
            key={row.drill._id}
            className="flex min-h-11 items-center gap-3 border-b border-lift/[0.06] py-1.5 last:border-b-0"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--area)/15 text-(--area)">
              <KindIcon kind={row.drill.group} className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink-200">
              {row.drill.title}
              <span className="ml-2 font-mono text-[10px] tracking-[0.12em] text-ink-500 uppercase">
                {kindName(row.drill.group)}
              </span>
            </span>
            <WeekDots days={row.days} dayStarts={dayStarts} noun="time" />
            <DidButton
              today={todayOf(row)}
              label="did"
              onDid={() => did({ drillId: row.drill._id })}
            />
            <button
              type="button"
              aria-label={`Take ${row.drill.title} off the list`}
              title="Take it off the list — its history stays"
              onClick={() => void retire({ drillId: row.drill._id })}
              className="motion-press grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-600 transition-colors hover:bg-state-danger/15 hover:text-state-danger"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </TrackPanel>
  )
}

/* ------------------------------------------------------------ LIBRARY */

export function ProgramLibrary({
  progress,
  delay = 0,
}: {
  progress: BodyProgress
  delay?: number
}) {
  const [open, setOpen] = useState<string | null>(null)
  const shown = open ? programById(open) : undefined

  return (
    <TrackPanel
      area="body"
      delay={delay}
      title={
        <span className="flex items-center gap-1.5">
          <Library className="size-3.5" />
          library · programs to pick from
        </span>
      }
    >
      <p className="-mt-1 text-[13px] text-ink-400">
        Built-in routines, each exercise with how to do it. Add one and it joins
        your routines above with a DID button per exercise.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {PROGRAMS.map((program, i) => {
          const picked = progress.pickedPrograms.has(program.id)
          const count = program.days.reduce((n, d) => n + d.exercises.length, 0)
          return (
            <button
              key={program.id}
              type="button"
              onClick={() =>
                setOpen((o) => (o === program.id ? null : program.id))
              }
              aria-expanded={open === program.id}
              style={{ animationDelay: `${delay + i * 50}ms` }}
              className={`motion-arrive motion-press group relative flex flex-col gap-2 rounded-[18px] p-4 text-left ring-1 transition-colors ring-inset ${
                open === program.id
                  ? 'bg-(--area)/15 ring-(--area)/55'
                  : 'bg-lift/[0.03] ring-lift/10 hover:bg-(--area)/8 hover:ring-(--area)/35'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-(--area)/15 text-(--area)">
                  <KindIcon kind={program.kind} className="size-[18px]" />
                </span>
                {picked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-state-good/15 px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] text-state-good uppercase">
                    <Check className="size-3" />
                    in my routines
                  </span>
                ) : (
                  <span className="font-mono text-[10px] tracking-[0.12em] text-ink-500 uppercase">
                    {kindName(program.kind)}
                  </span>
                )}
              </span>
              <span className="text-[17px] leading-tight text-foreground">
                {program.name}
              </span>
              <span className="text-[12.5px] leading-snug text-ink-400">
                {program.tagline}
              </span>
              <span className="mt-auto font-mono text-[10.5px] text-ink-500">
                {program.rhythm} · {count} exercises
                {program.days.length > 1
                  ? ` · ${program.days.length} days`
                  : ''}
              </span>
            </button>
          )
        })}
      </div>
      {shown ? (
        <ProgramDetail
          key={shown.id}
          program={shown}
          picked={progress.pickedPrograms.has(shown.id)}
        />
      ) : null}
      <Safety />
    </TrackPanel>
  )
}

function ProgramDetail({
  program,
  picked,
}: {
  program: Program
  picked: boolean
}) {
  const add = useMutation(api.drills.addProgram)
  const drop = useMutation(api.drills.dropProgram)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="motion-arrive flex flex-col gap-4 rounded-[18px] bg-background/30 p-4 ring-1 ring-(--area)/25 ring-inset sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex flex-col gap-1">
          <span className="text-[22px] font-light text-foreground">
            {program.name}
          </span>
          <span className="font-mono text-[11px] text-ink-500">
            {program.rhythm}
          </span>
        </span>
        {picked ? (
          <button
            type="button"
            onClick={() => void drop({ programId: program.id })}
            className="motion-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] text-ink-400 ring-1 ring-lift/15 ring-inset hover:text-state-danger hover:ring-state-danger/40"
          >
            <X className="size-3.5" />
            Remove from my routines
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void add({ programId: program.id })}
            className="motion-press inline-flex items-center gap-2 rounded-full bg-(--area) px-4 py-2 text-[13px] font-medium text-background shadow-[0_0_24px_-6px_var(--area)]"
          >
            <Plus className="size-4" />
            Add to my routines
          </button>
        )}
      </div>
      <p className="text-[13.5px] leading-relaxed text-ink-300">
        {program.about}
      </p>
      {program.days.map((day) => (
        <div key={day.id} className="flex flex-col gap-1">
          {program.days.length > 1 ? (
            <span className="label-caps text-(--area)">{day.name}</span>
          ) : null}
          <ul className="flex flex-col">
            {day.exercises.map((ex) => {
              const key = `${day.id}-${ex.id}`
              return (
                <li
                  key={ex.id}
                  className="border-b border-lift/[0.06] last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setOpen((o) => (o === key ? null : key))}
                    aria-expanded={open === key}
                    className="group flex min-h-11 w-full items-center gap-3 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink-100 group-hover:text-foreground">
                      {ex.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-(--area)/80">
                      {ex.dose}
                    </span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-ink-600 transition-transform ${open === key ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open === key ? (
                    <div className="motion-arrive pb-3">
                      <HowTo ex={ex} lastAt={null} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

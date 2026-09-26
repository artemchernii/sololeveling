import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  Check,
  ChevronDown,
  ExternalLink,
  Flag,
  Info,
  TriangleAlert,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { KindIcon } from '@/components/body/kinds'
import { UndoOrError, useUndoWindow } from '@/components/track/DidButton'
import { Sparks } from '@/components/track/Sparks'
import { TrackPanel } from '@/components/track/TrackPanel'
import { areaVars } from '@/lib/areas'
import {
  howToLink,
  SAFETY,
  sessionText,
  SESSION_LABEL,
  WORKOUTS,
} from '@/lib/body/library'
import type { Exercise, Workout } from '@/lib/body/library'
import { readTicks, toggleTick, writeTicks } from '@/lib/body/ticks'
import type { Ticks } from '@/lib/body/ticks'
import { localToday } from '@/lib/today'

/* The workout guide (26 Sep, after "I'm not sure if I gonna log all this").
   Pick what you are doing today; its moves are a list to tap through while
   you train — the whole row ticks, the chevron opens how — and Finish logs
   the one session. The ticks help you keep your place and are not saved:
   the session is the record, one row, what the hero and Today count. */

const TICKS_KEY = 'sl-body-ticks'

function loadTicks(): Ticks {
  try {
    return readTicks(localStorage.getItem(TICKS_KEY), localToday())
  } catch {
    return {}
  }
}

function saveTicks(ticks: Ticks) {
  try {
    localStorage.setItem(TICKS_KEY, writeTicks(ticks, localToday()))
  } catch {
    /* Storage refused: the ticks last until the page closes. */
  }
}

export function WorkoutPanel({
  workout,
  onPick,
  delay = 0,
}: {
  workout: Workout
  onPick: (id: string) => void
  delay?: number
}) {
  const [ticks, setTicks] = useState(loadTicks)
  const [open, setOpen] = useState<string | null>(null)
  const done = ticks[workout.id] ?? []

  function tick(exerciseId: string) {
    const next = toggleTick(ticks, workout.id, exerciseId)
    setTicks(next)
    saveTicks(next)
  }

  function setDone(ids: ReadonlyArray<string>) {
    const next = { ...ticks, [workout.id]: ids }
    setTicks(next)
    saveTicks(next)
  }

  return (
    <TrackPanel area="body" delay={delay} title="workout">
      <div
        role="radiogroup"
        aria-label="Today's workout"
        className="-mt-1 flex flex-wrap gap-2"
      >
        {WORKOUTS.map((w) => {
          const on = w.id === workout.id
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                onPick(w.id)
                setOpen(null)
              }}
              className={`motion-press inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-[13px] ring-1 transition-colors ring-inset ${
                on
                  ? 'bg-lift/[0.06] text-foreground ring-(--area)/55'
                  : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lift/25'
              }`}
            >
              <KindIcon
                kind={w.kind}
                className={`size-3.5 ${on ? 'text-area' : ''}`}
              />
              {w.name}
            </button>
          )
        })}
      </div>

      <div key={workout.id} className="motion-arrive flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-ink-500">
            {workout.rhythm} · {workout.exercises.length} moves
          </span>
          <p className="text-[13.5px] leading-relaxed text-ink-300">
            {workout.about}
          </p>
        </div>

        <ul className="flex flex-col">
          {workout.exercises.map((ex, i) => (
            <MoveRow
              key={ex.id}
              ex={ex}
              ticked={done.includes(ex.id)}
              onTick={() => tick(ex.id)}
              open={open === ex.id}
              onOpen={() => setOpen((o) => (o === ex.id ? null : ex.id))}
              delay={i * 30}
            />
          ))}
        </ul>

        <Finish
          workout={workout}
          ticked={done}
          onSaved={() => setDone([])}
          onUndone={setDone}
        />

        <p className="flex items-start gap-1.5 text-[11px] text-ink-500">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          {SAFETY}
        </p>
      </div>
    </TrackPanel>
  )
}

function MoveRow({
  ex,
  ticked,
  onTick,
  open,
  onOpen,
  delay,
}: {
  ex: Exercise
  ticked: boolean
  onTick: () => void
  open: boolean
  onOpen: () => void
  delay: number
}) {
  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className="motion-arrive border-b border-lift/[0.06] last:border-b-0"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={ticked}
          onClick={onTick}
          className="group flex min-h-13 min-w-0 flex-1 items-center gap-3 rounded-[12px] px-1.5 py-2 text-left transition-colors hover:bg-lift/[0.04]"
        >
          <span
            aria-hidden
            className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors ${
              ticked
                ? 'bg-(--area) text-background'
                : 'ring-1 ring-lift/25 group-hover:ring-lift/40'
            }`}
          >
            {ticked ? (
              <Check className="motion-draw size-3.5" strokeWidth={3} />
            ) : null}
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className={`text-[14.5px] leading-snug transition-colors ${
                ticked ? 'text-ink-400 line-through' : 'text-ink-100'
              }`}
            >
              {ex.name}
            </span>
            <span className="font-mono text-[11px] text-ink-500">
              {ex.dose}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={`How to do ${ex.name}`}
          className="motion-press grid size-9 shrink-0 place-items-center rounded-full text-ink-500 transition-colors hover:bg-lift/[0.06] hover:text-foreground"
        >
          <ChevronDown
            className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {open ? (
        <div className="motion-arrive pb-3 pl-11">
          <HowTo ex={ex} />
        </div>
      ) : null}
    </li>
  )
}

/* What for, the steps, the mistake — and a video, because a name alone
   means nothing if you have never seen the move (26 Sep). */
function HowTo({ ex }: { ex: Exercise }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-start gap-1.5 text-[13px] text-ink-200">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
        {ex.why}
      </p>
      <ol className="flex flex-col gap-1.5 border-l border-lift/15 pl-3">
        {ex.steps.map((step, i) => (
          <li key={step} className="flex gap-2 text-[13.5px] text-ink-100">
            <span className="w-3 shrink-0 font-mono text-[11px] leading-[1.6] text-ink-500">
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
      <a
        href={howToLink(ex)}
        target="_blank"
        rel="noreferrer"
        className="motion-press inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/15 transition-colors ring-inset hover:text-foreground hover:ring-lift/30"
      >
        <ExternalLink className="size-3" />
        watch how
      </a>
    </div>
  )
}

/* The one thing this card saves: a session of the workout's kind, the same
   row the session button above writes, with the moves ticked written into
   it (sessionText). Pressing it is the claim; ticks or none, it is his to
   make. The ticks clear once saved, so a second press is not the same
   moves twice, and come back if it is undone. */
function Finish({
  workout,
  ticked,
  onSaved,
  onUndone,
}: {
  workout: Workout
  ticked: ReadonlyArray<string>
  onSaved: () => void
  onUndone: (ticked: ReadonlyArray<string>) => void
}) {
  const create = useMutation(api.logs.create)
  const { press, takeBack, canUndo, failed } = useUndoWindow()
  const [burst, setBurst] = useState(0)
  const [saved, setSaved] = useState<ReadonlyArray<string>>([])
  const session = SESSION_LABEL[workout.kind].toLowerCase()
  return (
    <div
      style={areaVars('body')}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1"
    >
      <button
        type="button"
        onClick={() => {
          setBurst((n) => n + 1)
          setSaved(ticked)
          onSaved()
          press(() =>
            create({
              kind: 'workout',
              area: 'body',
              occurredAt: Date.now(),
              category: workout.kind,
              text: sessionText(workout, ticked),
            }),
          )
        }}
        className="motion-press relative inline-flex items-center gap-2 rounded-full bg-(--area) px-5 py-2.5 text-[13.5px] font-medium text-background"
      >
        <Flag className="size-4" />
        Finish {workout.name}
        {burst > 0 ? <Sparks key={burst} count={16} reach={48} /> : null}
      </button>
      <span className="font-mono text-[10.5px] text-ink-500">
        saves one {session} session with the moves you ticked
      </span>
      <UndoOrError
        undo={canUndo}
        failed={failed}
        onUndo={() => {
          takeBack()
          onUndone(saved)
        }}
      />
    </div>
  )
}

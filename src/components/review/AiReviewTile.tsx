import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Flame, Sparkles } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Badge, Caps, Tile } from '@/components/review/parts'
import { lineNumbers } from '@/lib/weekRead'
import type { ReadKind, ReadTile } from '@/lib/weekRead'

/* The AI review (R7, 15 Oct; spec docs/specs/2026-10-15-review-ai-read.md,
   mockup real2.html's read state). "If week is good it says good this and
   that … if bad => grill me hard and encourage to work harder." One press
   reads the week (weekReads.run); GRILL ME asks for the hard voice. A read
   is kept per week and tone, so reopening shows it without paying again.
   The verdict and the lines are the AI's words; the numbers under a line
   are the page's own facts, printed by the app. */

type WeekArgs = {
  dayStarts: Array<number>
  end: number
  fourWeeksStart: number
  languages: Array<string>
}

/* The reading state shows at least this long, so a fast answer is still
   seen to land. */
const MIN_READING = 700

const TILE_NAMES: Record<ReadTile, string> = {
  finances: 'Finances',
  projects: 'Projects',
  body: 'Body',
  languages: 'Languages',
}

const KIND_CLASS: Record<ReadKind, string> = {
  GOOD: 'bg-state-good/10 text-state-good',
  BAD: 'bg-state-danger/10 text-state-danger',
  WATCH: 'bg-state-warn/10 text-state-warn',
  NEXT: 'bg-lav-400/12 text-lav-300',
}

/** The tile on this page a line is about, lit or not. */
function light(tile: ReadTile | null, on: boolean) {
  if (tile === null) return
  document
    .querySelector(`section[aria-label="${TILE_NAMES[tile]}"]`)
    ?.classList.toggle('review-lit', on)
}

/** `THU 15 20:52` — when the read landed. */
function readAt(at: number) {
  const d = new Date(at)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day.toUpperCase()} ${d.getDate()} ${time}`
}

export function AiReviewTile({
  weekNumber,
  week,
  day,
  args,
}: {
  weekNumber: number
  /** The week's key, weekKey(): its Monday as an ISO date. */
  week: string
  /** Today's place in the week (0 Monday), null for a week that is over. */
  day: number | null
  args: WeekArgs
}) {
  const reads = useQuery(api.weekReads.forWeek, { week })
  const run = useMutation(api.weekReads.run)
  /* Opened, it shows the tone read last; a press of GRILL ME switches. */
  const [chosen, setChosen] = useState<boolean | null>(null)
  const grill = chosen ?? reads?.[0]?.grill ?? false
  const read = reads?.find((r) => r.grill === grill)
  const [pressedAt, setPressedAt] = useState<number | null>(null)

  useEffect(() => {
    if (pressedAt === null || read?.status === 'reading') return
    const left = MIN_READING - (Date.now() - pressedAt)
    const timer = setTimeout(() => setPressedAt(null), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [pressedAt, read?.status, read?._id])
  /* Nothing stays lit when the tile goes. */
  useEffect(
    () => () =>
      document
        .querySelectorAll('.review-lit')
        .forEach((el) => el.classList.remove('review-lit')),
    [],
  )

  const press = () => {
    setPressedAt(Date.now())
    run({ week, grill, day, review: args }).catch(() => setPressedAt(null))
  }
  const reading = pressedAt !== null || read?.status === 'reading'

  const grillButton = (
    <button
      type="button"
      aria-pressed={grill}
      onClick={() => setChosen(!grill)}
      disabled={reading}
      className={`motion-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase transition ${grill ? 'border-state-danger bg-state-danger/14 text-state-danger shadow-[0_0_18px_-4px_var(--state-danger)]' : 'border-lift/[0.09] bg-lift/[0.04] text-ink-300'}`}
    >
      <Flame
        className={`size-3 ${grill ? 'review-flick' : 'opacity-60 grayscale'}`}
      />
      {grill && read?.status === 'done' && !reading ? 'GRILLED' : 'GRILL ME'}
    </button>
  )

  return (
    <Tile
      name="AI review"
      area="var(--color-lav-400)"
      icon={<Sparkles />}
      index={2}
      span="col-span-2 lg:col-span-2 lg:row-span-2 system-frame"
      sweep
    >
      {reading ? (
        <Reading grill={grill} weekNumber={weekNumber} />
      ) : read?.status === 'done' ? (
        <Done
          read={read}
          weekNumber={weekNumber}
          grillButton={grillButton}
          onRun={press}
        />
      ) : (
        <Idle
          grill={grill}
          weekNumber={weekNumber}
          failed={read?.status === 'failed' ? (read.error ?? '') : null}
          grillButton={grillButton}
          onRun={press}
        />
      )}
    </Tile>
  )
}

function Orb({ grill, spin }: { grill: boolean; spin?: boolean }) {
  return (
    <span
      className={`review-orb grid size-[54px] place-items-center rounded-full border [&_svg]:size-6 ${grill ? 'review-orb-hot border-state-danger text-state-danger' : 'border-lav-400/35 text-lav-300'}`}
    >
      {grill ? (
        <Flame className="review-flick" />
      ) : (
        <Sparkles className={spin ? 'review-spin' : ''} />
      )}
    </span>
  )
}

function Idle({
  grill,
  weekNumber,
  failed,
  grillButton,
  onRun,
}: {
  grill: boolean
  weekNumber: number
  failed: string | null
  grillButton: ReactNode
  onRun: () => void
}) {
  return (
    <>
      <div className="my-auto flex flex-col items-center gap-2.5 py-2">
        <Orb grill={grill} />
        {failed !== null ? (
          <span title={failed}>
            <Badge className="motion-pop bg-state-danger/10 text-state-danger">
              NOT READ · FAILED
            </Badge>
          </span>
        ) : (
          <Badge>NOT READ</Badge>
        )}
        <Caps className="text-center">
          WEEK {weekNumber} · FINANCES · PROJECTS · BODY · LANGUAGES
        </Caps>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={onRun}
          className="motion-press inline-flex items-center justify-center gap-1.5 rounded-full border border-lav-400 bg-lav-400/20 px-3.5 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase transition hover:shadow-[0_0_18px_-4px_var(--system-shine)]"
        >
          <Sparkles className="size-3" />
          {failed !== null ? 'TRY AGAIN' : 'ANALYZE WEEK'}
        </button>
        {grillButton}
      </div>
    </>
  )
}

function Reading({
  grill,
  weekNumber,
}: {
  grill: boolean
  weekNumber: number
}) {
  return (
    <div className="my-auto flex flex-col items-center gap-2.5 py-2">
      <Orb grill={grill} spin />
      <Badge
        className={`review-badge-pulse ${grill ? 'bg-state-danger/10 text-state-danger' : 'bg-lav-400/12 text-lav-300'}`}
      >
        {grill ? 'GRILLING' : 'READING'} WEEK {weekNumber}
      </Badge>
      <span className="h-[3px] w-[70%] overflow-hidden rounded-full bg-lift/[0.06]">
        <i
          className={`review-scan block h-full w-[35%] bg-linear-to-r from-transparent to-transparent ${grill ? 'via-state-danger' : 'via-lav-400'}`}
        />
      </span>
    </div>
  )
}

function Done({
  read,
  weekNumber,
  grillButton,
  onRun,
}: {
  read: Doc<'weekReads'>
  weekNumber: number
  grillButton: ReactNode
  onRun: () => void
}) {
  const hot = read.grill
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-1.5">
        <Badge className="motion-pop bg-state-good/10 text-state-good">
          <Check className="size-2.5" />
          READ · {readAt(read.readAt ?? read._creationTime)}
        </Badge>
        <button
          type="button"
          onClick={onRun}
          className="motion-press rounded-full border border-lift/[0.09] px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-300 uppercase transition hover:border-lav-400 hover:text-lav-300"
        >
          RUN AGAIN
        </button>
      </div>
      <div
        data-testid="verdict"
        data-hot={hot}
        className={`motion-pop flex flex-col gap-[3px] rounded-[10px] border px-3 py-2.5 ${hot ? 'border-state-danger/50 bg-state-danger/10' : 'border-state-warn/40 bg-state-warn/8'}`}
      >
        <span className="flex items-center justify-between gap-2">
          <Caps>WEEK {weekNumber}</Caps>
          {grillButton}
        </span>
        <span
          className={`font-mono text-[17px] tracking-[0.22em] ${hot ? 'text-state-danger [text-shadow:0_0_12px_var(--state-danger)]' : 'text-state-warn [text-shadow:0_0_12px_var(--state-warn)]'}`}
        >
          {read.verdict}
        </span>
      </div>
      <div className="flex flex-col gap-[5px]">
        {(read.lines ?? []).map((line, k) => {
          const numbers = lineNumbers(line, read.facts)
          return (
            <div
              key={k}
              data-testid="read-line"
              style={{ '--k': k } as CSSProperties}
              onMouseEnter={() => light(numbers.tile, true)}
              onMouseLeave={() => light(numbers.tile, false)}
              className="review-line grid grid-cols-[58px_1fr] items-start gap-2 rounded-[9px] border border-lift/[0.07] bg-lift/[0.025] px-2 py-1.5 text-[12px] text-ink-100 transition hover:border-lav-400 hover:bg-lav-400/8"
            >
              <Badge className={`justify-center ${KIND_CLASS[line.kind]}`}>
                {line.kind}
              </Badge>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span>{line.text}</span>
                {numbers.text !== '' ? (
                  <span className="font-mono text-[9.5px] tracking-[0.08em] text-ink-400">
                    {numbers.text}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { BicepsFlexed, Check, CircleHelp, Pencil, Scale, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { KindIcon, kindName } from '@/components/body/kinds'
import { DidButton } from '@/components/track/DidButton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { TrackPanel } from '@/components/track/TrackPanel'
import { areaVars } from '@/lib/areas'
import { KINDS, SESSION_LABEL } from '@/lib/body/library'
import { RECENT_DAYS } from '@/lib/day-strip'
import { whenLabel } from '@/lib/format'
import { monthRange } from '@/lib/month'

/* Body's header (slimmed 26 Sep: "again we need to scroll and find some
   shit"). One short card: the name, the latest weigh-in (state) he can log
   or correct right here, and how many of the last 30 days each kind
   happened (aggregate.categoryDays) as small pills. The calendar lives in
   History now, and the photo went with the height it needed. */
export function BodyHero() {
  /* Five weeks: enough behind "of the last 30 days". */
  const dayStarts = useDayStarts(5)
  const result = useQuery(api.aggregate.categoryDays, {
    area: 'body',
    kinds: ['workout', 'intake'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })
  const state = useQuery(api.aggregate.currentState, {})
  const weight = state?.weight
  /* Sessions and shakes only since 26 Sep — what History lists. */
  const rows = result?.rows ?? []

  return (
    <section
      style={areaVars('body')}
      className="glass motion-arrive relative flex flex-col gap-3.5 overflow-hidden rounded-[22px] p-4 sm:p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-(--area)/20 blur-3xl"
      />
      {/* His photo on the right, where a wide card is otherwise empty (26
          Sep: "on web right side is a bit empty. Maybe add that photo
          there"). Not on a phone: there it would sit under the pills, and
          the hero is kept short on purpose. A portrait, cropped to the face
          and faded into the card from the left. */}
      <img
        src="/body/body.jpg"
        alt=""
        aria-hidden
        decoding="async"
        style={{
          objectPosition: '50% 68%',
          maskImage: 'linear-gradient(to left, black 40%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to left, black 40%, transparent 100%)',
        }}
        className="motion-fade pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[42%] object-cover opacity-75 select-none sm:block"
      />
      <div className="relative flex items-center gap-3.5">
        <span className="motion-pop grid size-12 shrink-0 place-items-center rounded-[15px] bg-(--area)/15 text-area ring-1 ring-(--area)/35">
          <BicepsFlexed className="size-6" strokeWidth={1.6} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[26px] leading-tight font-light tracking-tight text-foreground">
            Body
          </span>
          <WeightLine
            weight={
              weight && weight.value !== undefined
                ? { value: weight.value, recordedAt: weight.recordedAt }
                : null
            }
          />
        </span>
      </div>

      {result === undefined ? null : rows.length === 0 ? (
        <p className="relative text-[13px] text-ink-400">
          Nothing in the last {RECENT_DAYS} days yet — log a session below.
        </p>
      ) : (
        <div className="relative flex flex-wrap gap-1.5">
          {rows.map((row, i) => (
            <span
              key={`${row.kind}-${row.category ?? 'unsorted'}`}
              title={`${kindName(row.category)}: ${row.activeRecent} of the last ${RECENT_DAYS} days`}
              aria-label={`${kindName(row.category)}: ${row.activeRecent} of the last ${RECENT_DAYS} days`}
              style={{ animationDelay: `${80 + i * 50}ms` }}
              className={`motion-land inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 ring-1 ring-inset ${
                row.category === null
                  ? 'text-state-warn ring-state-warn/35'
                  : 'text-area ring-lift/12'
              }`}
            >
              {row.category === null ? (
                <CircleHelp className="size-3.5" />
              ) : (
                <KindIcon kind={row.category} className="size-3.5" />
              )}
              <span className="font-mono text-[12px] text-foreground">
                {row.activeRecent}
                <span className="text-ink-500">/{RECENT_DAYS}</span>
              </span>
              <span className="label-caps hidden sm:inline">
                {kindName(row.category)}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

/* The weigh-in, logged or put right from the hero (26 Sep: "make it
   possible to log/update weight in hero"). Tap the weight, type, Enter.

   A new weigh-in is a new log — the latest wins, and the old one stays in
   History. If today already has one, saving replaces it: the new row is
   written first, then today's old one removed (logs.remove takes its
   snapshot too), so a failed save never leaves no weight at all. */
function WeightLine({
  weight,
}: {
  weight: { value: number; recordedAt: number } | null
}) {
  const today = useDayStarts(1).at(-1) as number
  const create = useMutation(api.logs.create)
  const remove = useMutation(api.logs.remove)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(false)
  const todayWeighIn = weight !== null && weight.recordedAt >= today
  const todays = useQuery(
    api.logs.listForArea,
    editing && todayWeighIn ? { area: 'body', since: today } : 'skip',
  )

  function open() {
    setText(weight === null ? '' : String(weight.value))
    setError(false)
    setEditing(true)
  }

  async function save() {
    const value = Number(text.replace(',', '.'))
    if (!Number.isFinite(value) || value < 20 || value > 400) {
      setError(true)
      return
    }
    if (weight !== null && value === weight.value && todayWeighIn) {
      setEditing(false)
      return
    }
    const old = todays?.rows.find(
      (r) => r.kind === 'weight' && r.occurredAt === weight?.recordedAt,
    )
    await create({
      kind: 'weight',
      area: 'body',
      occurredAt: Date.now(),
      value,
      unit: 'kg',
    })
    if (old) await remove({ logId: old._id })
    setEditing(false)
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="motion-arrive flex flex-wrap items-center gap-2 text-[13px]"
      >
        <Scale className="size-3.5 text-area" />
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
          }}
          aria-label="Weight in kg"
          className={`w-20 rounded-[8px] bg-sink/30 px-2 py-1 font-mono text-[14px] text-foreground ring-1 ring-inset focus:outline-none ${
            error ? 'ring-state-danger/60' : 'ring-lift/20 focus:ring-lift/40'
          }`}
        />
        <span className="text-ink-400">kg</span>
        <button
          type="submit"
          aria-label="Save weight"
          className="motion-press grid size-7 place-items-center rounded-full bg-(--area) text-background"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="motion-press grid size-7 place-items-center rounded-full text-ink-400 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
        <span className="w-full font-mono text-[10.5px] text-ink-500">
          {error
            ? 'a weight between 20 and 400 kg'
            : todayWeighIn
              ? "replaces today's weigh-in"
              : 'logs a weigh-in for now'}
        </span>
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      className="group flex items-center gap-2 self-start rounded-full py-0.5 text-[13px] text-ink-300"
    >
      <Scale className="size-3.5 text-area" />
      {weight !== null ? (
        <>
          <span className="text-foreground">{weight.value} kg</span>
          <span className="text-ink-500">
            · weighed {whenLabel(weight.recordedAt)}
          </span>
        </>
      ) : (
        <span className="text-ink-500">no weigh-in yet</span>
      )}
      <Pencil className="size-3 text-ink-500 transition-colors group-hover:text-foreground" />
    </button>
  )
}

/* A session per kind, big — the tap the Today tile counts as a workout.
   Ticking exercises is evidence of each exercise; saying the session
   happened is its own claim (25 Sep). */

export function LogSession() {
  const today = useDayStarts(1).at(-1) as number
  const range = monthRange(Date.now())
  const span = {
    today,
    monthStart: range.monthStart,
    monthEnd: range.nextStart,
  }
  return (
    <TrackPanel
      area="body"
      title="log today"
      aside={
        <span className="hidden font-mono text-[10.5px] text-ink-500 sm:inline">
          a session = one workout on Today
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
        {KINDS.map((kind) => (
          <LogButton
            key={kind}
            kind="workout"
            category={kind}
            label={SESSION_LABEL[kind]}
            sub="session"
            text={`${SESSION_LABEL[kind].toLowerCase()} session`}
            {...span}
          />
        ))}
        {/* The shake (25 Sep): protein and creatine together, one tick —
            the same row `supp` / `shake` writes from quick capture. An
            intake, not a workout: it never counts on the Today tile. */}
        <LogButton
          kind="intake"
          category="supplements"
          label="Shake"
          sub="protein + creatine"
          text="protein + creatine shake"
          {...span}
        />
      </div>
    </TrackPanel>
  )
}

function LogButton({
  kind,
  category,
  label,
  sub,
  text,
  today,
  monthStart,
  monthEnd,
}: {
  kind: 'workout' | 'intake'
  category: string
  label: string
  sub: string
  text: string
  today: number
  monthStart: number
  monthEnd: number
}) {
  const create = useMutation(api.logs.create)
  const todayCount = useQuery(api.aggregate.kindCount, {
    kind,
    area: 'body',
    category,
    start: today,
    end: today + 86_400_000,
  })
  const month = useQuery(api.aggregate.kindCount, {
    kind,
    area: 'body',
    category,
    start: monthStart,
    end: monthEnd,
  })
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <DidButton
        size="lg"
        today={todayCount}
        label={label}
        sub={sub}
        icon={<KindIcon kind={category} />}
        onDid={() =>
          create({
            kind,
            area: 'body',
            occurredAt: Date.now(),
            category,
            text,
          })
        }
      />
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 px-1">
        <span
          key={month}
          className="motion-pop text-[22px] leading-none font-light text-foreground"
        >
          {month ?? '—'}
        </span>
        <span className="label-caps whitespace-nowrap">this month</span>
      </span>
    </div>
  )
}

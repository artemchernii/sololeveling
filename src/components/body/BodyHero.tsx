import { useDayStarts } from '@/components/track/useDayStarts'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CircleHelp, PersonStanding, Scale } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { HERO_PHOTO, KindIcon, kindName, PHOTOS } from '@/components/body/kinds'
import { DayStrips } from '@/components/track/DayStrip'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { areaVars } from '@/lib/areas'
import { KINDS, SESSION_LABEL } from '@/lib/body/library'
import type { BodyKind } from '@/lib/body/library'
import { RECENT_DAYS } from '@/lib/day-strip'
import { whenLabel } from '@/lib/format'
import { monthRange } from '@/lib/month'

/* Body and how consistent you have been, in one card (25 Sep) — the
   Languages header, for the body: "consistency is the main thing".

   The latest weigh-in (state), each kind as the days it happened in the
   last 30 (aggregate.categoryDays), and twelve weeks of days. His photo
   holds the top right, beside the name, and fades out before the strip —
   a portrait, so it is cropped to the face rather than filling the card. */
export function BodyHero({ featured }: { featured: BodyKind }) {
  const dayStarts = useDayStarts()
  const result = useQuery(api.aggregate.categoryDays, {
    area: 'body',
    kinds: ['workout', 'exercise', 'intake'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })
  const state = useQuery(api.aggregate.currentState, {})
  const weight = state?.weight
  /* Exercises and the session of the same kind share a row since 25 Sep
     (categoryDays keys by category); a kind shows once. */
  const rows = result?.rows ?? []
  const unsorted = rows.some((r) => r.category === null)
  const photo = PHOTOS[featured] ?? HERO_PHOTO

  return (
    <section
      style={areaVars('body')}
      className="glass motion-arrive relative flex flex-col gap-6 overflow-hidden rounded-[26px] p-5 sm:p-7"
    >
      <img
        src={photo.src}
        alt=""
        aria-hidden
        decoding="async"
        style={{
          objectPosition: photo.focus,
          maskImage:
            'linear-gradient(to left, black 45%, transparent 100%), linear-gradient(to bottom, black 55%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to left, black 45%, transparent 100%), linear-gradient(to bottom, black 55%, transparent 100%)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
        className="motion-fade pointer-events-none absolute top-0 right-0 h-[62%] w-full object-cover opacity-45 select-none sm:w-[46%] sm:opacity-85"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full bg-(--area)/25 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-28 size-72 rounded-full bg-lav-400/10 blur-3xl"
      />
      <span
        aria-hidden
        className="motion-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2"
      />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="motion-pop grid size-[76px] place-items-center rounded-[22px] bg-(--area)/15 text-(--area) shadow-[0_0_40px_-8px_var(--area)] ring-1 ring-(--area)/35">
          <PersonStanding className="size-10" strokeWidth={1.5} />
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="pb-[0.12em] text-[40px] leading-[1.1] font-light tracking-tight text-foreground sm:text-[48px]">
            Body
          </span>
          <span className="flex items-center gap-2 text-[13px] text-ink-300">
            <Scale className="size-3.5 text-(--area)" />
            {weight && weight.value !== undefined ? (
              <>
                <span className="text-foreground">{weight.value} kg</span>
                <span className="text-ink-500">
                  · weighed {whenLabel(weight.recordedAt)}
                </span>
              </>
            ) : (
              <span className="text-ink-500">
                no weigh-in yet — ⌘L, weight 75.4
              </span>
            )}
          </span>
        </span>
      </div>

      {result === undefined ? null : rows.length === 0 ? (
        <p className="relative text-[13.5px] text-ink-300">
          Nothing logged yet. Press a session below or DID on an exercise — the
          strip lights up the day you do.
        </p>
      ) : (
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap gap-2.5">
            {rows.map((row, i) => (
              <span
                key={`${row.kind}-${row.category ?? 'unsorted'}`}
                style={{ animationDelay: `${120 + i * 70}ms` }}
                className={`motion-land flex items-center gap-3 rounded-[16px] py-2 pr-4 pl-2 ring-1 ring-inset ${
                  row.category === null
                    ? 'bg-state-warn/10 ring-state-warn/30'
                    : 'bg-background/35 ring-(--area)/25'
                }`}
              >
                <span
                  className={`grid size-8 place-items-center rounded-full ${
                    row.category === null
                      ? 'bg-state-warn/15 text-state-warn'
                      : 'bg-(--area)/18 text-(--area)'
                  }`}
                >
                  {row.category === null ? (
                    <CircleHelp className="size-4" />
                  ) : (
                    <KindIcon kind={row.category} />
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-[24px] leading-none font-light text-foreground">
                    {row.activeRecent}
                    <span className="ml-1 text-[12px] text-ink-500">
                      / {RECENT_DAYS} days
                    </span>
                  </span>
                  <span className="label-caps">{kindName(row.category)}</span>
                </span>
              </span>
            ))}
          </div>
          <DayStrips
            dayStarts={dayStarts}
            rows={rows.map((row) => ({
              key: `${row.kind}-${row.category ?? 'unsorted'}`,
              label: kindName(row.category),
              days: row.days,
              aside: `${row.activeRecent} of ${RECENT_DAYS}`,
              noun: row.kind === 'intake' ? 'dose' : 'log',
            }))}
          />
          {unsorted ? (
            <p className="flex items-center gap-1.5 text-[12px] text-state-warn">
              <CircleHelp className="size-3.5 shrink-0" />
              Unsorted = logs saved before they had a type. Pick one for each in
              History.
            </p>
          ) : null}
          {!result.complete ? (
            <span className="font-mono text-[11px] text-ink-500">
              older days not all stored
            </span>
          ) : null}
        </div>
      )}
    </section>
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

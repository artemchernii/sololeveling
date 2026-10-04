import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CalendarClock, CircleCheck } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { Veiled } from '@/components/finances/Veil'
import { dayMonth, eur, monthName } from './time'

/* The pay month (4 Oct; mockup design/treasury-mockup/flow-month.html).
   His words: "I get salary in the end of the month so in will always be 0
   till end of the month", and the big number is "more like monthly
   balance" — not what he holds. From one salary to the next: the balance
   first, then salary, other money in, bills, day-to-day; day-to-day
   against the pay month before; six pay months as bars, each telling its
   numbers on hover. aggregate.payMonth does every sum. */
export function PayMonth({
  today,
  onDayToDay,
}: {
  today: number
  onDayToDay: () => void
}) {
  const p = useQuery(api.aggregate.payMonth, { today })
  const [bills, setBills] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  if (p === undefined) {
    return (
      <section className="glass rounded-[22px] p-4 sm:p-5">
        <SkeletonRows rows={3} />
      </section>
    )
  }
  if (p === null) {
    return (
      <section className="glass motion-arrive flex flex-col gap-3 rounded-[22px] p-4 sm:p-5">
        <span className="system-title">[ PAY MONTH ]</span>
        <p className="py-6 text-center text-[13.5px] leading-relaxed text-ink-400">
          Your month runs from one salary to the next.
          <span className="block text-foreground">No salary found yet.</span>
          It is found by itself once a statement shows the same pay two months
          running.
        </p>
      </section>
    )
  }

  const c = p.current
  const all = [...p.past, { ...c, now: true as const }]
  const sign = (n: number) => (n >= 0 ? '+' : '−')
  const tone = c.balance >= 0 ? 'text-state-good' : 'text-state-danger'
  const max = Math.max(
    1,
    ...all.map((m) => Math.max(m.salary + m.other, m.bills + m.dayToDay)),
  )
  const shown = hover !== null ? all[hover] : null

  return (
    <section className="glass motion-arrive flex flex-col gap-4 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="system-title">
          [ PAY MONTH · {dayMonth(c.start)} → ~{dayMonth(c.end)} ·{' '}
          {c.salaryLate ? 'salary not seen yet' : `day ${c.day} of ${c.length}`}{' '}
          ]
        </span>
        <span className="label-caps">
          moves between your accounts not counted
        </span>
      </div>

      <div className="grid items-end gap-7 md:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] text-ink-500">
            BALANCE THIS MONTH
          </span>
          <span
            className={`mt-1.5 text-[46px] leading-none font-light tabular-nums ${tone}`}
          >
            <Veiled>
              {sign(c.balance)}
              {eur(c.balance)}
            </Veiled>
          </span>
          {/* Important (4 Oct): coloured, with a mark — a state, not a
              footnote. */}
          {c.billsLeft > 0 ? (
            <span className="mt-2.5 inline-flex w-fit items-center gap-2 rounded-full bg-state-warn/12 px-3 py-1.5 text-[13px] text-state-warn ring-1 ring-state-warn/30 ring-inset">
              <CalendarClock className="size-4" />
              Bills still to pay: <Veiled>{eur(c.billsLeft, true)}</Veiled>
            </span>
          ) : (
            <span className="mt-2.5 inline-flex w-fit items-center gap-2 rounded-full bg-state-good/12 px-3 py-1.5 text-[13px] text-state-good ring-1 ring-state-good/30 ring-inset">
              <CircleCheck className="size-4" />
              All bills paid
            </span>
          )}

          <div className="mt-5 grid max-w-[460px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5">
            <Line
              k="salary"
              what={dayMonth(c.start)}
              v={`+${eur(c.salary)}`}
              tone="text-state-good"
            />
            {c.other > 0 ? (
              <Line
                k="other money in"
                what="refunds, money back"
                v={`+${eur(c.other)}`}
                tone="text-state-good"
              />
            ) : null}
            <Line
              k="bills"
              what={c.paid.map((x) => x.name).join(', ') || 'none yet'}
              v={`−${eur(c.bills)}`}
              tone="text-state-danger"
              onClick={() => setBills(true)}
            />
            <Line
              k="day-to-day"
              what="food, transport, shopping …"
              v={`−${eur(c.dayToDay)}`}
              tone="text-state-danger"
              onClick={onDayToDay}
            />
            <span className="col-span-3 my-0.5 h-px bg-lift/8" />
            <Line
              k="balance"
              v={`${sign(c.balance)}${eur(c.balance)}`}
              tone={tone}
            />
          </div>

          {/* Two plain facts, not a difference to decode (4 Oct: "we
              spend this month 100 euros more? Confusing"). */}
          {c.pace && c.day > 0 ? (
            <p className="mt-3.5 text-[13.5px] text-ink-300">
              Day-to-day so far:{' '}
              <Veiled className="text-foreground">{eur(c.pace.now)}</Veiled>.
              Last month by day {c.day}:{' '}
              <Veiled className="text-foreground">{eur(c.pace.last)}</Veiled>.
            </p>
          ) : null}
        </div>

        <div className="relative">
          {shown ? (
            <div
              style={{
                left: `${Math.min(80, Math.max(20, ((6 - all.length + (hover ?? 0) + 0.5) / 6) * 100))}%`,
              }}
              className="pointer-events-none absolute -top-2 z-10 min-w-[210px] -translate-x-1/2 -translate-y-full rounded-[14px] bg-background/95 p-3 ring-1 ring-[color:var(--system-edge)] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
            >
              <div className="mb-2 font-mono text-[10.5px] tracking-[0.14em] text-lav-300 uppercase">
                {dayMonth(shown.start)} → {dayMonth(shown.end)}
                {'now' in shown ? ' · so far' : ''}
              </div>
              <Tip k="salary" v={`+${eur(shown.salary)}`} />
              {shown.other > 0 ? (
                <Tip k="other money in" v={`+${eur(shown.other)}`} />
              ) : null}
              <Tip k="bills" v={`−${eur(shown.bills)}`} />
              <Tip k="day-to-day" v={`−${eur(shown.dayToDay)}`} />
              <div className="mt-1 border-t border-lift/10 pt-1.5">
                <Tip
                  k="balance"
                  v={`${sign(shown.salary + shown.other - shown.bills - shown.dayToDay)}${eur(shown.salary + shown.other - shown.bills - shown.dayToDay)}`}
                />
              </div>
            </div>
          ) : null}
          <svg
            viewBox="0 0 420 150"
            className="h-auto w-full overflow-visible"
            aria-label="Six pay months"
          >
            {all.map((m, i) => {
              /* Six slots, filled from the right: two months read so
                 far sit where they will sit once there are six. */
              const step = 420 / 6
              const cx = step * (6 - all.length + i) + step / 2
              const hi = ((m.salary + m.other) / max) * 104
              const hb = (m.bills / max) * 104
              const hd = (m.dayToDay / max) * 104
              const now = 'now' in m
              return (
                <g
                  key={m.start}
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(hover === i ? null : i)}
                  opacity={now ? 0.55 : 0.9}
                >
                  <rect
                    x={cx - step / 2 + 3}
                    y={0}
                    width={step - 6}
                    height={150}
                    rx={8}
                    className={hover === i ? 'fill-lift/5' : 'fill-transparent'}
                  />
                  <rect
                    x={cx - 21}
                    y={120 - hi}
                    width={20}
                    height={hi}
                    rx={3}
                    className="motion-pop fill-state-good"
                  />
                  <rect
                    x={cx + 1}
                    y={120 - hb}
                    width={20}
                    height={hb}
                    rx={3}
                    className="motion-pop fill-state-danger/55"
                  />
                  <rect
                    x={cx + 1}
                    y={120 - hb - hd}
                    width={20}
                    height={hd}
                    rx={3}
                    className="motion-pop fill-state-danger"
                  />
                  <text
                    x={cx}
                    y={142}
                    textAnchor="middle"
                    className={`font-mono text-[10px] ${now ? 'fill-lav-300' : 'fill-ink-500'}`}
                  >
                    {monthName(m.start)} pay{now ? ' · now' : ''}
                  </text>
                </g>
              )
            })}
          </svg>
          <div className="label-caps mt-1.5 flex flex-wrap gap-3.5">
            <span>
              <i className="mr-1.5 inline-block size-2 rounded-[2px] bg-state-good" />
              salary
            </span>
            <span>
              <i className="mr-1.5 inline-block size-2 rounded-[2px] bg-state-danger/55" />
              bills
            </span>
            <span>
              <i className="mr-1.5 inline-block size-2 rounded-[2px] bg-state-danger" />
              day-to-day
            </span>
          </div>
          <span className="label-caps mt-1 block">
            a bar is one pay month, salary to salary · hover it
          </span>
        </div>
      </div>

      <Sheet
        open={bills}
        title="bills this pay month"
        onClose={() => setBills(false)}
      >
        <div className="flex flex-col gap-1">
          {c.paid.length ? (
            c.paid.map((x) => (
              <span
                key={`${x.name}-${x.t}`}
                className="flex justify-between border-b border-lift/5 py-1.5 font-mono text-[12.5px]"
              >
                <span className="text-ink-300">
                  {dayMonth(x.t)} · {x.name}
                </span>
                <span>−{eur(x.amount, true)}</span>
              </span>
            ))
          ) : (
            <span className="text-[13px] text-ink-500">
              No bill paid yet this pay month.
            </span>
          )}
          {c.billsLeft > 0 ? (
            <span className="label-caps mt-2">
              still to pay before {dayMonth(c.end)}: {eur(c.billsLeft)} — see
              AHEAD
            </span>
          ) : null}
        </div>
      </Sheet>
    </section>
  )
}

function Line({
  k,
  what,
  v,
  tone,
  onClick,
}: {
  k: string
  what?: string
  v: string
  tone: string
  onClick?: () => void
}) {
  const label = 'font-mono text-[11px] tracking-[0.14em] text-ink-400 uppercase'
  return (
    <>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`${label} border-b border-dashed border-lift/20 text-left hover:text-foreground`}
        >
          {k}
        </button>
      ) : (
        <span className={label}>{k}</span>
      )}
      <span className="truncate text-[12px] text-ink-500">{what}</span>
      <span className={`text-right font-mono text-[15px] tabular-nums ${tone}`}>
        <Veiled>{v}</Veiled>
      </span>
    </>
  )
}

function Tip({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between gap-4 py-0.5 font-mono text-[12.5px]">
      <span className="text-ink-400">{k}</span>
      <Veiled>{v}</Veiled>
    </span>
  )
}

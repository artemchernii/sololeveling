import { Link } from '@tanstack/react-router'
import { ArrowUp, DollarSign, TrendingUp, Wallet } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { AccountLogo, PayeeLogo } from '@/components/finances/Logo'
import { Badge, Caps, CountUp, Tile, dayLabel } from '@/components/review/parts'
import { categoryLabel, euros } from '@/lib/money'
import { weekChange } from '@/lib/review'

type Money = FunctionReturnType<typeof api.aggregate.weekReview>['money']
type Worth = FunctionReturnType<typeof api.aggregate.worthHistory>

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/* Finances (mockup real.html): what the week spent — bills left out and
   summed apart — against last week's whole week, the three biggest rows
   with their payees, spent by day; and worth through the week from last
   week's close, every point labelled, with cash and invested under it.
   Sums of bank rows and the stored worth series; the only difference is
   the week's change, allowed on Review (15 Oct). */
export function FinancesTile({
  money,
  worth,
  dayEnds,
  today,
  wasLabel,
  span,
}: {
  money: Money
  worth: Worth
  /** Last Sunday's end, then each day of this week up to today. */
  dayEnds: ReadonlyArray<number>
  today: number
  wasLabel: string
  span: string
}) {
  const points = worth.total
    .map((v, i) => ({ v, t: dayEnds[i] }))
    .filter((p): p is { v: number; t: number } => p.v !== null)
  const now = points.at(-1)
  const was = points.length > 1 ? points[0] : undefined
  const cash = worth.cash.filter((v) => v !== null).at(-1)
  const invested = worth.invested.filter((v) => v !== null).at(-1)

  return (
    <Tile
      name="Finances"
      to="/finances"
      area="var(--area-money)"
      icon={<DollarSign />}
      index={1}
      span={span}
    >
      <div className="grid flex-1 gap-[22px] sm:grid-cols-[1fr_1.25fr]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <Caps>
                SPENT · {wasLabel === 'LAST WEEK' ? 'THIS WEEK' : 'WEEK'}
              </Caps>
              <Info testId="bills">
                BILLS NOT COUNTED · {euros(money.bills)}
              </Info>
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[38px] leading-none font-light tracking-tight text-state-danger tabular-nums">
                <CountUp to={money.spent} format={euros2} testId="spent" />
              </span>
              <Change
                now={money.spent}
                was={money.lastSpent}
                goodWhenUp={false}
                testId="spent-change"
              />
            </div>
            <Was label={wasLabel} amount={euros(money.lastSpent)} />
          </div>
          {money.biggest.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Caps>BIGGEST</Caps>
              {money.biggest.map((b, k) => (
                <div
                  key={b._id}
                  style={{ animationDelay: `${700 + k * 120}ms` }}
                  className="motion-arrive grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2"
                >
                  {b.domain !== null ? (
                    <AccountLogo name={b.name} domain={b.domain} size={22} />
                  ) : (
                    <PayeeLogo name={b.name} size={22} />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{b.name}</span>
                    <Caps className="text-[8.5px]">
                      {categoryLabel('expense', b.category)} ·{' '}
                      {dayLabel(b.occurredAt)}
                    </Caps>
                  </span>
                  <span className="font-mono text-[12px] text-state-danger">
                    {euros(b.amount)}
                  </span>
                </div>
              ))}
              {money.count > 3 ? (
                <Link
                  to="/finances"
                  className="font-mono text-[9.5px] tracking-[0.16em] text-lav-300 uppercase"
                >
                  {money.count - 3} MORE →
                </Link>
              ) : null}
            </div>
          ) : null}
          <div className="mt-auto flex flex-col gap-1.5">
            <Caps>SPENT BY DAY</Caps>
            <SpentByDay byDay={money.byDay} today={today} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          {now ? (
            <div className="flex flex-col gap-1">
              <Caps>
                WORTH · {wasLabel === 'LAST WEEK' ? 'THIS WEEK' : 'WEEK'}
              </Caps>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[30px] leading-none font-light tracking-tight tabular-nums">
                  <CountUp
                    to={now.v}
                    format={(n) => euros(Math.round(n))}
                    testId="worth"
                  />
                </span>
                {was ? (
                  <Change
                    now={Math.round(now.v)}
                    was={Math.round(was.v)}
                    goodWhenUp
                    testId="worth-change"
                  />
                ) : null}
              </div>
              {was ? (
                <Was label={wasLabel} amount={euros(Math.round(was.v))} />
              ) : null}
            </div>
          ) : (
            <Badge className="self-start text-state-warn">
              WORTH · MISSING
            </Badge>
          )}
          {points.length > 1 ? <WorthChart points={points} /> : null}
          <div className="mt-auto grid grid-cols-2 gap-2">
            <Box
              icon={<Wallet />}
              colour="var(--area-money)"
              label="CASH"
              value={cash}
            />
            <Box
              icon={<TrendingUp />}
              colour="var(--color-lav-400)"
              label="INVESTED"
              value={invested}
            />
          </div>
        </div>
      </div>
    </Tile>
  )
}

const euros2 = (n: number) => euros(Math.round(n * 100) / 100)

/** This week minus last: an arrow and the amount, green when good. */
function Change({
  now,
  was,
  goodWhenUp,
  testId,
}: {
  now: number
  was: number
  goodWhenUp: boolean
  testId: string
}) {
  const c = weekChange(now, was, goodWhenUp)
  const colour =
    c.good === null
      ? 'text-ink-400'
      : c.good
        ? 'text-state-good'
        : 'text-state-danger'
  return (
    <span
      data-testid={testId}
      data-good={String(c.good)}
      style={{ animationDelay: '900ms' }}
      className={`motion-pop inline-flex items-center gap-1 rounded-full border border-current bg-current/12 px-[9px] py-[3px] font-mono text-[13px] ${colour}`}
    >
      {c.dir === 'same' ? null : (
        <ArrowUp
          aria-label={c.dir === 'up' ? 'up' : 'down'}
          strokeWidth={3}
          className={`size-[13px] ${c.dir === 'down' ? 'rotate-180' : ''}`}
        />
      )}
      {euros(c.amount)}
    </span>
  )
}

/** What it was: `LAST WEEK · €74.05`, the amount bold. */
function Was({ label, amount }: { label: string; amount: string }) {
  return (
    <span className="font-mono text-[12px] tracking-[0.08em] text-ink-400">
      {label} ·{' '}
      <b className="text-[14px] font-medium tracking-normal text-foreground">
        {amount}
      </b>
    </span>
  )
}

/** An ⓘ that shows its line on hover or focus. */
function Info({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <span
      tabIndex={0}
      data-testid={testId}
      className="group/info relative inline-grid size-[15px] cursor-help place-items-center rounded-full border border-ink-500 font-mono text-[9px] font-semibold text-ink-300 outline-none"
    >
      i
      <span
        role="tooltip"
        className="pointer-events-none absolute top-[calc(100%+6px)] left-0 z-30 rounded-[10px] border border-lav-400/35 bg-background/95 px-2.5 py-2 font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap text-ink-200 uppercase opacity-0 shadow-[0_18px_40px_-16px_black] transition group-hover/info:opacity-100 group-focus/info:opacity-100"
      >
        {children}
      </span>
    </span>
  )
}

function SpentByDay({
  byDay,
  today,
}: {
  byDay: ReadonlyArray<number>
  today: number
}) {
  const most = Math.max(1, ...byDay)
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {byDay.map((v, k) => (
        <div
          key={k}
          className={`flex min-w-0 flex-col items-center gap-[3px] ${today >= 0 && k > today ? 'opacity-35' : ''}`}
        >
          <span
            className={`truncate font-mono text-[9.5px] ${v ? '' : 'text-ink-600'}`}
          >
            {v ? euros(v) : '·'}
          </span>
          <span className="flex h-[46px] w-full items-end justify-center">
            <i
              style={{
                height: v ? `${Math.max(6, (v / most) * 100)}%` : '3%',
                animationDelay: `${k * 60}ms`,
              }}
              className={`bento-grow w-[62%] rounded-[3px] ${v ? 'bg-state-danger shadow-[0_0_10px_-3px_var(--state-danger)]' : 'bg-lift/[0.08]'}`}
            />
          </span>
          <Caps className="text-[8px]">{DAYS[k]}</Caps>
        </div>
      ))}
    </div>
  )
}

/** Worth from last week's close to today, every point with its value and
    its day — a picture he reads without hovering. */
function WorthChart({
  points,
}: {
  points: ReadonlyArray<{ v: number; t: number }>
}) {
  const w = 320
  const h = 92
  const top = 18
  const bot = 18
  const values = points.map((p) => p.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const xy = points.map(
    (p, k) =>
      [
        12 + (k * (w - 24)) / (points.length - 1),
        top + (1 - (p.v - min) / (max - min || 1)) * (h - top - bot),
      ] as const,
  )
  const d = xy
    .map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="block h-[92px] w-full overflow-visible"
      aria-label="Worth by day"
      data-testid="worth-chart"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--area-money)"
        strokeWidth="2"
        className="bento-line"
      />
      {xy.map(([x, y], k) => {
        const last = k === xy.length - 1
        return (
          <g key={k}>
            <circle
              cx={x}
              cy={y}
              r={last ? 4 : 3}
              fill="var(--area-money)"
              className={last ? 'system-pulse' : undefined}
            />
            <text
              x={x}
              y={y - 8}
              textAnchor="middle"
              className="fill-ink-200 font-mono text-[9.5px]"
            >
              {(points[k].v / 1000).toFixed(1)}k
            </text>
            <text
              x={x}
              y={h - 2}
              textAnchor="middle"
              letterSpacing="1"
              className="fill-ink-400 font-mono text-[8.5px]"
            >
              {dayLabel(points[k].t).slice(0, 3)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Box({
  icon,
  colour,
  label,
  value,
}: {
  icon: ReactNode
  colour: string
  label: string
  value: number | null | undefined
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] px-3 py-2.5">
      <span
        style={{ '--c': colour } as CSSProperties}
        className="grid size-[30px] shrink-0 place-items-center rounded-[9px] border border-(--c)/35 bg-(--c)/16 text-(--c) [&_svg]:size-[15px]"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <Caps>{label}</Caps>
        <span className="text-[15px] leading-none font-light tabular-nums">
          {value === null || value === undefined
            ? '—'
            : euros(Math.round(value))}
        </span>
      </span>
    </div>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { Check, EqualNot, Eye, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { Opt } from '@/components/finances/BulkParts'
import type { Review } from '@/components/finances/BulkParts'
import { money } from '@/lib/currency'
import { totalWhy } from '@/lib/holdingsTotal'
import type { TotalCheck } from '@/lib/holdingsTotal'

type Total = NonNullable<Review['accounts'][number]['holdings']>['total']

/* A broker screenshot against the total it prints, before it is saved (11
   Oct, design/treasury-mockup/holdings-total.html): the positions and the
   cash beside the total on the same screenshot. One that does not add up
   is not saved until he says. Every number is the reading's own
   (src/lib/holdingsTotal.ts adds them). */

const TILES = 24
const positionsWords = (n: number) =>
  `${n} ${n === 1 ? 'position' : 'positions'}`

function Cell({
  label,
  value,
  under,
  dot,
  tone,
}: {
  label: string
  value: string
  under: ReactNode
  dot?: string
  tone?: 'says' | 'good' | 'warn'
}) {
  return (
    <span
      className={`flex min-w-0 flex-col justify-end gap-[3px] border-lift/[0.06] px-3 py-[9px] not-first:border-l max-sm:nth-[3]:border-l-0 max-sm:nth-[n+3]:border-t ${tone ? 'bg-lav-400/[0.07]' : ''}`}
    >
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] leading-[1.35] tracking-[0.12em] text-ink-500 uppercase">
        {dot ? (
          <span className={`size-[7px] shrink-0 rounded-full ${dot}`} />
        ) : null}
        {label}
      </span>
      <span
        className={`text-[16px] tabular-nums ${tone === 'warn' ? 'text-state-warn' : tone ? 'text-foreground' : 'font-light text-ink-200'}`}
      >
        <Veiled>{value}</Veiled>
      </span>
      <span
        className={`flex min-h-3 items-center gap-1 font-mono text-[9.5px] ${tone === 'good' ? 'text-state-good' : tone === 'warn' ? 'text-state-warn' : 'text-ink-500'}`}
      >
        {under}
      </span>
    </span>
  )
}

/** positions · cash · positions and cash · total on the screenshot. */
export function TotalStrip({
  check,
  cash,
}: {
  check: TotalCheck
  cash: string
}) {
  /* A total of the positions alone: the cash is beside it, not in it. */
  const both = check.cashEur !== null && !check.withoutCash
  return (
    <div
      data-total={check.state}
      className={`grid grid-cols-2 overflow-hidden rounded-[12px] bg-sink/[0.22] ring-1 ring-lift/[0.06] ring-inset ${both ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}
    >
      <Cell
        label={positionsWords(check.positions)}
        value={money(check.positionsEur)}
        under="worth on the screenshot"
        dot="bg-lav-400"
      />
      {both ? (
        <>
          <Cell
            label={cash}
            value={money(check.cashEur ?? 0)}
            under="not invested"
            dot="bg-money-cash"
          />
          <Cell
            label={`positions and ${cash}`}
            value={money(check.bothEur)}
            under="sum of the two"
            tone="says"
          />
        </>
      ) : null}
      <Cell
        label="total on the screenshot"
        value={check.totalEur === null ? '—' : money(check.totalEur)}
        tone={
          check.state === 'same'
            ? 'good'
            : check.state === 'differs'
              ? 'warn'
              : 'says'
        }
        under={
          check.state === 'same' ? (
            <>
              <Check className="motion-pop size-[11px]" strokeWidth={3} />
              adds up
            </>
          ) : check.state === 'differs' ? (
            <>
              <EqualNot className="size-[11px]" />
              does not add up
            </>
          ) : (
            'not on the screenshot'
          )
        }
      />
    </div>
  )
}

function Box({
  label,
  value,
  under,
}: {
  label: string
  value: string
  under: string
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1 rounded-[12px] bg-sink/[0.22] px-3 py-2.5 ring-1 ring-lift/[0.12] ring-inset">
      <span className="min-h-[2.7em] font-mono text-[9.5px] leading-[1.35] tracking-[0.12em] text-ink-500 uppercase sm:min-h-0">
        {label}
      </span>
      <span className="text-[18px] text-foreground tabular-nums">
        <Veiled>{value}</Veiled>
      </span>
      <span className="font-mono text-[9.5px] text-ink-500">{under}</span>
    </span>
  )
}

/** The two numbers that differ, with where each is from. */
export function TotalAsk({
  name,
  check,
  cash,
  file,
  children,
}: {
  name: string
  check: TotalCheck
  cash: string
  file: string
  children?: ReactNode
}) {
  const withCash = check.cashEur !== null
  const left = withCash ? `positions and ${cash}` : 'positions'
  return (
    <div
      data-testid="total-differs"
      className="motion-land flex flex-col gap-2.5 rounded-[14px] bg-state-warn/[0.06] p-3 ring-1 ring-state-warn/30 ring-inset"
    >
      <div className="flex items-start gap-2 text-[13.5px] leading-normal">
        <EqualNot className="mt-1 size-3.5 shrink-0 text-state-warn" />
        <div>
          <b className="font-medium">
            {name}: <Veiled>{money(check.bothEur)}</Veiled> in the {left},{' '}
            <Veiled>{money(check.totalEur ?? 0)}</Veiled> total on the
            screenshot.
          </b>
          <small className="block text-[12px] text-ink-400">
            {totalWhy(check)}
          </small>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:ml-[23px]">
        <Box
          label={left}
          value={money(check.bothEur)}
          under={`${positionsWords(check.positions)}${withCash ? ` · ${cash} ${money(check.cashEur ?? 0)}` : ''}`}
        />
        <Box
          label="total on the screenshot"
          value={money(check.totalEur ?? 0)}
          under={file}
        />
      </div>
      {children}
    </div>
  )
}

/** The check in an account's block of the review, with its answers. */
export function HoldingsTotal({
  total,
  name,
  cash,
  file,
  batchId,
  accountId,
  onOpen,
}: {
  total: Total
  name: string
  cash: string
  file: string
  batchId: Id<'batches'>
  accountId: Id<'accounts'>
  /** Opens the positions screen. */
  onOpen: () => void
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState(false)
  /* "saving…" stays long enough to be read (every press answers). */
  const say = (save: boolean, on = true) => {
    setBusy(true)
    void Promise.allSettled([
      answer({
        batchId,
        answer: {
          kind: 'sum',
          key: `${save ? 'total' : 'nototal'}:${accountId}`,
          on,
        },
      }),
      new Promise((done) => setTimeout(done, 450)),
    ]).finally(() => setBusy(false))
  }
  const shown = all ? total.lines : total.lines.slice(0, TILES)
  return (
    <div className="flex flex-col gap-3">
      <TotalStrip check={total} cash={cash} />
      {total.state === 'none' ? (
        <div className="flex items-start gap-2 text-[12.5px] leading-normal text-ink-300">
          <Eye className="mt-0.5 size-3.5 shrink-0 text-lav-400" />
          <span>
            <span className="text-foreground">
              Not checked: no total on the screenshot.
            </span>{' '}
            Saved as the screenshot shows.
          </span>
        </div>
      ) : total.state === 'differs' && (total.answer === null || busy) ? (
        <TotalAsk name={name} check={total} cash={cash} file={file}>
          <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 sm:pl-[23px]">
            {busy ? (
              <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase">
                <Loader2 className="save-spinner size-3.5" />
                saving…
              </span>
            ) : (
              <>
                <Opt loud onClick={() => say(false)}>
                  <span className="pl-1.5">do not save {name}</span>
                </Opt>
                <Opt onClick={() => say(true)}>
                  <span className="pl-1.5">save {name} anyway</span>
                </Opt>
              </>
            )}
          </div>
        </TotalAsk>
      ) : total.state === 'differs' ? (
        <div
          role="status"
          className="motion-land flex items-center gap-2.5 rounded-[14px] bg-state-good/[0.06] px-3 py-2.5 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset"
        >
          <Check
            className="motion-pop size-3.5 shrink-0 text-state-good"
            strokeWidth={3}
          />
          <span className="flex-1">
            {total.answer === 'save'
              ? `${name} saved as the screenshot shows: ${positionsWords(total.positions)}${total.cashEur === null ? '' : ` and the ${cash}`}.`
              : `${name} not saved. Positions stay as they are.`}
          </span>
          <button
            type="button"
            onClick={() => say(total.answer === 'save', false)}
            className="font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase"
          >
            undo
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((l, i) => (
          <div
            key={`${l.name}-${i}`}
            style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
            className="motion-land flex min-w-0 items-center gap-2 rounded-[10px] bg-sink/[0.22] px-2.5 py-[7px]"
          >
            {l.symbol ? (
              <TickerLogo
                symbol={l.symbol}
                type={l.type ?? undefined}
                name={l.name}
                size={22}
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
              {l.symbol?.split('.')[0] ?? l.name}
            </span>
            <span className="font-mono text-[11px] whitespace-nowrap text-ink-300 tabular-nums max-sm:text-[10px]">
              <Veiled>{l.valueEur === null ? '—' : money(l.valueEur)}</Veiled>
            </span>
          </div>
        ))}
        {total.lines.length > TILES ? (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="motion-press rounded-[10px] px-2.5 py-[7px] font-mono text-[10.5px] tracking-[0.08em] text-ink-400 ring-1 ring-lift/[0.08] ring-inset hover:text-foreground"
          >
            {all ? 'fewer' : `${total.lines.length - TILES} more`}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="self-end font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase"
      >
        positions
      </button>
    </div>
  )
}

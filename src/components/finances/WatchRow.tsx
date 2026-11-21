import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { BellRing, Bell, Star } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { FIELD } from '@/components/finances/bits'
import { TickerLogo } from '@/components/finances/Logo'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Watched } from '@/components/finances/useWatch'
import { money } from '@/lib/currency'
import { dayChange } from '@/lib/priceChart'
import { signOf } from '@/lib/watch'
import type { WatchFacts } from '@/lib/watch'
import type { Call } from '@/lib/indicators'

/* One name on the WATCHLIST (1 Nov, mockup watchlist.html): TICKER ·
   LAST · DAY · 52W RANGE · VS HIGH · SIGNAL · ALERT · ★, a table on a
   wide window and stacked on a phone. Every number is a stored close or
   read from stored closes by the chart's own rules (src/lib/watch). */

export const COLS =
  'sm:grid-cols-[34px_minmax(0,1fr)_84px_62px_124px_56px_100px_116px_30px] sm:[grid-template-areas:none]'
const STACK =
  "grid-cols-[34px_minmax(0,1fr)_auto_36px] [grid-template-areas:'l_w_p_s'_'l_w_d_s'_'g_g_g_f'_'v_v_a_a']"
const AREA = (a: string) => `[grid-area:${a}] sm:[grid-area:auto]`

export const BADGE =
  'inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[9.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase ring-1 ring-inset'

export const CALL: Record<Call, string> = {
  add: 'bg-state-good/12 text-state-good ring-state-good/45',
  hold: 'bg-lav-400/12 text-lav-300 ring-lav-400/45',
  wait: 'bg-state-warn/12 text-state-warn ring-state-warn/45',
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export function WatchRow({
  w,
  facts,
  delay,
}: {
  w: Watched
  facts: WatchFacts | null | undefined
  delay: number
}) {
  const [editing, setEditing] = useState(false)
  const [going, setGoing] = useState(false)
  const remove = useMutation(api.watch.remove)
  const say = (n: number) => money(n, w.currency || 'EUR')
  const last = w.closes.at(0)
  const day =
    last === undefined
      ? null
      : dayChange([...w.closes].reverse(), {
          asOf: last.asOf,
          price: last.price,
        })
  const at =
    facts && last && facts.high > facts.low
      ? Math.max(
          0,
          Math.min(
            100,
            ((last.price - facts.low) / (facts.high - facts.low)) * 100,
          ),
        )
      : null

  return (
    <>
      <div
        data-testid="watch-row"
        data-symbol={w.symbol}
        style={{ animationDelay: `${delay}ms` }}
        className={`motion-arrive grid items-center gap-x-2.5 gap-y-1.5 border-b border-lift/[0.06] px-1 py-3 transition-[opacity,transform] duration-300 last:border-b-0 sm:px-2 sm:py-2.5 ${STACK} ${COLS} ${going ? 'translate-x-3 opacity-0' : ''}`}
      >
        <span className={AREA('l')}>
          <TickerLogo symbol={w.symbol} type={w.type} name={w.name} size={34} />
        </span>
        <Link
          to="/finances"
          search={{ room: 'portfolio', position: w.instrumentId }}
          className={`flex min-w-0 flex-col hover:text-lav-300 ${AREA('w')}`}
        >
          <span className="font-mono text-[12px] font-bold text-foreground">
            {w.symbol}
          </span>
          <span className="truncate text-[11.5px] text-ink-400">{w.name}</span>
        </Link>
        <span
          className={`text-right font-mono text-[13px] font-semibold text-foreground tabular-nums ${AREA('p')}`}
        >
          {last ? say(last.price) : '—'}
        </span>
        <span
          data-testid="watch-day"
          className={`text-right font-mono text-[11.5px] tabular-nums ${AREA('d')} ${
            day === null
              ? 'text-ink-500'
              : day.diff < 0
                ? 'text-state-danger'
                : 'text-state-good'
          }`}
        >
          {day === null
            ? '—'
            : `${day.diff < 0 ? '▼' : '▲'} ${Math.abs(day.pct).toFixed(1)}%`}
        </span>
        <span
          data-testid="watch-range"
          className={`flex flex-col gap-1 ${AREA('g')}`}
        >
          <span className="relative h-[5px] rounded-full bg-lift/[0.08]">
            {at === null ? null : (
              <i
                className="absolute -top-[2px] -ml-[4.5px] size-[9px] rounded-full bg-ink-200 ring-2 ring-background"
                style={{ left: `${at}%` }}
              />
            )}
          </span>
          <span className="flex justify-between font-mono text-[9.5px] text-ink-400 tabular-nums">
            {facts ? (
              <>
                <span>{say(Math.round(facts.low))}</span>
                <span>{say(Math.round(facts.high))}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </span>
        </span>
        <span
          data-testid="watch-vs"
          className={`text-right font-mono text-[11.5px] tabular-nums ${AREA('f')} ${
            facts && facts.vsHigh < -15 ? 'text-state-danger' : 'text-ink-300'
          }`}
        >
          {facts ? `${facts.vsHigh.toFixed(0)}%` : '—'}
        </span>
        <span
          data-testid="watch-signal"
          className={`flex items-start gap-0.5 max-sm:flex-row max-sm:items-center max-sm:gap-2 sm:flex-col ${AREA('v')}`}
        >
          {facts?.call ? (
            <span className={`${BADGE} ${CALL[facts.call]}`}>{facts.call}</span>
          ) : (
            <span className={`${BADGE} text-ink-500 ring-lift/15`}>—</span>
          )}
          {facts ? (
            <span className="font-mono text-[9.5px] whitespace-nowrap text-ink-400">
              {facts.bull} bull · {facts.bear} bear
            </span>
          ) : null}
        </span>
        <span
          className={`flex flex-col items-start gap-0.5 max-sm:items-end max-sm:justify-self-end ${AREA('a')}`}
        >
          <button
            type="button"
            aria-label={`alert ${w.symbol}`}
            onClick={() => setEditing((e) => !e)}
            className={`${BADGE} motion-press py-[5px] ${
              w.hit
                ? 'motion-pulse bg-state-good/12 text-state-good ring-state-good/50'
                : w.alert
                  ? 'bg-lav-400/10 text-lav-300 ring-lav-400/45'
                  : 'text-ink-400 ring-lift/20 hover:text-foreground'
            }`}
          >
            {w.hit ? (
              <BellRing className="size-3" />
            ) : (
              <Bell className="size-3" />
            )}
            {w.alert && w.hit
              ? `hit ${signOf(w.alert.side)} ${say(w.alert.at)}`
              : w.alert
                ? `${signOf(w.alert.side)} ${say(w.alert.at)}`
                : 'alert'}
          </button>
          {w.hit ? (
            <span className="font-mono text-[9.5px] text-ink-400 uppercase">
              {DAY.format(new Date(w.hit.asOf))}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label={`unwatch ${w.symbol}`}
          onClick={() => {
            setGoing(true)
            void remove({ instrumentId: w.instrumentId }).catch(() =>
              setGoing(false),
            )
          }}
          className={`motion-press grid size-[30px] place-items-center justify-self-end rounded-[10px] bg-state-warn/14 text-state-warn ring-1 ring-state-warn/45 ring-inset ${AREA('s')}`}
        >
          <Star className="size-[15px]" fill="currentColor" />
        </button>
      </div>
      {editing ? (
        <WatchAlert w={w} facts={facts} onClose={() => setEditing(false)} />
      ) : null}
    </>
  )
}

/** 🔔: his price, saved with saving… at once and a tick, then closed. */
function WatchAlert({
  w,
  facts,
  onClose,
}: {
  w: Watched
  facts: WatchFacts | null | undefined
  onClose: () => void
}) {
  const set = useMutation(api.watch.setAlert)
  const clear = useMutation(api.watch.clearAlert)
  const { status, run, settle, busy } = useSave()
  const last = w.closes.at(0)
  const [value, setValue] = useState(
    String(w.alert?.at ?? (last ? Math.round(last.price * 0.9) : '')),
  )
  const [failed, setFailed] = useState(false)
  const at = Number(value.replace(',', '.'))
  const ok = Number.isFinite(at) && at > 0
  const say = (n: number) => money(n, w.currency || 'EUR')
  return (
    <div className="motion-arrive mx-1 mb-2 flex flex-wrap items-center gap-2 rounded-[14px] bg-lift/[0.04] p-2.5 ring-1 ring-lav-400/30 ring-inset sm:ml-12">
      <span className="label-caps flex items-center gap-1.5 text-lav-300">
        <Bell className="size-3" /> price alert · {w.symbol}
      </span>
      <input
        autoFocus
        inputMode="decimal"
        aria-label={`alert price ${w.symbol}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${FIELD} w-[110px] py-1.5 font-mono tabular-nums`}
      />
      <span className="min-w-[150px] flex-1 font-mono text-[10.5px] text-ink-400">
        {last ? `last ${say(last.price)}` : ''}
        {facts
          ? ` · 52w ${say(Math.round(facts.low))}–${say(Math.round(facts.high))}`
          : ''}
      </span>
      {failed ? (
        <span className={`${BADGE} text-state-danger ring-state-danger/35`}>
          not saved
        </span>
      ) : null}
      {w.alert ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void clear({ instrumentId: w.instrumentId }).then(onClose)
          }
          className={`${BADGE} motion-press py-[6px] text-ink-300 ring-lift/20`}
        >
          remove
        </button>
      ) : null}
      <button
        type="button"
        aria-label="save alert"
        disabled={!ok || busy}
        onClick={() => {
          setFailed(false)
          run(() => set({ instrumentId: w.instrumentId, at })).catch(() =>
            setFailed(true),
          )
        }}
        className="motion-press rounded-full bg-lav-400 px-5 py-2 font-mono text-[10.5px] font-bold tracking-[0.14em] text-background uppercase disabled:opacity-50"
      >
        <SaveLabel
          status={status}
          onSettled={() => {
            settle()
            onClose()
          }}
        >
          save
        </SaveLabel>
      </button>
    </div>
  )
}

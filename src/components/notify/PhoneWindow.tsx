import { useMutation } from 'convex/react'
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  Check,
  Coins,
  FileCheck,
  Footprints,
  KeyRound,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import { Logo } from './Logo'
import { Taps } from './Taps'
import { usePhone } from './usePhone'
import { deviceOf } from '@/lib/push'
import type { PhoneState } from '@/lib/push'

/* N1 (15 Oct), as design/notifications-mockup draws it: the System window
   with three segments — HOME SCREEN · ALLOW · TEST — and only the step
   this browser is on. */

type Seg = 'done' | 'now' | 'bad' | 'later'

function Segments({ segs }: { segs: [Seg, Seg, Seg] }) {
  const names = ['HOME SCREEN', 'ALLOW', 'TEST']
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {names.map((name, i) => {
        const s = segs[i]
        return (
          <div key={name} className="flex flex-col gap-1.5">
            <i className="relative block h-1 overflow-hidden rounded bg-lift/10">
              {s === 'done' ? (
                <b className="nt-fill absolute inset-0 rounded bg-state-good shadow-[0_0_8px_var(--color-state-good)]" />
              ) : s === 'now' ? (
                <b className="nt-scan absolute inset-0 rounded" />
              ) : s === 'bad' ? (
                <b className="absolute inset-0 rounded bg-state-danger" />
              ) : null}
            </i>
            <span
              className={[
                'font-mono text-[9px] tracking-[0.14em]',
                s === 'done'
                  ? 'text-state-good'
                  : s === 'now'
                    ? 'text-lav-300'
                    : s === 'bad'
                      ? 'text-state-danger'
                      : 'text-ink-500',
              ].join(' ')}
            >
              {name}
              {s === 'done' ? ' ✓' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Badge({
  tone,
  live,
  children,
}: {
  tone: 'good' | 'warn' | 'danger' | 'lav'
  live?: boolean
  children: React.ReactNode
}) {
  const color = {
    good: 'text-state-good bg-state-good/10',
    warn: 'text-state-warn bg-state-warn/10',
    danger: 'text-state-danger bg-state-danger/10',
    lav: 'text-lav-400 bg-lav-400/10',
  }[tone]
  return (
    <span
      className={[
        'motion-pop inline-flex items-center gap-1.5 rounded-full border border-current px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap uppercase',
        live ? 'nt-live' : '',
        color,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function Source({
  icon,
  name,
  when,
  area,
}: {
  icon: React.ReactNode
  name: string
  when: string
  area: string
}) {
  return (
    <div
      className="glass motion-arrive flex items-center gap-3 rounded-[14px] p-3"
      style={{ '--a': area } as React.CSSProperties}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-[color-mix(in_oklch,var(--a)_35%,transparent)] bg-[color-mix(in_oklch,var(--a)_18%,transparent)] text-[var(--a)]">
        {icon}
      </span>
      <div>
        <div className="text-[14.5px]">{name}</div>
        <div className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-ink-400">
          {when}
        </div>
      </div>
      <span className="ml-auto">
        <Badge tone="good" live>
          ON
        </Badge>
      </span>
    </div>
  )
}

const BUTTON =
  'flex items-center justify-center gap-2 rounded-[16px] p-[15px] font-mono text-[12px] tracking-[0.16em] uppercase'

function TestButton() {
  const send = useMutation(api.push.sendTest)
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  )
  return (
    <button
      type="button"
      disabled={phase === 'sending'}
      onClick={async () => {
        setPhase('sending')
        try {
          await send({})
          setPhase('sent')
        } catch {
          setPhase('failed')
        }
      }}
      className={[
        BUTTON,
        phase === 'sent'
          ? 'motion-pop bg-state-good/15 text-state-good ring-1 ring-state-good'
          : phase === 'failed'
            ? 'bg-state-danger/10 text-state-danger ring-1 ring-state-danger'
            : 'bg-lift/[0.05] text-foreground ring-1 ring-lift/10',
      ].join(' ')}
    >
      {phase === 'sending' ? (
        <>
          <Loader2 className="size-4 animate-spin" /> sending…
        </>
      ) : phase === 'sent' ? (
        <>
          <Check className="size-4" /> SENT
        </>
      ) : phase === 'failed' ? (
        'NOT SENT'
      ) : (
        <>
          <Bell className="size-4" /> SEND A TEST
        </>
      )}
    </button>
  )
}

const SEGS: Record<PhoneState, [Seg, Seg, Seg]> = {
  'in-safari': ['now', 'later', 'later'],
  ask: ['done', 'now', 'later'],
  on: ['done', 'done', 'now'],
  blocked: ['done', 'bad', 'later'],
  unsupported: ['bad', 'later', 'later'],
}

export function PhoneWindow() {
  const { state, busy, failed, allow, keyMissing, ready } = usePhone()
  const isPhone =
    typeof navigator !== 'undefined' &&
    deviceOf(navigator.userAgent) === 'iphone'
  const title = isPhone ? '[ IPHONE ]' : '[ THIS DEVICE ]'

  if (state === null) {
    return <div className="system-frame relative h-[420px] rounded-[18px]" />
  }

  const badge = {
    'in-safari': (
      <Badge tone="warn" live>
        IN SAFARI
      </Badge>
    ),
    ask: <Badge tone="good">{isPhone ? 'ON HOME SCREEN' : 'READY'}</Badge>,
    on: (
      <Badge tone="good" live>
        ON
      </Badge>
    ),
    blocked: (
      <Badge tone="danger" live>
        BLOCKED
      </Badge>
    ),
    unsupported: <Badge tone="danger">NO NOTIFICATIONS</Badge>,
  }[state]

  return (
    <section
      data-testid="phone-window"
      data-state={state}
      className="system-frame system-open relative flex flex-col gap-3.5 overflow-hidden rounded-[18px] p-4"
    >
      <div className="flex items-center gap-2">
        <span className="system-title">{title}</span>
        <span className="ml-auto">{badge}</span>
      </div>
      <Segments segs={SEGS[state]} />

      {state === 'in-safari' ? <Taps /> : null}

      {state === 'ask' ? (
        <>
          <div className="flex flex-col items-center gap-3 py-3 text-center">
            <div className="nt-halo relative grid size-[120px] place-items-center">
              <span className="relative z-10 block size-[92px] overflow-hidden rounded-[22px] shadow-[0_0_40px_-6px_var(--system-shine)]">
                <Logo />
              </span>
            </div>
            <div className="text-[30px] font-light tracking-[-0.01em]">
              Notifications
            </div>
            {keyMissing ? (
              <Badge tone="danger">KEY MISSING</Badge>
            ) : failed ? (
              <Badge tone="danger">NOT ALLOWED</Badge>
            ) : (
              <Badge tone="warn" live>
                NOT ON
              </Badge>
            )}
          </div>
          <button
            type="button"
            disabled={busy || keyMissing || !ready}
            onClick={() => void allow()}
            className={[
              BUTTON,
              'bg-lav-400 font-medium text-lav-900 shadow-[0_10px_30px_-8px_var(--system-shine)] disabled:opacity-60',
            ].join(' ')}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> allowing…
              </>
            ) : (
              <>
                <Bell className="size-4" /> ALLOW
              </>
            )}
          </button>
        </>
      ) : null}

      {state === 'on' ? (
        <>
          <Source
            icon={<Footprints className="size-[18px]" />}
            name="Calendar"
            when="10 MIN BEFORE"
            area="var(--color-area-body)"
          />
          <Source
            icon={<FileCheck className="size-[18px]" />}
            name="Files read"
            when="WHEN DONE"
            area="var(--color-area-money)"
          />
          {/* N2 (17 Oct): money alerts, each morning at 09:00. */}
          <Source
            icon={<Coins className="size-[18px]" />}
            name="Money for a bill"
            when="2 DAYS BEFORE · 09:00"
            area="var(--color-state-warn)"
          />
          <Source
            icon={<KeyRound className="size-[18px]" />}
            name="Bank approval"
            when="7 DAYS · 1 DAY BEFORE"
            area="var(--color-state-warn)"
          />
          <Source
            icon={<TrendingUp className="size-[18px]" />}
            name="Salary"
            when="WHEN IN · 09:00"
            area="var(--color-state-good)"
          />
          {/* N3 (22 Oct): the shares held, each morning at 09:00. */}
          <Source
            icon={<CalendarDays className="size-[18px]" />}
            name="Earnings"
            when="2 DAYS BEFORE · REPORTED · 09:00"
            area="var(--color-lav-400)"
          />
          <Source
            icon={<ArrowLeftRight className="size-[18px]" />}
            name="ADD · HOLD · WAIT"
            when="WHEN IT CHANGES · 09:00"
            area="var(--color-state-good)"
          />
          <Source
            icon={<TrendingDown className="size-[18px]" />}
            name="Big day"
            when="±5% · 09:00"
            area="var(--color-state-danger)"
          />
          <TestButton />
        </>
      ) : null}

      {state === 'blocked' && !isPhone ? (
        <div className="glass rounded-[14px] px-3.5 py-3 font-mono text-[10.5px] tracking-[0.12em] text-ink-200">
          ADDRESS BAR → SITE SETTINGS → NOTIFICATIONS → ALLOW
        </div>
      ) : null}

      {state === 'blocked' && isPhone ? (
        <>
          <span className="font-mono text-[9.5px] tracking-[0.16em] text-ink-400">
            SETTINGS
          </span>
          {/* iOS Settings, drawn in its own dark grey. */}
          <div className="overflow-hidden rounded-[16px] bg-[#1c1c1e] text-[15px]">
            <div className="flex items-center gap-2.5 border-b border-[#2c2c2e] px-3.5 py-3">
              <span className="grid size-7 place-items-center rounded-[7px] bg-[#ff3b30] text-[#fff]">
                <Bell className="size-4" />
              </span>
              Notifications
              <span className="ml-auto text-[#6e6e73]">›</span>
            </div>
            <div className="flex items-center gap-2.5 border-b border-[#2c2c2e] bg-[#0a7aff]/20 px-3.5 py-3">
              <span className="block size-7 overflow-hidden rounded-[7px]">
                <Logo still />
              </span>
              Leveling
              <span className="ml-auto text-[#6e6e73]">›</span>
            </div>
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              Allow Notifications
              <span className="nt-switch relative ml-auto block h-7 w-[46px] rounded-full bg-[#39393d]" />
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

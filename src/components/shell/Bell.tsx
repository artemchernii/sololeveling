import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Bell as BellIcon,
  CalendarClock,
  Coins,
  FileCheck,
  FileX,
  KeyRound,
  Laptop,
  Smartphone,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderSVG } from 'uqr'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { deviceOf } from '@/lib/push'

/* N1 (15 Oct). The bell, as design/notifications-mockup draws it: today's
   notifications in a System window — NOW and EARLIER TODAY, an unread dot
   that pings, a row that opens its screen — and the devices that get them.
   No iPhone yet: a QR of /phone instead, for the iPhone's camera. */

function midnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const KIND: Record<
  Doc<'notifications'>['kind'],
  { icon: React.ReactNode; area: string }
> = {
  reminder: {
    icon: <CalendarClock className="size-[18px]" />,
    area: 'var(--color-area-body)',
  },
  file_read: {
    icon: <FileCheck className="size-[18px]" />,
    area: 'var(--color-area-money)',
  },
  file_failed: {
    icon: <FileX className="size-[18px]" />,
    area: 'var(--color-state-danger)',
  },
  test: {
    icon: <BellIcon className="size-[18px]" />,
    area: 'var(--color-lav-400)',
  },
  money_missing: {
    icon: <Coins className="size-[18px]" />,
    area: 'var(--color-state-warn)',
  },
  bank_approval: {
    icon: <KeyRound className="size-[18px]" />,
    area: 'var(--color-state-warn)',
  },
  salary_in: {
    icon: <TrendingUp className="size-[18px]" />,
    area: 'var(--color-state-good)',
  },
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

function Row({
  n,
  i,
  onOpen,
}: {
  n: Doc<'notifications'>
  i: number
  onOpen: (n: Doc<'notifications'>) => void
}) {
  const k = KIND[n.kind]
  const unread = n.readAt === undefined
  /* Unread is lit — a lavender edge, its area's glow breathing, NEW and a
     pinging dot; seen is dimmed with a tick (15 Oct: "when already viewed
     no indication of that"). */
  return (
    <button
      type="button"
      data-testid="bell-row"
      data-unread={unread ? 'true' : 'false'}
      onClick={() => onOpen(n)}
      className={[
        'motion-arrive group relative flex w-full items-center gap-3.5 overflow-hidden rounded-[16px] border px-3.5 py-3 text-left transition-all duration-300 hover:-translate-y-0.5',
        unread
          ? 'border-lav-400/45 bg-lav-400/[0.08] shadow-[0_0_24px_-10px_var(--system-shine)]'
          : 'border-lift/[0.07] bg-lift/[0.025] opacity-70 hover:opacity-100',
      ].join(' ')}
      style={
        { '--a': k.area, animationDelay: `${i * 70}ms` } as React.CSSProperties
      }
    >
      {unread ? <span aria-hidden className="nt-glow-blob" /> : null}
      <span
        className={[
          'relative grid size-11 shrink-0 place-items-center rounded-[13px] border border-[color-mix(in_oklch,var(--a)_40%,transparent)] bg-[color-mix(in_oklch,var(--a)_20%,transparent)] text-[var(--a)]',
          unread ? 'shadow-[0_0_16px_-4px_var(--a)]' : '',
        ].join(' ')}
      >
        {k.icon}
      </span>
      <span className="relative min-w-0">
        <span
          className={[
            'block truncate text-[15px]',
            unread ? 'font-medium text-foreground' : 'text-ink-300',
          ].join(' ')}
        >
          {n.title}
        </span>
        <span className="mt-1 line-clamp-2 font-mono text-[10.5px] tracking-[0.08em] text-ink-300 uppercase">
          {n.body}
        </span>
      </span>
      <span className="relative ml-auto flex shrink-0 flex-col items-end gap-2 self-stretch justify-between font-mono text-[11px] text-ink-400">
        {time(n.sentAt)}
        {unread ? (
          <span
            data-testid="bell-unread"
            className="nt-live inline-flex items-center gap-1.5 rounded-full border border-current bg-lav-400/10 px-2 py-[2px] text-[9px] tracking-[0.12em] text-lav-400"
          >
            NEW
          </span>
        ) : (
          <span className="motion-pop inline-flex items-center gap-1 rounded-full border border-current bg-state-good/10 px-2 py-[2px] text-[9px] tracking-[0.12em] text-state-good">
            ✓ SEEN
          </span>
        )}
      </span>
    </button>
  )
}

function Devices({
  iphone,
  mac,
  onSetup,
}: {
  iphone: boolean
  mac: boolean
  onSetup: () => void
}) {
  const here =
    typeof navigator === 'undefined' ? 'other' : deviceOf(navigator.userAgent)
  const qr = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : renderSVG(`${window.location.origin}/phone`, { border: 1 }),
    [],
  )
  const dev = (label: string, icon: React.ReactNode, on: boolean) => (
    <button
      type="button"
      onClick={onSetup}
      className="glass flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-[12.5px] transition-transform hover:-translate-y-0.5"
    >
      {icon}
      {label}
      <span
        className={[
          'ml-auto inline-flex items-center gap-1.5 rounded-full border border-current px-2 py-[2px] font-mono text-[9px] tracking-[0.12em]',
          on
            ? 'nt-live bg-state-good/10 text-state-good'
            : 'bg-lift/5 text-ink-400',
        ].join(' ')}
      >
        {on ? 'ON' : 'NOT ON'}
      </span>
    </button>
  )
  /* On the iPhone itself a QR is no use: the row opens the setup. */
  if (!iphone && here !== 'iphone') {
    return (
      <div
        data-testid="bell-qr"
        className="glass flex items-center gap-4 rounded-[14px] p-3.5"
      >
        <div className="relative shrink-0 overflow-hidden rounded-[12px] bg-[#fff] p-2 shadow-[0_0_30px_-8px_var(--system-shine)]">
          <div
            className="size-[118px] [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <span className="nt-qr-scan" />
        </div>
        <div className="flex flex-col items-start gap-2">
          <span className="nt-live inline-flex items-center gap-1.5 rounded-full border border-current bg-state-warn/10 px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] text-state-warn">
            NO IPHONE
          </span>
          <span className="font-mono text-[9.5px] tracking-[0.16em] text-ink-200">
            IPHONE CAMERA → CODE
          </span>
          {dev('Mac', <Laptop className="size-4" />, mac)}
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {dev('iPhone', <Smartphone className="size-4" />, iphone)}
      {dev('Mac', <Laptop className="size-4" />, mac)}
    </div>
  )
}

export function Bell() {
  const [open, setOpen] = useState(false)
  const [ring, setRing] = useState(false)
  const since = useMemo(midnight, [])
  const today = useQuery(api.notifications.today, { since })
  const devices = useQuery(api.push.devices, {})
  const markRead = useMutation(api.notifications.markRead)
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)

  const rows = today ?? []
  const unread = rows.filter((n) => n.readAt === undefined).length

  /* The home screen icon shows the same count, and loses it when read. */
  useEffect(() => {
    if (today === undefined) return
    /* Safari outside the home screen app, and Firefox, have none. */
    if (!('setAppBadge' in navigator)) return
    const done =
      unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()
    done.catch(() => {})
  }, [today, unread])

  /* A new one arriving rings the bell. */
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (today === undefined) return
    const newest = today[0]?.sentAt ?? 0
    if (seen.current !== null && newest > seen.current) {
      setRing(true)
      const t = setTimeout(() => setRing(false), 1100)
      seen.current = newest
      return () => clearTimeout(t)
    }
    seen.current = newest
  }, [today])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  /* The row flips to SEEN first, then its screen opens; already on that
     screen, the bell stays open so the flip is what answers. */
  const openRow = (n: Doc<'notifications'>) => {
    if (n.readAt === undefined) void markRead({ id: n._id })
    if (window.location.pathname === n.url) return
    setTimeout(() => {
      setOpen(false)
      void navigate({ to: n.url })
    }, 350)
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className={[
          'relative grid size-9 place-items-center rounded-[10px] border border-lift/10 transition-colors',
          open
            ? 'bg-lav-400/15 text-lav-300 shadow-[0_0_18px_-6px_var(--system-shine)]'
            : unread > 0
              ? 'border-lav-400/45 bg-lav-400/10 text-lav-300'
              : 'bg-sink/20 text-ink-400 hover:text-lav-300',
          /* A new one swings it hard once; while any is unread it rings
             again every few seconds, glowing (15 Oct, his ask). */
          ring ? 'nt-ring' : unread > 0 && !open ? 'nt-ring-loop' : '',
        ].join(' ')}
      >
        <BellIcon className="size-4" />
        {unread > 0 ? (
          <span
            data-testid="bell-count"
            className="motion-pop absolute -top-1 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-lav-400 px-1 font-mono text-[10px] font-semibold text-lav-900 shadow-[0_0_10px_var(--system-shine)]"
          >
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          data-testid="bell-panel"
          className="system-frame system-open fixed inset-x-3 top-[64px] z-40 flex max-h-[calc(100dvh-220px)] flex-col gap-2.5 overflow-y-auto rounded-[18px] bg-popover p-3.5 md:absolute md:inset-x-auto md:top-[46px] md:right-0 md:max-h-none md:w-[420px] md:overflow-visible"
        >
          <div className="flex items-center gap-2">
            <span className="system-title">[ TODAY ]</span>
            {unread > 0 ? (
              <span className="nt-live ml-auto inline-flex items-center gap-1.5 rounded-full border border-current bg-lav-400/10 px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] text-lav-400">
                {unread} NEW
              </span>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-7">
              <span className="grid size-16 place-items-center rounded-[20px] border border-lift/10 bg-lift/[0.04] text-ink-500">
                <BellIcon className="size-7" />
              </span>
              <span className="rounded-full border border-current px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] text-ink-400">
                NOTHING TODAY
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 md:max-h-[60vh] md:overflow-y-auto">
              <span className="mx-0.5 mt-1 font-mono text-[9px] tracking-[0.2em] text-ink-500">
                NOW
              </span>
              <Row n={rows[0]} i={0} onOpen={openRow} />
              {rows.length > 1 ? (
                <span className="mx-0.5 mt-1 font-mono text-[9px] tracking-[0.2em] text-ink-500">
                  EARLIER TODAY
                </span>
              ) : null}
              {rows.slice(1).map((n, i) => (
                <Row key={n._id} n={n} i={i + 1} onOpen={openRow} />
              ))}
            </div>
          )}
          {devices ? (
            <Devices
              {...devices}
              onSetup={() => {
                setOpen(false)
                void navigate({ to: '/phone' })
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
